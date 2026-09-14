import type { PoolClient } from 'pg';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';

export type EpistemicStatus =
  | 'untested'
  | 'insufficient'
  | 'supported'
  | 'contested'
  | 'refuted'
  | 'stale';

export function evidenceStatus(supporting: number, contradicting: number): Exclude<EpistemicStatus, 'untested' | 'stale'> {
  if (supporting === 0 && contradicting > 0) return 'refuted';
  if (supporting > 0 && contradicting > 0) return 'contested';
  if (supporting > 0) return 'supported';
  return 'insufficient';
}

export async function ensureHypothesisLifecycle(
  client: PoolClient,
  input: {
    resourceId?: string;
    accessScopeId?: string;
    ownerActorId?: string;
    statement?: string;
    scopeDocument?: Record<string, unknown>;
    predictions?: string[];
    falsificationConditions?: string[];
    lifecycleStatus?: 'proposed' | 'active';
  } = {},
) {
  const resourceId = input.resourceId ?? IDS.resources.hypothesis;
  const accessScopeId = input.accessScopeId ?? IDS.scopes.everyone;
  const ownerActorId = input.ownerActorId ?? IDS.users.alex;
  const statement = input.statement ?? 'Identity verification drives abandonment';
  await client.query(
    `INSERT INTO hypothesis_records
      (resource_id, workspace_id, access_scope_id, owner_actor_id, lifecycle_status,
       epistemic_status, current_revision, stale_after_seconds)
     VALUES ($1, $2, $3, $4, $5, 'untested', 1, 2592000)
     ON CONFLICT (resource_id) DO NOTHING`,
    [resourceId, IDS.workspace, accessScopeId, ownerActorId, input.lifecycleStatus ?? 'active'],
  );
  const ontology = await client.query<{ id: string }>(
    `SELECT id FROM ontology_versions WHERE workspace_id = $1 AND status = 'current'
     ORDER BY created_at DESC LIMIT 1`,
    [IDS.workspace],
  );
  await client.query(
    `INSERT INTO hypothesis_revisions
      (id, workspace_id, access_scope_id, hypothesis_resource_id, revision_number,
       statement, scope_document, predictions, falsification_conditions, ontology_version_id,
       process_name, process_version, created_by, change_reason)
     VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, $9,
       'seeded-hypothesis-contract', '1.0.0', $10, 'Initial monitored hypothesis')
     ON CONFLICT (hypothesis_resource_id, revision_number) DO NOTHING`,
    [
      stableId('hypothesis-revision', `${resourceId}:1`),
      IDS.workspace,
      accessScopeId,
      resourceId,
      statement,
      input.scopeDocument ?? { client: IDS.resources.atlas, project: IDS.resources.project },
      JSON.stringify(input.predictions ?? [
        'Abandonment evidence clusters around the identity-verification step.',
        'Reducing verification delay should reduce abandonment.',
      ]),
      JSON.stringify(input.falsificationConditions ?? [
        'A stronger alternative cause explains abandonment across multiple sources.',
        'Verification-friction evidence disappears or reverses.',
      ]),
      ontology.rows[0]?.id ?? null,
      ownerActorId,
    ],
  );
}

