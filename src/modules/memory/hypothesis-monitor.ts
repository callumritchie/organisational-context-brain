import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ELIGIBILITY_RESEARCH_MUTATION } from '@/data/sources/research/eligibility-mutation';
import { withActorTransaction } from '@/src/db/actor-transaction';
import { getIngestionPool } from '@/src/db/pool';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import {
  actorHasCapability,
  type ActorCapability,
} from '@/src/modules/identity/authorization';
import { assembleContext } from '@/src/modules/context/context-service';
import type { ContextResponse } from '@/src/modules/context/types';
import {
  ensureHypothesisLifecycle,
  recordHypothesisEvaluation,
  registerPromotedHypothesis,
} from '@/src/modules/hypotheses/lifecycle';
import {
  ensureBackgroundRoutePolicy,
  recordDeterministicRouteDecision,
} from '@/src/modules/model-routing/model-router';
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
  hypothesisResourceId: string = IDS.resources.hypothesis,
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
        proposedScope: {
          monitoredHypothesisId: hypothesisResourceId,
          evidenceResourceId: delta.evidence.id,
          source: delta.evidence.sourceUri,
        },
        predictions: contradictory
          ? [
              'Additional permitted sources should show the alternative cause before or alongside abandonment.',
              'Addressing the alternative cause should reduce abandonment even when identity verification is unchanged.',
            ]
          : [
              'Additional permitted sources should reproduce this evidence pattern.',
              'Reducing the observed friction should reduce abandonment.',
            ],
        falsificationConditions: contradictory
          ? [
              'The pattern does not recur in another independent source.',
              'The observed effect disappears after controlling for identity-verification friction.',
            ]
          : [
              'A higher-authority source reverses the relationship.',
              'The pattern becomes stale or cannot be reproduced.',
            ],
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

export async function inMonitorTransaction<T>(
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
  await ensureBackgroundRoutePolicy(client);
  await ensureHypothesisLifecycle(client);
  await client.query(
    `INSERT INTO monitor_policies
      (id, workspace_id, access_scope_id, hypothesis_resource_id, owner_actor_id,
       service_actor_id, name, query_text, trigger_policy, materiality_policy,
       review_policy, stop_conditions, model_route_policy_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       trigger_policy = EXCLUDED.trigger_policy,
       model_route_policy_id = EXCLUDED.model_route_policy_id,
       updated_at = now()`,
    [
      IDS.monitors.atlasAbandonment,
      IDS.workspace,
      IDS.scopes.everyone,
      IDS.resources.hypothesis,
      IDS.users.alex,
      IDS.users.memoryAgent,
      'Atlas abandonment explanation',
      DEFAULT_MONITOR_QUERY,
      {
        event: 'source-version-changed',
        sources: [
          IDS.sources.research,
          IDS.sources.meetings,
          IDS.sources.crm,
          IDS.sources.documents,
          IDS.sources.messages,
        ],
      },
      { evidenceDelta: 1, epistemicStateChange: true },
      { required: true, reviewer: IDS.users.alex, autoPromote: false },
      { maxRunsPerEvent: 1, pauseOnFailure: false },
      IDS.modelPolicies.background,
    ],
  );
  await client.query(
    `INSERT INTO monitor_schedules
      (id, workspace_id, access_scope_id, monitor_policy_id, interval_seconds, enabled, next_due_at)
     VALUES ($1, $2, $3, $4, 86400, true, now() + interval '1 day')
     ON CONFLICT (monitor_policy_id) DO NOTHING`,
    [
      IDS.monitorSchedules.atlasAbandonment,
      IDS.workspace,
      IDS.scopes.everyone,
      IDS.monitors.atlasAbandonment,
    ],
  );
  await client.query(
    `INSERT INTO notification_outbox
      (id, workspace_id, access_scope_id, monitor_policy_id, memory_candidate_id,
       recipient_actor_id, notification_type, severity, deduplication_key, payload)
     SELECT md5('review-required:' || candidate.id::text)::uuid, candidate.workspace_id,
       candidate.access_scope_id, candidate.monitor_policy_id, candidate.id,
       policy.owner_actor_id, 'review-required', 'attention',
       'review-required:' || candidate.id::text,
       jsonb_build_object('title', 'A monitored hypothesis has new material evidence',
         'candidateId', candidate.id, 'candidateKind', candidate.candidate_kind,
         'statement', candidate.statement)
     FROM memory_candidates candidate
     JOIN monitor_policies policy ON policy.id = candidate.monitor_policy_id
     WHERE candidate.monitor_policy_id = $1 AND candidate.status = 'proposed'
     ON CONFLICT (workspace_id, deduplication_key) DO NOTHING`,
    [IDS.monitors.atlasAbandonment],
  );
  await client.query(
    `INSERT INTO notification_outbox
      (id, workspace_id, access_scope_id, monitor_policy_id, recipient_actor_id,
       notification_type, severity, deduplication_key, payload)
     SELECT md5('lifecycle-change:' || transition.id::text)::uuid,
       transition.workspace_id, transition.access_scope_id, policy.id,
       policy.owner_actor_id, 'lifecycle-change', 'attention',
       'lifecycle-change:' || transition.id::text,
       jsonb_build_object('title', 'Hypothesis evidence state changed',
         'from', transition.from_state, 'to', transition.to_state)
     FROM hypothesis_transitions transition
     JOIN monitor_policies policy
       ON policy.hypothesis_resource_id = transition.hypothesis_resource_id
     WHERE policy.id = $1 AND transition.transition_kind = 'epistemic'
     ON CONFLICT (workspace_id, deduplication_key) DO NOTHING`,
    [IDS.monitors.atlasAbandonment],
  );
}

