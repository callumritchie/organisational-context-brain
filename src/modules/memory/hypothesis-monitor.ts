import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ELIGIBILITY_RESEARCH_MUTATION } from '@/data/sources/research/eligibility-mutation';
import { withActorTransaction } from '@/src/db/actor-transaction';
import { getIngestionPool } from '@/src/db/pool';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import { assembleContext } from '@/src/modules/context/context-service';
import type { ContextResponse } from '@/src/modules/context/types';
import type {
  ContextSnapshotProjection,
  DerivedMemoryCandidate,
  EvidenceDelta,
  MemoryState,
  SnapshotEvidence,
} from './types';

export const DEFAULT_MONITOR_QUERY =
  "What do we currently know about why users abandon Atlas Bank's onboarding journey?";
export const HYPOTHESIS_MONITOR_PROCESS = {
  name: 'deterministic-hypothesis-monitor',
  version: '1.0.0',
} as const;

const serviceActor = {
  id: IDS.users.memoryAgent,
  workspaceId: IDS.workspace,
  name: 'Hypothesis Monitor',
  role: 'System',
};

function normalizedName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function projectContext(
  context: ContextResponse,
): ContextSnapshotProjection {
  return {
    traceId: context.traceId,
    summary: context.summary,
    epistemicStatus: context.epistemicState.status,
    supportingEvidence: context.epistemicState.supportingEvidence,
    contradictingEvidence: context.epistemicState.contradictingEvidence,
    evidence: context.evidence
      .map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        stance: item.stance,
        confidence: item.confidence,
        assertionId: item.provenance.assertionId,
        sourceTitle: item.source.title,
        sourceUri: item.source.uri,
        sourceUpdatedAt: item.source.updatedAt,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function snapshotHash(snapshot: ContextSnapshotProjection) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        epistemicStatus: snapshot.epistemicStatus,
        supportingEvidence: snapshot.supportingEvidence,
        contradictingEvidence: snapshot.contradictingEvidence,
        evidence: snapshot.evidence,
      }),
    )
    .digest('hex');
}

export function compareSnapshots(
  previous: ContextSnapshotProjection,
  current: ContextSnapshotProjection,
): EvidenceDelta[] {
  const before = new Map(previous.evidence.map((item) => [item.id, item]));
  const after = new Map(current.evidence.map((item) => [item.id, item]));
  const deltas: EvidenceDelta[] = [];
  for (const evidence of current.evidence) {
    const prior = before.get(evidence.id);
    if (!prior) {
      deltas.push({
        type: 'added',
        evidence,
        previousStance: null,
        currentStance: evidence.stance,
      });
    } else if (prior.stance !== evidence.stance) {
      deltas.push({
        type: 'stance-changed',
        evidence,
        previousStance: prior.stance,
        currentStance: evidence.stance,
      });
    }
  }
  for (const evidence of previous.evidence) {
    if (!after.has(evidence.id)) {
      deltas.push({
        type: 'removed',
        evidence,
        previousStance: evidence.stance,
        currentStance: null,
      });
    }
  }
  return deltas.sort((left, right) =>
    left.evidence.id.localeCompare(right.evidence.id),
  );
}

export function deriveMemoryCandidates(
  deltas: EvidenceDelta[],
): DerivedMemoryCandidate[] {
  return deltas.flatMap((delta) => {
    if (delta.type === 'removed') return [];
    const contradictory = delta.currentStance === 'CONTRADICTS';
    return [
      {
        kind: contradictory
          ? ('counter-hypothesis' as const)
          : ('supporting-memory' as const),
        statement: contradictory
          ? `Alternative explanation to test: ${delta.evidence.title}.`
          : `Emerging evidence pattern to retain: ${delta.evidence.title}.`,
        rationale: contradictory
          ? `This newly visible evidence challenges the monitored explanation. It is proposed for testing, not asserted as fact: ${delta.evidence.summary}`
          : `This newly visible evidence reinforces the monitored explanation and may be worth retaining across future questions: ${delta.evidence.summary}`,
        confidence: Math.round(delta.evidence.confidence * 0.9 * 100) / 100,
        evidence: delta.evidence,
      },
    ];
  });
}