export async function recordHypothesisEvaluation(
  client: PoolClient,
  input: {
    monitorRunId: string;
    contextSnapshotId: string;
    supportingEvidence: number;
    contradictingEvidence: number;
    rationale: string;
    hypothesisResourceId?: string;
    accessScopeId?: string;
    actorId?: string;
  },
) {
  const hypothesisResourceId = input.hypothesisResourceId ?? IDS.resources.hypothesis;
  const accessScopeId = input.accessScopeId ?? IDS.scopes.everyone;
  const actorId = input.actorId ?? IDS.users.memoryAgent;
  const next = evidenceStatus(input.supportingEvidence, input.contradictingEvidence);
  const current = await client.query<{ epistemic_status: EpistemicStatus }>(
    'SELECT epistemic_status FROM hypothesis_records WHERE resource_id = $1 FOR UPDATE',
    [hypothesisResourceId],
  );
  const previous = current.rows[0]?.epistemic_status ?? 'untested';
  await client.query(
    `INSERT INTO hypothesis_evaluations
      (id, workspace_id, access_scope_id, hypothesis_resource_id, monitor_run_id,
       context_snapshot_id, epistemic_status, supporting_evidence, contradicting_evidence,
       rationale, process_name, process_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       'deterministic-hypothesis-evaluator', '1.0.0')
     ON CONFLICT (hypothesis_resource_id, monitor_run_id) DO NOTHING`,
    [
      stableId('hypothesis-evaluation', `${hypothesisResourceId}:${input.monitorRunId}`),
      IDS.workspace,
      accessScopeId,
      hypothesisResourceId,
      input.monitorRunId,
      input.contextSnapshotId,
      next,
      input.supportingEvidence,
      input.contradictingEvidence,
      input.rationale,
    ],
  );
  if (previous !== next) {
    await client.query(
      `INSERT INTO hypothesis_transitions
        (id, workspace_id, access_scope_id, hypothesis_resource_id, transition_kind,
         from_state, to_state, reason, actor_id, monitor_run_id)
       VALUES ($1, $2, $3, $4, 'epistemic', $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        stableId('hypothesis-transition', `${input.monitorRunId}:${previous}:${next}`),
        IDS.workspace,
        accessScopeId,
        hypothesisResourceId,
        previous,
        next,
        input.rationale,
        actorId,
        input.monitorRunId,
      ],
    );
  }
  await client.query(
    `UPDATE hypothesis_records SET epistemic_status = $2, last_evaluated_at = now(),
       updated_at = now() WHERE resource_id = $1`,
    [hypothesisResourceId, next],
  );
  return { previous, current: next, changed: previous !== next };
}

export async function markStaleHypotheses(client: PoolClient, evaluatedAt = new Date()) {
  const stale = await client.query<{ resource_id: string; epistemic_status: EpistemicStatus }>(
    `SELECT resource_id, epistemic_status FROM hypothesis_records
     WHERE lifecycle_status = 'active' AND epistemic_status <> 'stale'
       AND last_evaluated_at IS NOT NULL
       AND last_evaluated_at + make_interval(secs => stale_after_seconds) < $1
     FOR UPDATE`,
    [evaluatedAt],
  );
  for (const hypothesis of stale.rows) {
    await client.query(
      `UPDATE hypothesis_records SET epistemic_status = 'stale', updated_at = now()
       WHERE resource_id = $1`,
      [hypothesis.resource_id],
    );
    await client.query(
      `INSERT INTO hypothesis_transitions
        (id, workspace_id, access_scope_id, hypothesis_resource_id, transition_kind,
         from_state, to_state, reason, actor_id)
       SELECT $1, workspace_id, access_scope_id, resource_id, 'epistemic', $2, 'stale',
         'The hypothesis passed its evidence refresh window.', $3
       FROM hypothesis_records WHERE resource_id = $4
       ON CONFLICT (id) DO NOTHING`,
      [
        stableId('hypothesis-transition', `stale:${hypothesis.resource_id}:${evaluatedAt.toISOString()}`),
        hypothesis.epistemic_status,
        IDS.users.memoryAgent,
        hypothesis.resource_id,
      ],
    );
  }
  return stale.rowCount ?? 0;
}

export async function transitionHypothesisLifecycle(
  client: PoolClient,
  input: {
    resourceId: string;
    to: 'active' | 'superseded' | 'retired';
    actorId: string;
    reason: string;
    supersededByResourceId?: string;
  },
) {
  const record = await client.query<{
    lifecycle_status: 'proposed' | 'active' | 'superseded' | 'retired';
    access_scope_id: string;
  }>(
    'SELECT lifecycle_status, access_scope_id FROM hypothesis_records WHERE resource_id = $1 FOR UPDATE',
    [input.resourceId],
  );
  const current = record.rows[0];
  if (!current) throw new Error('The Hypothesis Record was not found');
  const allowed =
    (current.lifecycle_status === 'proposed' && ['active', 'retired'].includes(input.to)) ||
    (current.lifecycle_status === 'active' && ['superseded', 'retired'].includes(input.to));
  if (!allowed) {
    throw new Error(`Hypothesis lifecycle cannot move from ${current.lifecycle_status} to ${input.to}`);
  }
  if (input.to === 'superseded' && !input.supersededByResourceId) {
    throw new Error('A superseding Hypothesis Resource is required');
  }
  await client.query(
    `UPDATE hypothesis_records SET lifecycle_status = $2,
     superseded_by_resource_id = $3, updated_at = now() WHERE resource_id = $1`,
    [input.resourceId, input.to, input.supersededByResourceId ?? null],
  );
  const transitionId = stableId(
    'hypothesis-transition',
    `lifecycle:${input.resourceId}:${current.lifecycle_status}:${input.to}:${input.reason}`,
  );
  await client.query(
    `INSERT INTO hypothesis_transitions
      (id, workspace_id, access_scope_id, hypothesis_resource_id, transition_kind,
       from_state, to_state, reason, actor_id)
     VALUES ($1, $2, $3, $4, 'lifecycle', $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING`,
    [
      transitionId,
      IDS.workspace,
      current.access_scope_id,
      input.resourceId,
      current.lifecycle_status,
      input.to,
      input.reason,
      input.actorId,
    ],
  );
  if (input.to === 'superseded' || input.to === 'retired') {
    await client.query(
      `UPDATE monitor_policies SET status = 'stopped', updated_at = now()
       WHERE hypothesis_resource_id = $1`,
      [input.resourceId],
    );
    await client.query(
      `UPDATE monitor_jobs SET status = 'dead-letter',
       last_error = 'Hypothesis lifecycle ended before processing', updated_at = now()
       WHERE monitor_policy_id IN (
         SELECT id FROM monitor_policies WHERE hypothesis_resource_id = $1
       ) AND status IN ('pending', 'retrying', 'leased')`,
      [input.resourceId],
    );
  }
  return { from: current.lifecycle_status, to: input.to, transitionId };
}

export async function registerPromotedHypothesis(
  client: PoolClient,
  input: {
    resourceId: string;
    scopeId: string;
    ownerActorId: string;
    statement: string;
    predictions: unknown[];
    falsificationConditions: unknown[];
    sourceCandidateId: string;
  },
) {
  await client.query(
    `INSERT INTO hypothesis_records
      (resource_id, workspace_id, access_scope_id, owner_actor_id, lifecycle_status,
       epistemic_status, current_revision)
     VALUES ($1, $2, $3, $4, 'active', 'untested', 1)
     ON CONFLICT (resource_id) DO NOTHING`,
    [input.resourceId, IDS.workspace, input.scopeId, input.ownerActorId],
  );
  await client.query(
    `INSERT INTO hypothesis_revisions
      (id, workspace_id, access_scope_id, hypothesis_resource_id, revision_number,
       statement, predictions, falsification_conditions, process_name, process_version,
       created_by, change_reason)
     VALUES ($1, $2, $3, $4, 1, $5, $6, $7,
       'human-reviewed-memory-promotion', '1.0.0', $8, $9)
     ON CONFLICT (hypothesis_resource_id, revision_number) DO NOTHING`,
    [
      stableId('hypothesis-revision', `${input.resourceId}:1`),
      IDS.workspace,
      input.scopeId,
      input.resourceId,
      input.statement,
      JSON.stringify(input.predictions),
      JSON.stringify(input.falsificationConditions),
      input.ownerActorId,
      `Promoted from reviewed memory candidate ${input.sourceCandidateId}`,
    ],
  );
}