export interface HypothesisMonitorDefinition {
  hypothesisResourceId: string;
  accessScopeId: string;
  ownerActorId: string;
  serviceActorId: string;
  name: string;
  query: string;
  sourceIds: string[];
  statement?: string;
  predictions?: string[];
  falsificationConditions?: string[];
  intervalSeconds?: number;
}

export async function createHypothesisMonitor(
  definition: HypothesisMonitorDefinition,
) {
  if (!definition.sourceIds.length) {
    throw new Error('A hypothesis monitor needs at least one connector source');
  }
  if (definition.serviceActorId !== IDS.users.memoryAgent) {
    throw new Error(
      'This prototype currently supports the dedicated Hypothesis Monitor service actor',
    );
  }
  const policyId = stableId(
    'monitor-policy',
    `${definition.hypothesisResourceId}:${definition.query}:${definition.accessScopeId}`,
  );
  const routePolicyId = stableId('model-route-policy', policyId);
  const scheduleId = stableId('monitor-schedule', policyId);
  const actor = await inMonitorTransaction(async (client) => {
    const access = await client.query<{ permitted: boolean }>(
      'SELECT actor_can_access_scope($1) AS permitted',
      [definition.accessScopeId],
    );
    if (!access.rows[0]?.permitted) {
      throw new Error(
        'The configured service actor cannot access this monitor scope',
      );
    }
    const resource = await client.query<{
      canonical_name: string;
      summary: string | null;
      access_scope_id: string;
    }>(
      `SELECT canonical_name, summary, access_scope_id FROM resources
       WHERE id = $1 AND semantic_type = 'Hypothesis'`,
      [definition.hypothesisResourceId],
    );
    if (!resource.rows[0])
      throw new Error('The monitored Hypothesis Resource was not found');
    if (resource.rows[0].access_scope_id !== definition.accessScopeId) {
      throw new Error(
        'The monitor and hypothesis must use the same permission scope',
      );
    }
    const service = await client.query<{ name: string; role_label: string }>(
      'SELECT name, role_label FROM users WHERE id = $1',
      [definition.serviceActorId],
    );
    if (!service.rows[0])
      throw new Error('The monitor service actor was not found');
    await client.query(
      `INSERT INTO model_route_policies
        (id, workspace_id, access_scope_id, name, mode, routing_rules, budget_limits,
         allowed_providers, enabled)
       VALUES ($1, $2, $3, $4, 'deterministic-only', '{}',
         '{"dailyInputTokens":0,"monthlyCostMicros":0,"maximumOutputTokens":0}', '[]', true)
       ON CONFLICT (id) DO NOTHING`,
      [
        routePolicyId,
        IDS.workspace,
        definition.accessScopeId,
        `${definition.name} routing`,
      ],
    );
    await ensureHypothesisLifecycle(client, {
      resourceId: definition.hypothesisResourceId,
      accessScopeId: definition.accessScopeId,
      ownerActorId: definition.ownerActorId,
      statement: definition.statement ?? resource.rows[0].canonical_name,
      predictions: definition.predictions,
      falsificationConditions: definition.falsificationConditions,
      scopeDocument: { query: definition.query },
    });
    await client.query(
      `INSERT INTO monitor_policies
        (id, workspace_id, access_scope_id, hypothesis_resource_id, owner_actor_id,
         service_actor_id, name, query_text, trigger_policy, materiality_policy,
         review_policy, stop_conditions, model_route_policy_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
         '{"evidenceDelta":1,"epistemicStateChange":true}',
         '{"required":true,"autoPromote":false}',
         '{"maxRunsPerEvent":1,"pauseOnFailure":false}', $10)
       ON CONFLICT (id) DO NOTHING`,
      [
        policyId,
        IDS.workspace,
        definition.accessScopeId,
        definition.hypothesisResourceId,
        definition.ownerActorId,
        definition.serviceActorId,
        definition.name,
        definition.query,
        { event: 'source-version-changed', sources: definition.sourceIds },
        routePolicyId,
      ],
    );
    await client.query(
      `INSERT INTO monitor_schedules
        (id, workspace_id, access_scope_id, monitor_policy_id, interval_seconds,
         enabled, next_due_at)
       VALUES ($1, $2, $3, $4, $5, true, now() + make_interval(secs => $5))
       ON CONFLICT (monitor_policy_id) DO NOTHING`,
      [
        scheduleId,
        IDS.workspace,
        definition.accessScopeId,
        policyId,
        Math.max(60, definition.intervalSeconds ?? 86_400),
      ],
    );
    return {
      id: definition.serviceActorId,
      workspaceId: IDS.workspace,
      name: service.rows[0].name,
      role: service.rows[0].role_label,
    };
  });
  const current = projectContext(
    await assembleContext(
      actor,
      { query: definition.query, maxEvidence: 6 },
      { allowExternalEmbeddings: false },
    ),
  );
  await inMonitorTransaction(async (client) => {
    const policy = await client.query<{ latest_snapshot_id: string | null }>(
      'SELECT latest_snapshot_id FROM monitor_policies WHERE id = $1 FOR UPDATE',
      [policyId],
    );
    if (policy.rows[0]?.latest_snapshot_id) return;
    const snapshotId = stableId(
      'monitor-snapshot',
      `${policyId}:baseline:${snapshotHash(current)}`,
    );
    await insertSnapshot(client, current, {
      id: snapshotId,
      policyId,
      accessScopeId: definition.accessScopeId,
    });
    await client.query(
      'UPDATE monitor_policies SET latest_snapshot_id = $2, updated_at = now() WHERE id = $1',
      [policyId, snapshotId],
    );
  });
  return { policyId, routePolicyId, scheduleId };
}