function projectionWithoutPreparedMutation(current: ContextSnapshotProjection) {
  const mutationEvidenceId = stableId(
    'evidence-resource',
    ELIGIBILITY_RESEARCH_MUTATION.externalId,
  );
  const evidence = current.evidence.filter(
    (item) => item.id !== mutationEvidenceId,
  );
  if (evidence.length === current.evidence.length) return null;
  const supportingEvidence = evidence.filter(
    (item) => item.stance === 'SUPPORTS',
  ).length;
  const contradictingEvidence = evidence.filter(
    (item) => item.stance === 'CONTRADICTS',
  ).length;
  return {
    ...current,
    traceId: null,
    summary:
      'Historical checkpoint reconstructed before the prepared research mutation.',
    epistemicStatus:
      supportingEvidence === 0
        ? ('insufficient' as const)
        : contradictingEvidence > 0
          ? ('contested' as const)
          : ('supported' as const),
    supportingEvidence,
    contradictingEvidence,
    evidence,
  };
}

async function inMonitorTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
) {
  const client = await getIngestionPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_id', $1, true)", [
      IDS.users.memoryAgent,
    ]);
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      IDS.workspace,
    ]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function ensurePolicy(client: PoolClient) {
  await client.query(
    `INSERT INTO monitor_policies
      (id, workspace_id, access_scope_id, hypothesis_resource_id, owner_actor_id,
       service_actor_id, name, query_text, trigger_policy, materiality_policy,
       review_policy, stop_conditions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
    [
      IDS.monitors.atlasAbandonment,
      IDS.workspace,
      IDS.scopes.everyone,
      IDS.resources.hypothesis,
      IDS.users.alex,
      IDS.users.memoryAgent,
      'Atlas abandonment explanation',
      DEFAULT_MONITOR_QUERY,
      { event: 'source-version-changed', sources: [IDS.sources.research] },
      { evidenceDelta: 1, epistemicStateChange: true },
      { required: true, reviewer: IDS.users.alex, autoPromote: false },
      { maxRunsPerEvent: 1, pauseOnFailure: false },
    ],
  );
}

async function insertSnapshot(
  client: PoolClient,
  snapshot: ContextSnapshotProjection,
  options: { id: string; runId?: string },
) {
  await client.query(
    `INSERT INTO context_snapshots
      (id, workspace_id, access_scope_id, monitor_policy_id, monitor_run_id, trace_id,
       context_hash, epistemic_status, supporting_evidence, contradicting_evidence, evidence_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO NOTHING`,
    [
      options.id,
      IDS.workspace,
      IDS.scopes.everyone,
      IDS.monitors.atlasAbandonment,
      options.runId ?? null,
      snapshot.traceId,
      snapshotHash(snapshot),
      snapshot.epistemicStatus,
      snapshot.supportingEvidence,
      snapshot.contradictingEvidence,
      snapshot,
    ],
  );
}

export async function initializeDefaultMonitor(
  options: { catchUpPreparedMutation?: boolean } = {},
) {
  const current = projectContext(
    await assembleContext(
      serviceActor,
      { query: DEFAULT_MONITOR_QUERY, maxEvidence: 6 },
      { allowExternalEmbeddings: false },
    ),
  );
  const created = await inMonitorTransaction(async (client) => {
    await ensurePolicy(client);
    const existing = await client.query<{ latest_snapshot_id: string | null }>(
      'SELECT latest_snapshot_id FROM monitor_policies WHERE id = $1 FOR UPDATE',
      [IDS.monitors.atlasAbandonment],
    );
    if (existing.rows[0]?.latest_snapshot_id) return false;
    const baseline = options.catchUpPreparedMutation
      ? (projectionWithoutPreparedMutation(current) ?? current)
      : current;
    const snapshotId = stableId(
      'monitor-snapshot',
      `baseline:${snapshotHash(baseline)}`,
    );
    await insertSnapshot(client, baseline, { id: snapshotId });
    await client.query(
      'UPDATE monitor_policies SET latest_snapshot_id = $2, updated_at = now() WHERE id = $1',
      [IDS.monitors.atlasAbandonment, snapshotId],
    );
    return baseline.evidence.length !== current.evidence.length;
  });
  if (created) {
    return recordAndEvaluateSourceChange({
      sourceId: IDS.sources.research,
      triggerRef: 'bootstrap:prepared-research-mutation',
      changedObjects: 1,
    });
  }
  return getMemoryState(serviceActor);
}

export async function recordAndEvaluateSourceChange(input: {
  sourceId: string;
  triggerRef: string;
  changedObjects: number;
}) {
  if (input.changedObjects < 1) return getMemoryState(serviceActor);
  const eventId = stableId('source-change-event', input.triggerRef);
  await inMonitorTransaction(async (client) => {
    await ensurePolicy(client);
    await client.query(
      `INSERT INTO source_change_events
        (id, workspace_id, access_scope_id, source_id, trigger_ref, changed_objects)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (workspace_id, trigger_ref) DO NOTHING`,
      [
        eventId,
        IDS.workspace,
        IDS.scopes.everyone,
        input.sourceId,
        input.triggerRef,
        input.changedObjects,
      ],
    );
  });
  await evaluateSourceChange(eventId);
  return getMemoryState(serviceActor);
}

async function evaluateSourceChange(eventId: string) {
  const existing = await inMonitorTransaction(async (client) =>
    client.query<{ id: string }>(
      'SELECT id FROM monitor_runs WHERE monitor_policy_id = $1 AND source_change_event_id = $2',
      [IDS.monitors.atlasAbandonment, eventId],
    ),
  );
  if (existing.rows[0]) return;

  const current = projectContext(
    await assembleContext(
      serviceActor,
      { query: DEFAULT_MONITOR_QUERY, maxEvidence: 6 },
      { allowExternalEmbeddings: false },
    ),
  );
  await inMonitorTransaction(async (client) => {
    const policyResult = await client.query<{
      latest_snapshot_id: string | null;
    }>(
      'SELECT latest_snapshot_id FROM monitor_policies WHERE id = $1 FOR UPDATE',
      [IDS.monitors.atlasAbandonment],
    );
    const beforeSnapshotId = policyResult.rows[0]?.latest_snapshot_id;
    if (!beforeSnapshotId)
      throw new Error('The monitor has no baseline checkpoint');
    const beforeResult = await client.query<{
      evidence_payload: ContextSnapshotProjection;
    }>('SELECT evidence_payload FROM context_snapshots WHERE id = $1', [
      beforeSnapshotId,
    ]);
    const before = beforeResult.rows[0]?.evidence_payload;
    if (!before) throw new Error('The monitor baseline could not be read');
    const runId = stableId(
      'monitor-run',
      `${IDS.monitors.atlasAbandonment}:${eventId}`,
    );
    const deltas = compareSnapshots(before, current);
    const candidates = deriveMemoryCandidates(deltas);
    const epistemicChanged = before.epistemicStatus !== current.epistemicStatus;
    const material = deltas.length > 0 || epistemicChanged;
    const rationale = material
      ? `${deltas.length} evidence change${deltas.length === 1 ? '' : 's'} detected; epistemic state ${epistemicChanged ? `changed from ${before.epistemicStatus} to ${current.epistemicStatus}` : 'did not change'}.`
      : 'The source event did not change the permission-scoped context packet.';
    await client.query(
      `INSERT INTO monitor_runs
        (id, workspace_id, access_scope_id, monitor_policy_id, source_change_event_id,
         service_actor_id, status, material, before_snapshot_id, rationale)
       VALUES ($1, $2, $3, $4, $5, $6, 'running', $7, $8, $9)`,
      [
        runId,
        IDS.workspace,
        IDS.scopes.everyone,
        IDS.monitors.atlasAbandonment,
        eventId,
        IDS.users.memoryAgent,
        material,
        beforeSnapshotId,
        rationale,
      ],
    );
    const afterSnapshotId = stableId(
      'monitor-snapshot',
      `${runId}:${snapshotHash(current)}`,
    );
    await insertSnapshot(client, current, { id: afterSnapshotId, runId });
    for (const delta of deltas) {
      await client.query(
        `INSERT INTO evidence_deltas
          (id, workspace_id, access_scope_id, monitor_run_id, evidence_resource_id,
           delta_type, previous_stance, current_stance, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          stableId(
            'evidence-delta',
            `${runId}:${delta.type}:${delta.evidence.id}`,
          ),
          IDS.workspace,
          IDS.scopes.everyone,
          runId,
          delta.evidence.id,
          delta.type,
          delta.previousStance,
          delta.currentStance,
          delta.evidence,
        ],
      );
    }
    for (const candidate of candidates) {
      const candidateId = stableId(
        'memory-candidate',
        `${runId}:${candidate.kind}:${candidate.evidence.id}`,
      );
      await client.query(
        `INSERT INTO memory_candidates
          (id, workspace_id, access_scope_id, monitor_policy_id, monitor_run_id,
           hypothesis_resource_id, evidence_resource_id, evidence_assertion_id,
           candidate_kind, statement, rationale, confidence, process_name, process_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO NOTHING`,
        [
          candidateId,
          IDS.workspace,
          IDS.scopes.everyone,
          IDS.monitors.atlasAbandonment,
          runId,
          IDS.resources.hypothesis,
          candidate.evidence.id,
          candidate.evidence.assertionId,
          candidate.kind,
          candidate.statement,
          candidate.rationale,
          candidate.confidence,
          HYPOTHESIS_MONITOR_PROCESS.name,
          HYPOTHESIS_MONITOR_PROCESS.version,
        ],
      );
    }
    await client.query(
      `UPDATE monitor_runs SET status = $2, after_snapshot_id = $3, finished_at = now()
       WHERE id = $1`,
      [runId, material ? 'completed' : 'no-change', afterSnapshotId],
    );
    await client.query(
      `UPDATE monitor_policies SET latest_snapshot_id = $2, updated_at = now() WHERE id = $1`,
      [IDS.monitors.atlasAbandonment, afterSnapshotId],
    );
    await client.query(
      `UPDATE source_change_events SET status = 'processed', processed_at = now() WHERE id = $1`,
      [eventId],
    );
  });
}

export async function getMemoryState(actor: {
  id: string;
  workspaceId: string;
  name: string;
  role: string;
}): Promise<MemoryState> {
  return withActorTransaction(
    { actorId: actor.id, workspaceId: actor.workspaceId },
    async (client) => {
      const policyResult = await client.query<{
        id: string;
        name: string;
        status: 'active' | 'paused' | 'stopped';
        hypothesis_resource_id: string;
        hypothesis: string;
        owner_actor_id: string;
        service_actor_id: string;
        query_text: string;
        trigger_policy: { event?: string };
        review_policy: { required?: boolean };
        latest_snapshot_id: string | null;
      }>(
        `SELECT policy.*, hypothesis.canonical_name AS hypothesis
       FROM monitor_policies policy
       JOIN resources hypothesis ON hypothesis.id = policy.hypothesis_resource_id
       WHERE policy.id = $1`,
        [IDS.monitors.atlasAbandonment],
      );
      const policy = policyResult.rows[0];
      if (!policy)
        return {
          configured: false,
          policy: null,
          checkpoint: null,
          latestRun: null,
          candidates: [],
        };

      const [checkpointResult, runResult, candidateResult] = await Promise.all([
        policy.latest_snapshot_id
          ? client.query<{
              id: string;
              epistemic_status: 'supported' | 'contested' | 'insufficient';
              supporting_evidence: number;
              contradicting_evidence: number;
              evidence_payload: ContextSnapshotProjection;
              created_at: Date;
            }>('SELECT * FROM context_snapshots WHERE id = $1', [
              policy.latest_snapshot_id,
            ])
          : Promise.resolve({ rows: [] }),
        client.query<{
          id: string;
          status: 'running' | 'completed' | 'no-change' | 'failed';
          material: boolean;
          rationale: string | null;
          started_at: Date;
          finished_at: Date | null;
          trigger_ref: string;
          before_status: 'supported' | 'contested' | 'insufficient' | null;
          before_supporting: number | null;
          before_contradicting: number | null;
          after_status: 'supported' | 'contested' | 'insufficient' | null;
          after_supporting: number | null;
          after_contradicting: number | null;
        }>(
          `SELECT run.*, event.trigger_ref,
           before_snapshot.epistemic_status AS before_status,
           before_snapshot.supporting_evidence AS before_supporting,
           before_snapshot.contradicting_evidence AS before_contradicting,
           after_snapshot.epistemic_status AS after_status,
           after_snapshot.supporting_evidence AS after_supporting,
           after_snapshot.contradicting_evidence AS after_contradicting
         FROM monitor_runs run
         JOIN source_change_events event ON event.id = run.source_change_event_id
         LEFT JOIN context_snapshots before_snapshot ON before_snapshot.id = run.before_snapshot_id
         LEFT JOIN context_snapshots after_snapshot ON after_snapshot.id = run.after_snapshot_id
         WHERE run.monitor_policy_id = $1
         ORDER BY run.started_at DESC LIMIT 1`,
          [policy.id],
        ),
        client.query<{
          id: string;
          candidate_kind:
            | 'counter-hypothesis'
            | 'supporting-memory'
            | 'qualifying-memory';
          statement: string;
          rationale: string;
          confidence: number;
          status: 'proposed' | 'accepted' | 'dismissed' | 'superseded';
          evidence_title: string;
          source_uri: string;
          process_name: string;
          process_version: string;
          promoted_resource_id: string | null;
          created_at: Date;
        }>(
          `SELECT candidate.*, evidence.canonical_name AS evidence_title, source_object.source_uri
         FROM memory_candidates candidate
         JOIN resources evidence ON evidence.id = candidate.evidence_resource_id
         JOIN assertions evidence_assertion ON evidence_assertion.id = candidate.evidence_assertion_id
         JOIN source_object_versions source_version ON source_version.id = evidence_assertion.source_object_version_id
         JOIN source_objects source_object ON source_object.id = source_version.source_object_id
         WHERE candidate.monitor_policy_id = $1
         ORDER BY candidate.created_at DESC LIMIT 8`,
          [policy.id],
        ),
      ]);
      const run = runResult.rows[0];
      const deltas = run
        ? await client.query<{
            id: string;
            delta_type: EvidenceDelta['type'];
            current_stance: SnapshotEvidence['stance'] | null;
            payload: SnapshotEvidence;
          }>(
            'SELECT id, delta_type, current_stance, payload FROM evidence_deltas WHERE monitor_run_id = $1 ORDER BY created_at',
            [run.id],
          )
        : { rows: [] };
      const checkpoint = checkpointResult.rows[0];
      return {
        configured: true,
        policy: {
          id: policy.id,
          name: policy.name,
          status: policy.status,
          hypothesisId: policy.hypothesis_resource_id,
          hypothesis: policy.hypothesis,
          ownerActorId: policy.owner_actor_id,
          serviceActorId: policy.service_actor_id,
          query: policy.query_text,
          trigger: policy.trigger_policy.event ?? 'source-version-changed',
          reviewRequired: policy.review_policy.required !== false,
        },
        checkpoint: checkpoint
          ? {
              id: checkpoint.id,
              epistemicStatus: checkpoint.epistemic_status,
              supportingEvidence: checkpoint.supporting_evidence,
              contradictingEvidence: checkpoint.contradicting_evidence,
              evidenceCount: checkpoint.evidence_payload.evidence.length,
              capturedAt: checkpoint.created_at.toISOString(),
            }
          : null,
        latestRun: run
          ? {
              id: run.id,
              status: run.status,
              material: run.material,
              triggerRef: run.trigger_ref,
              rationale: run.rationale,
              startedAt: run.started_at.toISOString(),
              finishedAt: run.finished_at?.toISOString() ?? null,
              before: run.before_status
                ? {
                    epistemicStatus: run.before_status,
                    supportingEvidence: run.before_supporting ?? 0,
                    contradictingEvidence: run.before_contradicting ?? 0,
                  }
                : null,
              after: run.after_status
                ? {
                    epistemicStatus: run.after_status,
                    supportingEvidence: run.after_supporting ?? 0,
                    contradictingEvidence: run.after_contradicting ?? 0,
                  }
                : null,
              deltas: deltas.rows.map((delta) => ({
                id: delta.id,
                type: delta.delta_type,
                title: delta.payload.title,
                stance: delta.current_stance,
                sourceUri: delta.payload.sourceUri,
              })),
            }
          : null,
        candidates: candidateResult.rows.map((candidate) => ({
          id: candidate.id,
          kind: candidate.candidate_kind,
          statement: candidate.statement,
          rationale: candidate.rationale,
          confidence: candidate.confidence,
          status: candidate.status,
          evidenceTitle: candidate.evidence_title,
          sourceUri: candidate.source_uri,
          process: `${candidate.process_name}@${candidate.process_version}`,
          promotedResourceId: candidate.promoted_resource_id,
          createdAt: candidate.created_at.toISOString(),
        })),
      };
    },
  );
}