async function insertSnapshot(
  client: PoolClient,
  snapshot: ContextSnapshotProjection,
  options: {
    id: string;
    runId?: string;
    policyId?: string;
    accessScopeId?: string;
  },
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
      options.accessScopeId ?? IDS.scopes.everyone,
      options.policyId ?? IDS.monitors.atlasAbandonment,
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
        (id, workspace_id, access_scope_id, source_id, trigger_ref, changed_objects,
         event_kind, connector_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'source-change', 'legacy-demo-trigger', 'queued')
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
    const idempotencyKey = `event:${IDS.monitors.atlasAbandonment}:${eventId}`;
    await client.query(
      `INSERT INTO monitor_jobs
        (id, workspace_id, access_scope_id, monitor_policy_id, source_change_event_id,
         job_kind, idempotency_key, status, priority, payload)
       VALUES ($1, $2, $3, $4, $5, 'event', $6, 'pending', 70, $7)
       ON CONFLICT (workspace_id, idempotency_key) DO NOTHING`,
      [
        stableId('monitor-job', idempotencyKey),
        IDS.workspace,
        IDS.scopes.everyone,
        IDS.monitors.atlasAbandonment,
        eventId,
        idempotencyKey,
        { sourceId: input.sourceId },
      ],
    );
  });
  const { drainMonitorJobs } = await import('./monitor-worker');
  await drainMonitorJobs({ limit: 1 });
  return getMemoryState(serviceActor);
}