export class MemoryReviewPermissionError extends Error {}

export async function reviewMemoryCandidate(
  actor: { id: string; workspaceId: string; name: string; role: string },
  candidateId: string,
  decision: 'accept' | 'dismiss',
) {
  if (actor.id !== IDS.users.alex || actor.role !== 'Project Lead') {
    throw new MemoryReviewPermissionError(
      'Only the demo Project Lead can review memory proposals',
    );
  }
  await inMonitorTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      access_scope_id: string;
      statement: string;
      rationale: string;
      confidence: number;
      status: 'proposed' | 'accepted' | 'dismissed' | 'superseded';
      evidence_resource_id: string;
      evidence_assertion_id: string;
      source_object_version_id: string;
      excerpt: string;
    }>(
      `SELECT candidate.*, evidence_assertion.source_object_version_id, provenance.excerpt
       FROM memory_candidates candidate
       JOIN assertions evidence_assertion ON evidence_assertion.id = candidate.evidence_assertion_id
       JOIN provenance_spans provenance ON provenance.assertion_id = evidence_assertion.id
       WHERE candidate.id = $1 FOR UPDATE`,
      [candidateId],
    );
    const candidate = result.rows[0];
    if (!candidate) throw new Error('Memory candidate was not found');
    if (candidate.status !== 'proposed') return;
    if (decision === 'dismiss') {
      await client.query(
        `UPDATE memory_candidates SET status = 'dismissed', reviewed_by = $2,
         reviewed_at = now(), review_note = 'Dismissed in the demo review flow', updated_at = now()
         WHERE id = $1`,
        [candidate.id, actor.id],
      );
      return;
    }
    const promotedResourceId = stableId(
      'promoted-memory-resource',
      candidate.id,
    );
    const relationshipId = stableId(
      'relationship',
      `${candidate.evidence_resource_id}:SUPPORTS:${promotedResourceId}`,
    );
    const assertionId = stableId(
      'assertion',
      `${candidate.id}:${relationshipId}:human-reviewed-memory`,
    );
    await client.query(
      `INSERT INTO resources
        (id, workspace_id, access_scope_id, resource_kind, semantic_type, canonical_name, summary, properties)
       VALUES ($1, $2, $3, 'entity', 'Hypothesis', $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        promotedResourceId,
        IDS.workspace,
        candidate.access_scope_id,
        candidate.statement,
        candidate.rationale,
        { memoryCandidateId: candidate.id, review: 'human-approved' },
      ],
    );
    await client.query(
      `INSERT INTO entities (resource_id, normalized_name) VALUES ($1, $2)
       ON CONFLICT (resource_id) DO NOTHING`,
      [promotedResourceId, normalizedName(candidate.statement)],
    );
    await client.query(
      `INSERT INTO relationships
        (id, workspace_id, from_resource_id, to_resource_id, relationship_type)
       VALUES ($1, $2, $3, $4, 'SUPPORTS')
       ON CONFLICT (workspace_id, from_resource_id, to_resource_id, relationship_type) DO NOTHING`,
      [
        relationshipId,
        IDS.workspace,
        candidate.evidence_resource_id,
        promotedResourceId,
      ],
    );
    await client.query(
      `INSERT INTO assertions
        (id, workspace_id, access_scope_id, subject_resource_id, predicate, object_resource_id,
         relationship_id, value, assertion_kind, source_object_version_id, process_name,
         process_version, confidence, valid_from)
       VALUES ($1, $2, $3, $4, 'SUPPORTS', $5, $6, $7, 'rule-derived', $8,
         'human-reviewed-memory-promotion', '1.0.0', $9, now())
       ON CONFLICT (id) DO NOTHING`,
      [
        assertionId,
        IDS.workspace,
        candidate.access_scope_id,
        candidate.evidence_resource_id,
        promotedResourceId,
        relationshipId,
        { candidateId: candidate.id, reviewer: actor.id },
        candidate.source_object_version_id,
        candidate.confidence,
      ],
    );
    await client.query(
      `INSERT INTO provenance_spans
        (id, workspace_id, assertion_id, source_object_version_id, start_offset, end_offset, excerpt)
       VALUES ($1, $2, $3, $4, 0, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        stableId('provenance', assertionId),
        IDS.workspace,
        assertionId,
        candidate.source_object_version_id,
        candidate.excerpt.length,
        candidate.excerpt,
      ],
    );
    await client.query(
      `UPDATE memory_candidates SET status = 'accepted', reviewed_by = $2, reviewed_at = now(),
       review_note = 'Accepted and promoted to a canonical Hypothesis Resource',
       promoted_resource_id = $3, updated_at = now() WHERE id = $1`,
      [candidate.id, actor.id, promotedResourceId],
    );
  });
  return getMemoryState(actor);
}

export function newSourceTriggerRef(runId: string) {
  return `sync-run:${runId}`;
}

export function newManualTriggerRef() {
  return `manual:${randomUUID()}`;
}