export async function evaluateMonitorEvent(
  eventId: string,
  options: { monitorJobId?: string | null; monitorPolicyId?: string } = {},
) {
  const policyId = options.monitorPolicyId ?? IDS.monitors.atlasAbandonment;
  const configuration = await inMonitorTransaction(async (client) => {
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM monitor_runs WHERE monitor_policy_id = $1 AND source_change_event_id = $2',
      [policyId, eventId],
    );
    if (existing.rows[0]) return null;
    const result = await client.query<{
      query_text: string;
      access_scope_id: string;
      hypothesis_resource_id: string;
      owner_actor_id: string;
      service_actor_id: string;
      model_route_policy_id: string | null;
      service_name: string;
      service_role: string;
    }>(
      `SELECT policy.query_text, policy.access_scope_id, policy.hypothesis_resource_id,
       policy.owner_actor_id, policy.service_actor_id, policy.model_route_policy_id,
       actor.name AS service_name, actor.role_label AS service_role
       FROM monitor_policies policy JOIN users actor ON actor.id = policy.service_actor_id
       WHERE policy.id = $1 AND policy.status = 'active'`,
      [policyId],
    );
    if (!result.rows[0])
      throw new Error('The monitor policy is not active or could not be read');
    return result.rows[0];
  });
  if (!configuration) return;

  const current = projectContext(
    await assembleContext(
      {
        id: configuration.service_actor_id,
        workspaceId: IDS.workspace,
        name: configuration.service_name,
        role: configuration.service_role,
      },
      { query: configuration.query_text, maxEvidence: 6 },
      { allowExternalEmbeddings: false },
    ),
  );
  await inMonitorTransaction(async (client) => {
    const policyResult = await client.query<{
      latest_snapshot_id: string | null;
    }>(
      'SELECT latest_snapshot_id FROM monitor_policies WHERE id = $1 FOR UPDATE',
      [policyId],
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
    const runId = stableId('monitor-run', `${policyId}:${eventId}`);
    const deltas = compareSnapshots(before, current);
    const candidates = deriveMemoryCandidates(
      deltas,
      configuration.hypothesis_resource_id,
    );
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
        configuration.access_scope_id,
        policyId,
        eventId,
        configuration.service_actor_id,
        material,
        beforeSnapshotId,
        rationale,
      ],
    );
    const afterSnapshotId = stableId(
      'monitor-snapshot',
      `${runId}:${snapshotHash(current)}`,
    );
    await insertSnapshot(client, current, {
      id: afterSnapshotId,
      runId,
      policyId,
      accessScopeId: configuration.access_scope_id,
    });
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
          configuration.access_scope_id,
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
           candidate_kind, statement, rationale, confidence, process_name, process_version,
           proposed_scope, predictions, falsification_conditions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           $15, $16, $17)
         ON CONFLICT (id) DO NOTHING`,
        [
          candidateId,
          IDS.workspace,
          configuration.access_scope_id,
          policyId,
          runId,
          configuration.hypothesis_resource_id,
          candidate.evidence.id,
          candidate.evidence.assertionId,
          candidate.kind,
          candidate.statement,
          candidate.rationale,
          candidate.confidence,
          HYPOTHESIS_MONITOR_PROCESS.name,
          HYPOTHESIS_MONITOR_PROCESS.version,
          candidate.proposedScope,
          JSON.stringify(candidate.predictions),
          JSON.stringify(candidate.falsificationConditions),
        ],
      );
      await client.query(
        `INSERT INTO notification_outbox
          (id, workspace_id, access_scope_id, monitor_policy_id, memory_candidate_id,
           recipient_actor_id, notification_type, severity, deduplication_key, payload)
         VALUES ($1, $2, $3, $4, $5, $6, 'review-required', 'attention', $7, $8)
         ON CONFLICT (workspace_id, deduplication_key) DO NOTHING`,
        [
          stableId('notification', `review-required:${candidateId}`),
          IDS.workspace,
          configuration.access_scope_id,
          policyId,
          candidateId,
          configuration.owner_actor_id,
          `review-required:${candidateId}`,
          {
            title: 'A monitored hypothesis has new material evidence',
            candidateId,
            candidateKind: candidate.kind,
            statement: candidate.statement,
          },
        ],
      );
    }
    await recordDeterministicRouteDecision(client, {
      monitorRunId: runId,
      monitorJobId: options.monitorJobId,
      taskFingerprint: `${policyId}:${eventId}:${snapshotHash(current)}`,
      inputCharacters: JSON.stringify(current).length,
      routePolicyId:
        configuration.model_route_policy_id ?? IDS.modelPolicies.background,
      accessScopeId: configuration.access_scope_id,
    });
    const lifecycle = await recordHypothesisEvaluation(client, {
      monitorRunId: runId,
      contextSnapshotId: afterSnapshotId,
      supportingEvidence: current.supportingEvidence,
      contradictingEvidence: current.contradictingEvidence,
      rationale,
      hypothesisResourceId: configuration.hypothesis_resource_id,
      accessScopeId: configuration.access_scope_id,
      actorId: configuration.service_actor_id,
    });
    if (lifecycle.changed) {
      const deduplicationKey = `lifecycle-change:${runId}:${lifecycle.current}`;
      await client.query(
        `INSERT INTO notification_outbox
          (id, workspace_id, access_scope_id, monitor_policy_id, recipient_actor_id,
           notification_type, severity, deduplication_key, payload)
         VALUES ($1, $2, $3, $4, $5, 'lifecycle-change', 'attention', $6, $7)
         ON CONFLICT (workspace_id, deduplication_key) DO NOTHING`,
        [
          stableId('notification', deduplicationKey),
          IDS.workspace,
          configuration.access_scope_id,
          policyId,
          configuration.owner_actor_id,
          deduplicationKey,
          {
            title: 'Hypothesis evidence state changed',
            from: lifecycle.previous,
            to: lifecycle.current,
          },
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
      [policyId, afterSnapshotId],
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
          hypothesis: null,
          operations: null,
          modelRouting: null,
          notifications: [],
          latestRun: null,
          candidates: [],
        };

      const [
        checkpointResult,
        runResult,
        candidateResult,
        hypothesisResult,
        transitionResult,
        jobsResult,
        scheduleResult,
        routeResult,
        usageResult,
        notificationResult,
      ] = await Promise.all([
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
          predictions: string[];
          falsification_conditions: string[];
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
        client.query<{
          lifecycle_status: 'proposed' | 'active' | 'superseded' | 'retired';
          epistemic_status:
            | 'untested'
            | 'insufficient'
            | 'supported'
            | 'contested'
            | 'refuted'
            | 'stale';
          current_revision: number;
          last_evaluated_at: Date | null;
          statement: string;
          predictions: string[];
          falsification_conditions: string[];
        }>(
          `SELECT record.lifecycle_status, record.epistemic_status, record.current_revision,
           record.last_evaluated_at, revision.statement, revision.predictions,
           revision.falsification_conditions
           FROM hypothesis_records record
           JOIN hypothesis_revisions revision
             ON revision.hypothesis_resource_id = record.resource_id
            AND revision.revision_number = record.current_revision
           WHERE record.resource_id = $1`,
          [policy.hypothesis_resource_id],
        ),
        client.query<{
          from_state: string;
          to_state: string;
          reason: string;
          created_at: Date;
        }>(
          `SELECT from_state, to_state, reason, created_at FROM hypothesis_transitions
           WHERE hypothesis_resource_id = $1 ORDER BY created_at DESC LIMIT 5`,
          [policy.hypothesis_resource_id],
        ),
        client.query<{
          pending: number;
          retrying: number;
          dead_letter: number;
          completed: number;
        }>(
          `SELECT
             count(*) FILTER (WHERE status IN ('pending', 'leased'))::int AS pending,
             count(*) FILTER (WHERE status = 'retrying')::int AS retrying,
             count(*) FILTER (WHERE status = 'dead-letter')::int AS dead_letter,
             count(*) FILTER (WHERE status = 'completed')::int AS completed
           FROM monitor_jobs WHERE monitor_policy_id = $1`,
          [policy.id],
        ),
        client.query<{
          enabled: boolean;
          next_due_at: Date;
          interval_seconds: number;
        }>(
          `SELECT enabled, next_due_at, interval_seconds FROM monitor_schedules
           WHERE monitor_policy_id = $1`,
          [policy.id],
        ),
        client.query<{
          mode:
            | 'deterministic-only'
            | 'economy'
            | 'balanced'
            | 'high-assurance';
          selected_route:
            | 'no-model'
            | 'economy'
            | 'high-assurance'
            | 'deferred'
            | null;
          decision_reason: string | null;
        }>(
          `SELECT route_policy.mode, invocation.selected_route, invocation.decision_reason
           FROM model_route_policies route_policy
           LEFT JOIN LATERAL (
             SELECT selected_route, decision_reason FROM model_invocations
             WHERE route_policy_id = route_policy.id ORDER BY created_at DESC LIMIT 1
           ) invocation ON true
           WHERE route_policy.id = $1`,
          [IDS.modelPolicies.background],
        ),
        client.query<{
          input_tokens: string;
          output_tokens: string;
          cost_micros: string;
        }>(
          `SELECT COALESCE(sum(input_tokens), 0)::text AS input_tokens,
           COALESCE(sum(output_tokens), 0)::text AS output_tokens,
           COALESCE(sum(cost_micros), 0)::text AS cost_micros
           FROM model_usage_ledger`,
        ),
        client.query<{
          id: string;
          notification_type:
            | 'material-change'
            | 'review-required'
            | 'monitor-failed'
            | 'lifecycle-change';
          severity: 'info' | 'attention' | 'critical';
          status: 'pending' | 'delivered' | 'read' | 'suppressed';
          payload: { title?: string };
          created_at: Date;
        }>(
          `SELECT id, notification_type, severity, status, payload, created_at
           FROM notification_outbox WHERE monitor_policy_id = $1
           ORDER BY created_at DESC LIMIT 8`,
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
      const hypothesis = hypothesisResult.rows[0];
      const jobs = jobsResult.rows[0];
      const schedule = scheduleResult.rows[0];
      const route = routeResult.rows[0];
      const usage = usageResult.rows[0];
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
        hypothesis: hypothesis
          ? {
              lifecycleStatus: hypothesis.lifecycle_status,
              epistemicStatus: hypothesis.epistemic_status,
              revision: hypothesis.current_revision,
              statement: hypothesis.statement,
              predictions: hypothesis.predictions,
              falsificationConditions: hypothesis.falsification_conditions,
              lastEvaluatedAt:
                hypothesis.last_evaluated_at?.toISOString() ?? null,
              recentTransitions: transitionResult.rows.map((transition) => ({
                from: transition.from_state,
                to: transition.to_state,
                reason: transition.reason,
                at: transition.created_at.toISOString(),
              })),
            }
          : null,
        operations: {
          pendingJobs: jobs?.pending ?? 0,
          retryingJobs: jobs?.retrying ?? 0,
          deadLetterJobs: jobs?.dead_letter ?? 0,
          completedJobs: jobs?.completed ?? 0,
          scheduleEnabled: schedule?.enabled ?? false,
          nextDueAt: schedule?.next_due_at.toISOString() ?? null,
          intervalSeconds: schedule?.interval_seconds ?? null,
        },
        modelRouting: route
          ? {
              mode: route.mode,
              latestRoute: route.selected_route,
              latestReason: route.decision_reason,
              totalInputTokens: Number(usage?.input_tokens ?? 0),
              totalOutputTokens: Number(usage?.output_tokens ?? 0),
              totalCostMicros: Number(usage?.cost_micros ?? 0),
            }
          : null,
        notifications: notificationResult.rows.map((notification) => ({
          id: notification.id,
          type: notification.notification_type,
          severity: notification.severity,
          status: notification.status,
          title: notification.payload.title ?? 'Monitor notification',
          createdAt: notification.created_at.toISOString(),
        })),
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
          predictions: candidate.predictions,
          falsificationConditions: candidate.falsification_conditions,
          promotedResourceId: candidate.promoted_resource_id,
          createdAt: candidate.created_at.toISOString(),
        })),
      };
    },
  );
}

export class MemoryReviewPermissionError extends Error {}

export async function reviewMemoryCandidate(
  actor: {
    id: string;
    workspaceId: string;
    name: string;
    role: string;
    capabilities?: ActorCapability[];
  },
  candidateId: string,
  decision: 'accept' | 'dismiss',
) {
  if (!actorHasCapability(actor, 'hypothesis.review')) {
    throw new MemoryReviewPermissionError(
      'A hypothesis.review capability is required to review memory proposals',
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
      predictions: unknown[];
      falsification_conditions: unknown[];
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
      await client.query(
        `UPDATE notification_outbox SET status = 'read', read_at = now()
         WHERE memory_candidate_id = $1 AND recipient_actor_id = $2`,
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
    await client.query(
      `UPDATE notification_outbox SET status = 'read', read_at = now()
       WHERE memory_candidate_id = $1 AND recipient_actor_id = $2`,
      [candidate.id, actor.id],
    );
    await registerPromotedHypothesis(client, {
      resourceId: promotedResourceId,
      scopeId: candidate.access_scope_id,
      ownerActorId: actor.id,
      statement: candidate.statement,
      predictions: candidate.predictions,
      falsificationConditions: candidate.falsification_conditions,
      sourceCandidateId: candidate.id,
    });
  });
  return getMemoryState(actor);
}

export function newSourceTriggerRef(runId: string) {
  return `sync-run:${runId}`;
}

export function newManualTriggerRef() {
  return `manual:${randomUUID()}`;
}
