import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withActorTransaction } from '@/src/db/actor-transaction';
import { getIngestionPool } from '@/src/db/pool';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import { readContextFoundationState } from '@/src/modules/context-assets/foundation';
import { readSourceIntegrationState } from '@/src/modules/source-integration/service';
import { actorHasCapability } from '@/src/modules/identity/authorization';
import type { RequestActor } from '@/src/modules/identity/request-actor';
import {
  formationInputDigest,
  formProjectMemoryCandidates,
  type FormationArtifact,
  type FormedMemoryCandidate,
} from './formation';
import {
  SyntheticHostProductAdapter,
  type HostProductAdapter,
} from './host-product';
import type { MemoryType } from './isolation-policy';
import type { ProjectMemoryState } from './types';

const process = {
  integration: 'host-project-adapter-v1',
  debrief: 'project-debrief-v1',
  formation: 'deterministic-general-memory-v1',
  kickoff: 'permissioned-kickoff-v1',
} as const;

export class ProjectMemoryPermissionError extends Error {}

interface BindingRow {
  id: string;
  workspace_id: string;
  project_resource_id: string;
  client_resource_id: string;
  project_scope_id: string;
  access_scope_id: string;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function withProjectWriteActor<T>(
  actorId: string,
  callback: (client: PoolClient) => Promise<T>,
) {
  const client = await getIngestionPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_id', $1, true)", [
      actorId,
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

async function requireBinding(
  client: PoolClient,
  bindingId: string = IDS.organisationalMemory.projectBinding,
) {
  const result = await client.query<BindingRow>(
    `SELECT id, workspace_id, project_resource_id, client_resource_id,
       project_scope_id, access_scope_id
     FROM host_project_bindings
     WHERE id = $1 AND status = 'active'`,
    [bindingId],
  );
  if (!result.rows[0]) {
    throw new ProjectMemoryPermissionError(
      'The project is not available in this actor’s host-product membership.',
    );
  }
  return result.rows[0];
}

async function requireMembership(
  client: PoolClient,
  actorId: string,
  allowedRoles: Array<'lead' | 'contributor' | 'viewer' | 'service'>,
) {
  const binding = await requireBinding(client);
  const membership = await client.query<{ project_role: string }>(
    `SELECT project_role FROM host_project_memberships
     WHERE project_binding_id = $1 AND actor_id = $2
       AND membership_status = 'active'`,
    [binding.id, actorId],
  );
  if (
    !membership.rows[0] ||
    !allowedRoles.includes(
      membership.rows[0].project_role as (typeof allowedRoles)[number],
    )
  ) {
    throw new ProjectMemoryPermissionError(
      'The host-product project membership does not permit this operation.',
    );
  }
  return { binding, role: membership.rows[0].project_role };
}

export async function syncHostProject(
  adapter: HostProductAdapter,
  externalProjectId: string,
) {
  const snapshot = await adapter.readProject(externalProjectId);
  return withProjectWriteActor(IDS.users.ingestion, async (client) => {
    await client.query(
      `INSERT INTO sources
        (id, workspace_id, source_type, name, cursor, status, last_successful_sync_at)
       VALUES ($1, $2, 'host-product', 'Synthetic host product', $3, 'healthy', now())
       ON CONFLICT (id) DO UPDATE SET cursor = EXCLUDED.cursor,
         status = 'healthy', last_successful_sync_at = now(), updated_at = now()`,
      [IDS.sources.hostProduct, IDS.workspace, snapshot.membershipRevision],
    );
    const clientScope = await client.query(
      `UPDATE memory_scopes SET name = 'Atlas client memory', updated_at = now()
       WHERE id = $1`,
      [IDS.organisationalMemory.scopes.atlasClient],
    );
    if (!clientScope.rowCount) {
      await client.query(
        `INSERT INTO memory_scopes
          (id, workspace_id, scope_kind, name, access_scope_id, subject_resource_id)
         VALUES ($1, $2, 'client', 'Atlas client memory', $3, $4)`,
        [
          IDS.organisationalMemory.scopes.atlasClient,
          IDS.workspace,
          IDS.scopes.everyone,
          snapshot.clientResourceId,
        ],
      );
    }
    const organisationScope = await client.query(
      `UPDATE memory_scopes SET name = 'Northstar organisation memory', updated_at = now()
       WHERE id = $1`,
      [IDS.organisationalMemory.scopes.organisation],
    );
    if (!organisationScope.rowCount) {
      await client.query(
        `INSERT INTO memory_scopes
          (id, workspace_id, scope_kind, name, access_scope_id, subject_resource_id)
         VALUES ($1, $2, 'organisation', 'Northstar organisation memory', $3, NULL)`,
        [
          IDS.organisationalMemory.scopes.organisation,
          IDS.workspace,
          IDS.scopes.everyone,
        ],
      );
    }
    const projectScope = await client.query(
      `UPDATE memory_scopes SET name = 'Atlas Onboarding project memory', updated_at = now()
       WHERE id = $1`,
      [IDS.organisationalMemory.scopes.atlasProject],
    );
    if (!projectScope.rowCount) {
      await client.query(
        `INSERT INTO memory_scopes
          (id, workspace_id, scope_kind, name, access_scope_id,
           subject_resource_id, parent_scope_id)
         VALUES ($1, $2, 'project', 'Atlas Onboarding project memory', $3, $4, $5)`,
        [
          IDS.organisationalMemory.scopes.atlasProject,
          IDS.workspace,
          IDS.scopes.everyone,
          snapshot.projectResourceId,
          IDS.organisationalMemory.scopes.atlasClient,
        ],
      );
    }
    await client.query(
      `INSERT INTO host_project_bindings
        (id, workspace_id, provider, external_project_id, project_resource_id,
         client_resource_id, project_scope_id, access_scope_id,
         membership_revision, client_memory_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
       ON CONFLICT (id) DO UPDATE SET
         membership_revision = EXCLUDED.membership_revision,
         status = 'active', client_memory_enabled = false,
         synced_at = now(), updated_at = now()`,
      [
        IDS.organisationalMemory.projectBinding,
        IDS.workspace,
        snapshot.provider,
        snapshot.externalProjectId,
        snapshot.projectResourceId,
        snapshot.clientResourceId,
        IDS.organisationalMemory.scopes.atlasProject,
        IDS.scopes.everyone,
        snapshot.membershipRevision,
      ],
    );
    await client.query(
      `UPDATE host_project_memberships SET membership_status = 'removed',
         source_revision = $2, imported_at = now()
       WHERE project_binding_id = $1`,
      [IDS.organisationalMemory.projectBinding, snapshot.membershipRevision],
    );
    for (const member of snapshot.members) {
      await client.query(
        `INSERT INTO host_project_memberships
          (id, workspace_id, project_binding_id, actor_id, project_role,
           membership_status, source_revision)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (project_binding_id, actor_id) DO UPDATE SET
           project_role = EXCLUDED.project_role,
           membership_status = EXCLUDED.membership_status,
           source_revision = EXCLUDED.source_revision,
           imported_at = now()`,
        [
          stableId(
            'host-project-member',
            `${snapshot.externalProjectId}:${member.actorId}`,
          ),
          IDS.workspace,
          IDS.organisationalMemory.projectBinding,
          member.actorId,
          member.role,
          member.status,
          snapshot.membershipRevision,
        ],
      );
    }
    await client.query(
      `INSERT INTO project_memory_schedules
        (id, workspace_id, project_binding_id, access_scope_id,
         interval_seconds, enabled, next_due_at)
       VALUES ($1, $2, $3, $4, 21600, true, now() + interval '6 hours')
       ON CONFLICT (project_binding_id) DO UPDATE SET updated_at = now()`,
      [
        IDS.organisationalMemory.schedule,
        IDS.workspace,
        IDS.organisationalMemory.projectBinding,
        IDS.scopes.everyone,
      ],
    );
    return snapshot;
  });
}

async function projectArtifacts(client: PoolClient, binding: BindingRow) {
  const result = await client.query<{
    resource_id: string;
    content_type: string;
    title: string;
    body: string;
  }>(
    `SELECT resource.id AS resource_id, content.content_type,
       resource.canonical_name AS title, version.body
     FROM relationships edge
     JOIN resources resource ON resource.id = edge.from_resource_id
     JOIN content_objects content ON content.resource_id = resource.id
     JOIN content_versions version ON version.id = content.current_version_id
     WHERE edge.to_resource_id = $1 AND edge.relationship_type = 'BELONGS_TO'
       AND resource.access_scope_id = $2 AND version.is_current
       AND content.content_type IN ('ResearchNote', 'MeetingNote', 'Document', 'MessageThread')
     ORDER BY resource.id`,
    [binding.project_resource_id, binding.access_scope_id],
  );
  return result.rows.map(
    (row): FormationArtifact => ({
      resourceId: row.resource_id,
      sourceType:
        row.content_type === 'MessageThread'
          ? 'conversation'
          : row.content_type === 'MeetingNote'
            ? 'meeting'
            : row.content_type === 'ResearchNote'
              ? 'research'
              : 'file',
      title: row.title,
      body: row.body,
    }),
  );
}

async function insertMemoryResource(
  client: PoolClient,
  input: {
    id: string;
    scopeId: string;
    accessScopeId: string;
    type: MemoryType;
    statement: string;
    statementHash: string;
    confidence: number;
    qualityScore: number;
    context: Record<string, unknown>;
    createdBy: string;
    processName: string;
    status?: 'candidate' | 'active';
    reviewedBy?: string;
  },
) {
  await client.query(
    `INSERT INTO resources
      (id, workspace_id, access_scope_id, resource_kind, semantic_type,
       canonical_name, summary, properties)
     VALUES ($1, $2, $3, 'content', 'OrganisationalMemory', $4, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [
      input.id,
      IDS.workspace,
      input.accessScopeId,
      input.statement,
      input.context,
    ],
  );
  await client.query(
    `INSERT INTO content_objects (resource_id, content_type)
     VALUES ($1, 'OrganisationalMemory') ON CONFLICT (resource_id) DO NOTHING`,
    [input.id],
  );
  const existing = await client.query(
    `SELECT resource_id FROM organisational_memories
     WHERE resource_id = $1 OR (visibility_scope_id = $2 AND statement_hash = $3)
     LIMIT 1`,
    [input.id, input.scopeId, input.statementHash],
  );
  if (existing.rowCount) return;
  await client.query(
    `INSERT INTO organisational_memories
      (resource_id, workspace_id, origin_scope_id, visibility_scope_id,
       memory_type, statement, statement_hash, context_document, policy_context,
       transfer_class, sensitivity, lifecycle_status, review_status,
       outcome_status, confidence, quality_score, abstraction_reviewed,
       process_name, process_version, created_by, reviewed_by, reviewed_at)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8,
       'client-confidential', 'client-confidential', $9, $10, 'untested',
       $11, $12, false, $13, '1.0.0', $14, $15,
       CASE WHEN $15::uuid IS NULL THEN NULL ELSE now() END)`,
    [
      input.id,
      IDS.workspace,
      input.scopeId,
      input.type,
      input.statement,
      input.statementHash,
      input.context,
      { clientMemoryEnabled: false, captureScope: 'project' },
      input.status ?? 'candidate',
      input.status === 'active' ? 'approved' : 'proposed',
      input.confidence,
      input.qualityScore,
      input.processName,
      input.createdBy,
      input.reviewedBy ?? null,
    ],
  );
}

async function insertFormedCandidate(
  client: PoolClient,
  binding: BindingRow,
  runId: string,
  actorId: string,
  candidate: FormedMemoryCandidate,
) {
  const memoryId = stableId(
    'organisational-memory',
    `${binding.project_scope_id}:${candidate.statementHash}`,
  );
  await insertMemoryResource(client, {
    id: memoryId,
    scopeId: binding.project_scope_id,
    accessScopeId: binding.access_scope_id,
    type: candidate.memoryType,
    statement: candidate.statement,
    statementHash: candidate.statementHash,
    confidence: candidate.confidence,
    qualityScore: candidate.qualityScore,
    context: { ...candidate.context, captureRunId: runId },
    createdBy: actorId,
    processName: process.formation,
  });
  for (const evidenceId of candidate.evidenceResourceIds) {
    await client.query(
      `INSERT INTO organisational_memory_evidence
        (id, workspace_id, memory_id, evidence_resource_id, evidence_scope_id,
         stance, contribution)
       SELECT $1, $2, $3, $4, $5, 'supports', $6
       WHERE EXISTS (SELECT 1 FROM organisational_memories WHERE resource_id = $3)
       ON CONFLICT DO NOTHING`,
      [
        stableId('organisational-memory-evidence', `${memoryId}:${evidenceId}`),
        IDS.workspace,
        memoryId,
        evidenceId,
        binding.project_scope_id,
        candidate.rationale,
      ],
    );
  }
  return memoryId;
}

async function executeBackgroundFormation(
  client: PoolClient,
  binding: BindingRow,
  actorId: string,
) {
  const artifacts = await projectArtifacts(client, binding);
  const inputDigest = formationInputDigest(artifacts);
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM memory_capture_runs
     WHERE project_binding_id = $1 AND capture_mode = 'background'
       AND input_digest = $2`,
    [binding.id, inputDigest],
  );
  if (existing.rows[0]) {
    return { runId: existing.rows[0].id, candidateCount: 0, replay: true };
  }
  const runId = stableId(
    'memory-capture-run',
    `${binding.id}:background:${inputDigest}`,
  );
  const candidates = formProjectMemoryCandidates(artifacts);
  await client.query(
    `INSERT INTO memory_capture_runs
      (id, workspace_id, project_binding_id, project_scope_id, access_scope_id,
       capture_mode, initiated_by, source_counts, input_digest, status,
       model_route, rationale, finished_at)
     VALUES ($1, $2, $3, $4, $5, 'background', $6, $7, $8, $9,
       'no-model', $10, now())`,
    [
      runId,
      IDS.workspace,
      binding.id,
      binding.project_scope_id,
      binding.access_scope_id,
      actorId,
      {
        artifacts: artifacts.length,
        files: artifacts.filter((item) => item.sourceType !== 'conversation')
          .length,
        conversations: artifacts.filter(
          (item) => item.sourceType === 'conversation',
        ).length,
      },
      inputDigest,
      candidates.length ? 'completed' : 'no-signal',
      candidates.length
        ? `${candidates.length} material signals formed as reviewable project-scoped candidates.`
        : 'No material decision, approach, risk, adaptation or anti-pattern signal crossed the deterministic threshold.',
    ],
  );
  for (const candidate of candidates) {
    await insertFormedCandidate(client, binding, runId, actorId, candidate);
  }
  return { runId, candidateCount: candidates.length, replay: false };
}

export async function runProjectBackgroundFormation(actor: RequestActor) {
  if (
    !actorHasCapability(actor, 'memory.capture') &&
    !actorHasCapability(actor, 'monitor.operate')
  ) {
    throw new ProjectMemoryPermissionError(
      'Memory capture or monitor operation authority is required.',
    );
  }
  await withProjectWriteActor(actor.id, async (client) => {
    const { binding } = await requireMembership(client, actor.id, [
      'lead',
      'contributor',
      'service',
    ]);
    const jobId = randomUUID();
    await client.query(
      `INSERT INTO project_memory_jobs
        (id, workspace_id, project_binding_id, access_scope_id, trigger_kind,
         trigger_ref, requested_by, status)
       VALUES ($1, $2, $3, $4, 'manual', $5, $6, 'running')`,
      [
        jobId,
        IDS.workspace,
        binding.id,
        binding.access_scope_id,
        `manual:${jobId}`,
        actor.id,
      ],
    );
    const result = await executeBackgroundFormation(client, binding, actor.id);
    await client.query(
      `UPDATE project_memory_jobs SET status = $2, capture_run_id = $3,
         attempts = attempts + 1, updated_at = now()
       WHERE id = $1`,
      [jobId, result.candidateCount ? 'completed' : 'no-signal', result.runId],
    );
  });
  return getProjectMemoryState(actor);
}

export async function enqueueDueProjectMemorySchedules(now = new Date()) {
  return withProjectWriteActor(IDS.users.memoryAgent, async (client) => {
    const due = await client.query<{
      id: string;
      project_binding_id: string;
      access_scope_id: string;
      interval_seconds: number;
      next_due_at: string;
    }>(
      `SELECT id, project_binding_id, access_scope_id, interval_seconds,
         next_due_at
       FROM project_memory_schedules
       WHERE enabled AND next_due_at <= $1
       ORDER BY next_due_at
       FOR UPDATE SKIP LOCKED`,
      [now.toISOString()],
    );
    let enqueued = 0;
    for (const schedule of due.rows) {
      const triggerRef = `schedule:${schedule.id}:${new Date(schedule.next_due_at).toISOString()}`;
      const inserted = await client.query(
        `INSERT INTO project_memory_jobs
          (id, workspace_id, project_binding_id, access_scope_id, trigger_kind,
           trigger_ref, status)
         VALUES ($1, $2, $3, $4, 'scheduled', $5, 'pending')
         ON CONFLICT (workspace_id, trigger_ref) DO NOTHING
         RETURNING id`,
        [
          stableId('project-memory-job', triggerRef),
          IDS.workspace,
          schedule.project_binding_id,
          schedule.access_scope_id,
          triggerRef,
        ],
      );
      enqueued += inserted.rowCount ?? 0;
      await client.query(
        `UPDATE project_memory_schedules SET last_enqueued_at = $2,
           next_due_at = $2 + make_interval(secs => interval_seconds),
           updated_at = now() WHERE id = $1`,
        [schedule.id, now.toISOString()],
      );
    }
    return { due: due.rows.length, enqueued };
  });
}

export async function runProjectMemoryWorkerOnce(
  workerId = 'project-memory-worker',
) {
  const job = await withProjectWriteActor(
    IDS.users.memoryAgent,
    async (client) => {
      await client.query(
        `UPDATE project_memory_jobs SET status = 'retrying', lease_owner = NULL,
         lease_expires_at = NULL, available_at = now(), updated_at = now()
       WHERE status = 'running' AND lease_expires_at < now()
         AND attempts < max_attempts`,
      );
      await client.query(
        `UPDATE project_memory_jobs SET status = 'dead-letter', lease_owner = NULL,
         lease_expires_at = NULL, error_code = 'attempts-exhausted', updated_at = now()
       WHERE status IN ('running', 'retrying') AND attempts >= max_attempts`,
      );
      const claimed = await client.query<{
        id: string;
        project_binding_id: string;
        attempts: number;
        max_attempts: number;
      }>(
        `WITH candidate AS (
         SELECT id FROM project_memory_jobs
         WHERE status IN ('pending', 'retrying') AND available_at <= now()
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE project_memory_jobs job SET status = 'running',
         attempts = attempts + 1, lease_owner = $1,
         lease_expires_at = now() + interval '5 minutes', updated_at = now()
       FROM candidate WHERE job.id = candidate.id
       RETURNING job.id, job.project_binding_id, job.attempts, job.max_attempts`,
        [workerId],
      );
      return claimed.rows[0] ?? null;
    },
  );
  if (!job) return { processed: 0, failed: 0, status: 'idle' as const };
  try {
    const result = await withProjectWriteActor(
      IDS.users.memoryAgent,
      async (client) => {
        const binding = await requireBinding(client, job.project_binding_id);
        return executeBackgroundFormation(
          client,
          binding,
          IDS.users.memoryAgent,
        );
      },
    );
    const status = result.candidateCount ? 'completed' : 'no-signal';
    await withProjectWriteActor(IDS.users.memoryAgent, async (client) => {
      await client.query(
        `UPDATE project_memory_jobs SET status = $2, capture_run_id = $3,
         lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE id = $1 AND lease_owner = $4`,
        [job.id, status, result.runId, workerId],
      );
    });
    return { processed: 1, failed: 0, status, jobId: job.id };
  } catch {
    const terminal = job.attempts >= job.max_attempts;
    await withProjectWriteActor(IDS.users.memoryAgent, async (client) => {
      await client.query(
        `UPDATE project_memory_jobs SET status = $2, error_code = $3,
         available_at = CASE WHEN $2 = 'retrying'
           THEN now() + make_interval(secs => LEAST(300, attempts * attempts * 10))
           ELSE available_at END,
         lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE id = $1 AND lease_owner = $4`,
        [
          job.id,
          terminal ? 'dead-letter' : 'retrying',
          terminal ? 'attempts-exhausted' : 'formation-failed',
          workerId,
        ],
      );
    });
    return {
      processed: 1,
      failed: 1,
      status: terminal ? ('dead-letter' as const) : ('retrying' as const),
      jobId: job.id,
    };
  }
}

export async function drainProjectMemoryJobs({ limit = 25 } = {}) {
  let processed = 0;
  let failed = 0;
  for (let index = 0; index < Math.max(0, limit); index += 1) {
    const result = await runProjectMemoryWorkerOnce(
      'project-memory-operations',
    );
    if (result.status === 'idle') break;
    processed += result.processed;
    failed += result.failed;
  }
  return { processed, failed };
}

async function createDebriefEvidence(
  client: PoolClient,
  binding: BindingRow,
  actorId: string,
  input: { statement: string; context: string; outcome: string },
) {
  const body = [input.statement, input.context, input.outcome]
    .filter(Boolean)
    .join('\n\n');
  const digest = sha256(body.toLowerCase());
  const externalId = `debrief-${digest.slice(0, 16)}`;
  const sourceObjectId = stableId(
    'source-object',
    `host-product:${externalId}`,
  );
  const sourceVersionId = stableId(
    'source-version',
    `${sourceObjectId}:${digest}`,
  );
  const contentResourceId = stableId(
    'content-resource',
    `host-product:${externalId}`,
  );
  const contentVersionId = stableId('content-version', sourceVersionId);
  const sourceUri = `host-product://projects/${binding.project_resource_id}/debriefs/${externalId}`;
  await client.query(
    `INSERT INTO source_objects
      (id, workspace_id, source_id, access_scope_id, external_id, source_uri,
       source_created_at, source_updated_at, current_content_hash)
     VALUES ($1, $2, $3, $4, $5, $6, now(), now(), $7)
     ON CONFLICT (source_id, external_id) DO UPDATE SET
       source_updated_at = now(), current_content_hash = EXCLUDED.current_content_hash,
       updated_at = now()`,
    [
      sourceObjectId,
      IDS.workspace,
      IDS.sources.hostProduct,
      binding.access_scope_id,
      externalId,
      sourceUri,
      digest,
    ],
  );
  await client.query(
    `INSERT INTO source_object_versions
      (id, workspace_id, source_object_id, access_scope_id, content_hash,
       raw_payload, source_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (source_object_id, content_hash) DO NOTHING`,
    [
      sourceVersionId,
      IDS.workspace,
      sourceObjectId,
      binding.access_scope_id,
      digest,
      { ...input, contributedBy: actorId },
    ],
  );
  await client.query(
    `INSERT INTO resources
      (id, workspace_id, access_scope_id, resource_kind, semantic_type,
       canonical_name, summary, properties)
     VALUES ($1, $2, $3, 'content', 'ProjectDebrief', 'Project debrief', $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [
      contentResourceId,
      IDS.workspace,
      binding.access_scope_id,
      input.statement,
      { sourceUri },
    ],
  );
  await client.query(
    `INSERT INTO content_objects (resource_id, content_type, current_version_id)
     VALUES ($1, 'ProjectDebrief', NULL)
     ON CONFLICT (resource_id) DO NOTHING`,
    [contentResourceId],
  );
  await client.query(
    `INSERT INTO content_versions
      (id, workspace_id, content_resource_id, source_object_version_id,
       access_scope_id, body, content_hash, version_number, is_current)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1, true)
     ON CONFLICT (id) DO NOTHING`,
    [
      contentVersionId,
      IDS.workspace,
      contentResourceId,
      sourceVersionId,
      binding.access_scope_id,
      body,
      digest,
    ],
  );
  await client.query(
    `UPDATE content_objects SET current_version_id = $2 WHERE resource_id = $1`,
    [contentResourceId, contentVersionId],
  );
  const relationshipId = stableId(
    'relationship',
    `${contentResourceId}:BELONGS_TO:${binding.project_resource_id}`,
  );
  await client.query(
    `INSERT INTO relationships
      (id, workspace_id, from_resource_id, to_resource_id, relationship_type)
     VALUES ($1, $2, $3, $4, 'BELONGS_TO')
     ON CONFLICT DO NOTHING`,
    [
      relationshipId,
      IDS.workspace,
      contentResourceId,
      binding.project_resource_id,
    ],
  );
  const assertionId = stableId(
    'assertion',
    `${sourceVersionId}:${relationshipId}`,
  );
  await client.query(
    `INSERT INTO assertions
      (id, workspace_id, access_scope_id, subject_resource_id, predicate,
       object_resource_id, relationship_id, assertion_kind,
       source_object_version_id, process_name, process_version, confidence)
     VALUES ($1, $2, $3, $4, 'BELONGS_TO', $5, $6, 'source-backed',
       $7, $8, '1.0.0', 1)
     ON CONFLICT (id) DO NOTHING`,
    [
      assertionId,
      IDS.workspace,
      binding.access_scope_id,
      contentResourceId,
      binding.project_resource_id,
      relationshipId,
      sourceVersionId,
      process.debrief,
    ],
  );
  await client.query(
    `INSERT INTO provenance_spans
      (id, workspace_id, assertion_id, source_object_version_id,
       start_offset, end_offset, quote, locator)
     VALUES ($1, $2, $3, $4, 0, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [
      stableId('provenance-span', `${assertionId}:debrief`),
      IDS.workspace,
      assertionId,
      sourceVersionId,
      body.length,
      body,
      { sourceUri, section: 'project-debrief' },
    ],
  );
  return { contentResourceId, digest, body };
}

export async function captureProjectDebrief(
  actor: RequestActor,
  input: {
    memoryType: Exclude<MemoryType, 'person-preference'>;
    statement: string;
    context: string;
    outcome: string;
  },
) {
  if (!actorHasCapability(actor, 'memory.capture')) {
    throw new ProjectMemoryPermissionError(
      'The memory.capture capability is required.',
    );
  }
  await withProjectWriteActor(actor.id, async (client) => {
    const { binding } = await requireMembership(client, actor.id, [
      'lead',
      'contributor',
    ]);
    const evidence = await createDebriefEvidence(
      client,
      binding,
      actor.id,
      input,
    );
    const runId = stableId(
      'memory-capture-run',
      `${binding.id}:debrief:${evidence.digest}`,
    );
    await client.query(
      `INSERT INTO memory_capture_runs
        (id, workspace_id, project_binding_id, project_scope_id, access_scope_id,
         capture_mode, initiated_by, source_counts, input_digest, status,
         model_route, rationale, finished_at)
       VALUES ($1, $2, $3, $4, $5, 'debrief', $6,
         '{"debriefs":1}'::jsonb, $7, 'completed', 'no-model',
         'An explicit project-member contribution formed one reviewable candidate.', now())
       ON CONFLICT (project_binding_id, capture_mode, input_digest) DO NOTHING`,
      [
        runId,
        IDS.workspace,
        binding.id,
        binding.project_scope_id,
        binding.access_scope_id,
        actor.id,
        evidence.digest,
      ],
    );
    const candidate: FormedMemoryCandidate = {
      memoryType: input.memoryType,
      statement: input.statement,
      statementHash: sha256(input.statement.toLowerCase()),
      rationale:
        'A project member explicitly contributed this learning in a debrief. Review is still required before reuse.',
      confidence: 0.82,
      qualityScore: 0.82,
      evidenceResourceIds: [evidence.contentResourceId],
      context: {
        detector: 'explicit-debrief',
        sourceType: 'debrief',
        sourceTitle: 'Project debrief',
        prediction:
          input.outcome ||
          'The learning should recur in comparable project work.',
        falsificationCondition:
          'A comparable project outcome or later correction contradicts this learning.',
      },
    };
    await insertFormedCandidate(client, binding, runId, actor.id, candidate);
  });
  return getProjectMemoryState(actor);
}

export async function reviewProjectMemory(
  actor: RequestActor,
  input: {
    memoryId: string;
    decision: 'approve' | 'reject' | 'correct';
    note: string;
    correctedStatement?: string;
  },
) {
  await withProjectWriteActor(actor.id, async (client) => {
    const { binding, role } = await requireMembership(client, actor.id, [
      'lead',
    ]);
    if (role !== 'lead' || !actorHasCapability(actor, 'memory.review')) {
      throw new ProjectMemoryPermissionError(
        'An authorised project lead is required to review organisational memory.',
      );
    }
    const found = await client.query<{
      resource_id: string;
      memory_type: MemoryType;
      statement: string;
      statement_hash: string;
      context_document: Record<string, unknown>;
      confidence: number;
      quality_score: number;
      lifecycle_status: string;
    }>(
      `SELECT resource_id, memory_type, statement, statement_hash,
         context_document, confidence, quality_score, lifecycle_status
       FROM organisational_memories
       WHERE resource_id = $1 AND visibility_scope_id = $2`,
      [input.memoryId, binding.project_scope_id],
    );
    const memory = found.rows[0];
    if (!memory || memory.lifecycle_status !== 'candidate') {
      throw new Error(
        'Only a current project-scoped candidate can be reviewed.',
      );
    }
    let reviewDecision: 'approved' | 'rejected' | 'corrected';
    let replacementMemoryId: string | null = null;
    if (input.decision === 'approve') {
      reviewDecision = 'approved';
      await client.query(
        `UPDATE organisational_memories SET lifecycle_status = 'active',
           review_status = 'approved', reviewed_by = $2, reviewed_at = now(),
           updated_at = now() WHERE resource_id = $1`,
        [memory.resource_id, actor.id],
      );
    } else if (input.decision === 'reject') {
      reviewDecision = 'rejected';
      await client.query(
        `UPDATE organisational_memories SET lifecycle_status = 'rejected',
           review_status = 'rejected', reviewed_by = $2, reviewed_at = now(),
           updated_at = now() WHERE resource_id = $1`,
        [memory.resource_id, actor.id],
      );
    } else {
      const corrected = input.correctedStatement?.trim();
      if (!corrected || corrected === memory.statement) {
        throw new Error(
          'A correction must provide a different replacement statement.',
        );
      }
      reviewDecision = 'corrected';
      const correctedHash = sha256(corrected.toLowerCase());
      replacementMemoryId = stableId(
        'organisational-memory',
        `${binding.project_scope_id}:${correctedHash}`,
      );
      await insertMemoryResource(client, {
        id: replacementMemoryId,
        scopeId: binding.project_scope_id,
        accessScopeId: binding.access_scope_id,
        type: memory.memory_type,
        statement: corrected,
        statementHash: correctedHash,
        confidence: memory.confidence,
        qualityScore: memory.quality_score,
        context: {
          ...memory.context_document,
          correctedFrom: memory.resource_id,
          correctionReason: input.note,
        },
        createdBy: actor.id,
        reviewedBy: actor.id,
        processName: 'reviewed-memory-correction-v1',
        status: 'active',
      });
      await client.query(
        `INSERT INTO organisational_memory_evidence
          (id, workspace_id, memory_id, evidence_resource_id,
           evidence_assertion_id, evidence_scope_id, stance, contribution)
         SELECT md5($2::text || ':' || evidence_resource_id::text)::uuid,
           workspace_id, $2, evidence_resource_id, evidence_assertion_id,
           evidence_scope_id, stance, 'Retained from corrected memory: ' || contribution
         FROM organisational_memory_evidence WHERE memory_id = $1
         ON CONFLICT DO NOTHING`,
        [memory.resource_id, replacementMemoryId],
      );
      await client.query(
        `UPDATE organisational_memories SET lifecycle_status = 'superseded',
           review_status = 'correction-required', reviewed_by = $2,
           reviewed_at = now(), superseded_by_memory_id = $3, updated_at = now()
         WHERE resource_id = $1`,
        [memory.resource_id, actor.id, replacementMemoryId],
      );
    }
    await client.query(
      `INSERT INTO organisational_memory_reviews
        (id, workspace_id, memory_id, reviewer_actor_id, decision, review_note,
         previous_statement, replacement_memory_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        IDS.workspace,
        memory.resource_id,
        actor.id,
        reviewDecision,
        input.note,
        input.decision === 'correct' ? memory.statement : null,
        replacementMemoryId,
      ],
    );
  });
  return getProjectMemoryState(actor);
}

export async function generateProjectKickoffPack(actor: RequestActor) {
  if (!actorHasCapability(actor, 'kickoff.generate')) {
    throw new ProjectMemoryPermissionError(
      'The kickoff.generate capability is required.',
    );
  }
  await withProjectWriteActor(actor.id, async (client) => {
    const { binding } = await requireMembership(client, actor.id, [
      'lead',
      'contributor',
      'viewer',
    ]);
    const memories = await client.query<{
      resource_id: string;
      memory_type: string;
      statement: string;
      scope_kind: string;
      outcome_status: string;
      confidence: number;
      quality_score: number;
    }>(
      `SELECT memory.resource_id, memory.memory_type, memory.statement,
         scope.scope_kind, memory.outcome_status, memory.confidence,
         memory.quality_score
       FROM organisational_memories memory
       JOIN memory_scopes scope ON scope.id = memory.visibility_scope_id
       WHERE memory.lifecycle_status = 'active'
         AND memory.review_status = 'approved'
         AND (
           memory.visibility_scope_id = $1
           OR scope.scope_kind IN ('domain', 'organisation')
         )
       ORDER BY
         CASE memory.outcome_status WHEN 'validated' THEN 0 WHEN 'supported' THEN 1 ELSE 2 END,
         memory.quality_score DESC, memory.confidence DESC
       LIMIT 6`,
      [binding.project_scope_id],
    );
    await client.query(
      `UPDATE kickoff_packs SET status = 'superseded'
       WHERE project_binding_id = $1 AND generated_for_actor_id = $2
         AND status = 'ready'`,
      [binding.id, actor.id],
    );
    const packId = randomUUID();
    await client.query(
      `INSERT INTO kickoff_packs
        (id, workspace_id, project_binding_id, access_scope_id,
         generated_for_actor_id, generation_reason, memory_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        packId,
        IDS.workspace,
        binding.id,
        binding.access_scope_id,
        actor.id,
        'Project start: surface approved precedent visible to this member without copying source-project context.',
        memories.rows.length,
      ],
    );
    for (const [index, memory] of memories.rows.entries()) {
      const relevance = Math.min(
        0.99,
        Math.round(
          (memory.quality_score * 0.55 +
            memory.confidence * 0.35 +
            (memory.scope_kind === 'project' ? 0.1 : 0.05)) *
            100,
        ) / 100,
      );
      await client.query(
        `INSERT INTO kickoff_pack_items
          (id, workspace_id, kickoff_pack_id, memory_id, position,
           relevance_score, rationale)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          stableId('kickoff-pack-item', `${packId}:${memory.resource_id}`),
          IDS.workspace,
          packId,
          memory.resource_id,
          index + 1,
          relevance,
          memory.scope_kind === 'project'
            ? 'Reviewed precedent from this project scope.'
            : `Reviewed ${memory.scope_kind} abstraction; restricted source evidence remains hidden.`,
        ],
      );
    }
  });
  return getProjectMemoryState(actor);
}

export async function getProjectMemoryState(
  actor: RequestActor,
): Promise<ProjectMemoryState> {
  return withActorTransaction(
    { actorId: actor.id, workspaceId: actor.workspaceId },
    async (client) => {
      const bindingResult = await client.query<{
        id: string;
        provider: string;
        external_project_id: string;
        membership_revision: string;
        project_resource_id: string;
        project_name: string;
        client_resource_id: string;
        client_name: string;
        synced_at: string;
        client_memory_enabled: false;
        project_scope_id: string;
      }>(
        `SELECT binding.id, binding.provider, binding.external_project_id,
         binding.membership_revision, binding.project_resource_id,
         project.canonical_name AS project_name, binding.client_resource_id,
         client.canonical_name AS client_name, binding.synced_at,
         binding.client_memory_enabled, binding.project_scope_id
       FROM host_project_bindings binding
       JOIN resources project ON project.id = binding.project_resource_id
       JOIN resources client ON client.id = binding.client_resource_id
       WHERE binding.status = 'active'
       ORDER BY binding.synced_at DESC LIMIT 1`,
      );
      const binding = bindingResult.rows[0];
      if (!binding) {
        return {
          configured: false,
          capture: { debriefs: 0, backgroundRuns: 0, latestRationale: null },
          formation: {
            mode: 'deterministic-general-purpose',
            modelRoute: 'no-model',
            schedule: 'paused',
            nextDueAt: null,
            pendingJobs: 0,
            completedJobs: 0,
          },
          memories: [],
          clientMemory: {
            enabled: false,
            reason:
              'Client-wide memory is disabled until authoritative relationship access is integrated.',
          },
          permissions: {
            canCapture: false,
            canReview: false,
            canGenerateKickoff: false,
          },
        };
      }
      const [members, artifacts, captures, schedule, jobs, memories, pack] =
        await Promise.all([
          client.query<{
            actor_id: string;
            name: string;
            project_role: 'lead' | 'contributor' | 'viewer' | 'service';
            membership_status: 'active' | 'removed';
          }>(
            `SELECT membership.actor_id, actor.name, membership.project_role,
             membership.membership_status
           FROM host_project_memberships membership
           JOIN users actor ON actor.id = membership.actor_id
           WHERE membership.project_binding_id = $1
           ORDER BY CASE membership.project_role
             WHEN 'lead' THEN 0 WHEN 'contributor' THEN 1
             WHEN 'viewer' THEN 2 ELSE 3 END, actor.name`,
            [binding.id],
          ),
          client.query<{ content_type: string; count: string }>(
            `SELECT content.content_type, count(DISTINCT resource.id)::text AS count
           FROM relationships edge
           JOIN resources resource ON resource.id = edge.from_resource_id
           JOIN content_objects content ON content.resource_id = resource.id
           WHERE edge.to_resource_id = $1 AND edge.relationship_type = 'BELONGS_TO'
             AND content.content_type IN ('ResearchNote', 'MeetingNote', 'Document', 'MessageThread', 'ProjectDebrief')
           GROUP BY content.content_type`,
            [binding.project_resource_id],
          ),
          client.query<{
            capture_mode: 'debrief' | 'background';
            rationale: string;
            created_at: string;
          }>(
            `SELECT capture_mode, rationale, started_at AS created_at
           FROM memory_capture_runs WHERE project_binding_id = $1
           ORDER BY started_at DESC`,
            [binding.id],
          ),
          client.query<{ enabled: boolean; next_due_at: string | null }>(
            `SELECT enabled, next_due_at FROM project_memory_schedules
           WHERE project_binding_id = $1`,
            [binding.id],
          ),
          client.query<{ status: string; count: string }>(
            `SELECT status, count(*)::text AS count FROM project_memory_jobs
           WHERE project_binding_id = $1 GROUP BY status`,
            [binding.id],
          ),
          client.query<{
            resource_id: string;
            memory_type: ProjectMemoryState['memories'][number]['type'];
            statement: string;
            scope_kind: ProjectMemoryState['memories'][number]['scope'];
            lifecycle_status: ProjectMemoryState['memories'][number]['status'];
            review_status: ProjectMemoryState['memories'][number]['reviewStatus'];
            outcome_status: ProjectMemoryState['memories'][number]['outcomeStatus'];
            confidence: number;
            quality_score: number;
            process_name: string;
            evidence_count: string;
            created_at: string;
            review_decision:
              | 'approved'
              | 'rejected'
              | 'correction-requested'
              | 'corrected'
              | null;
            review_note: string | null;
            reviewer_name: string | null;
            reviewed_at: string | null;
          }>(
            `SELECT memory.resource_id, memory.memory_type, memory.statement,
             scope.scope_kind, memory.lifecycle_status, memory.review_status,
             memory.outcome_status, memory.confidence, memory.quality_score,
             memory.process_name, memory.created_at,
             (SELECT count(*) FROM organisational_memory_evidence evidence
               WHERE evidence.memory_id = memory.resource_id)::text AS evidence_count,
             review.decision AS review_decision, review.review_note,
             reviewer.name AS reviewer_name, review.created_at AS reviewed_at
           FROM organisational_memories memory
           JOIN memory_scopes scope ON scope.id = memory.visibility_scope_id
           LEFT JOIN LATERAL (
             SELECT * FROM organisational_memory_reviews review_row
             WHERE review_row.memory_id = memory.resource_id
             ORDER BY review_row.created_at DESC LIMIT 1
           ) review ON true
           LEFT JOIN users reviewer ON reviewer.id = review.reviewer_actor_id
           WHERE memory.visibility_scope_id = $1
             OR scope.scope_kind IN ('domain', 'organisation')
           ORDER BY CASE memory.lifecycle_status WHEN 'candidate' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
             memory.created_at DESC`,
            [binding.project_scope_id],
          ),
          client.query<{
            id: string;
            generation_reason: string;
            created_at: string;
          }>(
            `SELECT id, generation_reason, created_at FROM kickoff_packs
           WHERE project_binding_id = $1 AND generated_for_actor_id = $2
             AND status = 'ready'
           ORDER BY created_at DESC LIMIT 1`,
            [binding.id, actor.id],
          ),
        ]);
      const latestPack = pack.rows[0];
      const [contextFoundation, sourceIntegration] = await Promise.all([
        readContextFoundationState(client),
        readSourceIntegrationState(client),
      ]);
      const packItems = latestPack
        ? await client.query<{
            memory_id: string;
            statement: string;
            memory_type: ProjectMemoryState['memories'][number]['type'];
            scope_kind: ProjectMemoryState['memories'][number]['scope'];
            relevance_score: number;
            rationale: string;
          }>(
            `SELECT item.memory_id, memory.statement, memory.memory_type,
             scope.scope_kind, item.relevance_score, item.rationale
           FROM kickoff_pack_items item
           JOIN organisational_memories memory ON memory.resource_id = item.memory_id
           JOIN memory_scopes scope ON scope.id = memory.visibility_scope_id
           WHERE item.kickoff_pack_id = $1 ORDER BY item.position`,
            [latestPack.id],
          )
        : null;
      const actorMembership = members.rows.find(
        (member) => member.actor_id === actor.id,
      );
      const fileTypes = new Set([
        'ResearchNote',
        'MeetingNote',
        'Document',
        'ProjectDebrief',
      ]);
      const files = artifacts.rows
        .filter((row) => fileTypes.has(row.content_type))
        .reduce((total, row) => total + Number(row.count), 0);
      const conversations = artifacts.rows
        .filter((row) => row.content_type === 'MessageThread')
        .reduce((total, row) => total + Number(row.count), 0);
      const jobCounts = new Map(
        jobs.rows.map((row) => [row.status, Number(row.count)]),
      );
      const canCapture =
        actorMembership?.membership_status === 'active' &&
        ['lead', 'contributor'].includes(actorMembership.project_role) &&
        actorHasCapability(actor, 'memory.capture');
      const canReview =
        actorMembership?.membership_status === 'active' &&
        actorMembership.project_role === 'lead' &&
        actorHasCapability(actor, 'memory.review');
      const canGenerateKickoff =
        actorMembership?.membership_status === 'active' &&
        actorMembership.project_role !== 'service' &&
        actorHasCapability(actor, 'kickoff.generate');
      return {
        configured: true,
        integration: {
          bindingId: binding.id,
          provider: binding.provider,
          externalProjectId: binding.external_project_id,
          membershipRevision: binding.membership_revision,
          project: {
            id: binding.project_resource_id,
            name: binding.project_name,
          },
          client: { id: binding.client_resource_id, name: binding.client_name },
          members: members.rows.map((member) => ({
            actorId: member.actor_id,
            name: member.name,
            role: member.project_role,
            status: member.membership_status,
          })),
          files,
          conversations,
          lastSyncedAt: binding.synced_at,
        },
        capture: {
          debriefs: captures.rows.filter(
            (run) => run.capture_mode === 'debrief',
          ).length,
          backgroundRuns: captures.rows.filter(
            (run) => run.capture_mode === 'background',
          ).length,
          latestRationale: captures.rows[0]?.rationale ?? null,
        },
        formation: {
          mode: 'deterministic-general-purpose',
          modelRoute: 'no-model',
          schedule: schedule.rows[0]?.enabled ? 'active' : 'paused',
          nextDueAt: schedule.rows[0]?.next_due_at ?? null,
          pendingJobs:
            (jobCounts.get('pending') ?? 0) + (jobCounts.get('retrying') ?? 0),
          completedJobs:
            (jobCounts.get('completed') ?? 0) +
            (jobCounts.get('no-signal') ?? 0),
        },
        memories: memories.rows.map((memory) => ({
          id: memory.resource_id,
          type: memory.memory_type,
          statement: memory.statement,
          scope: memory.scope_kind,
          status: memory.lifecycle_status,
          reviewStatus: memory.review_status,
          outcomeStatus: memory.outcome_status,
          confidence: memory.confidence,
          qualityScore: memory.quality_score,
          process: memory.process_name,
          evidenceCount: Number(memory.evidence_count),
          createdAt: memory.created_at,
          ...(memory.review_decision &&
          memory.review_note &&
          memory.reviewer_name &&
          memory.reviewed_at
            ? {
                review: {
                  decision: memory.review_decision,
                  note: memory.review_note,
                  reviewer: memory.reviewer_name,
                  reviewedAt: memory.reviewed_at,
                },
              }
            : {}),
        })),
        contextFoundation,
        sourceIntegration,
        ...(latestPack
          ? {
              kickoff: {
                id: latestPack.id,
                generatedAt: latestPack.created_at,
                reason: latestPack.generation_reason,
                items: (packItems?.rows ?? []).map((item) => ({
                  memoryId: item.memory_id,
                  statement: item.statement,
                  memoryType: item.memory_type,
                  sourceScope: item.scope_kind,
                  relevance: item.relevance_score,
                  rationale: item.rationale,
                })),
              },
            }
          : {}),
        clientMemory: {
          enabled: false,
          reason:
            'Client-wide memory is hard-disabled until the host product supplies authoritative relationship access and lifecycle semantics.',
        },
        permissions: { canCapture, canReview, canGenerateKickoff },
      };
    },
  );
}

export async function initializeProjectMemoryDemo() {
  await syncHostProject(new SyntheticHostProductAdapter(), 'atlas-onboarding');
  const serviceActor: RequestActor = {
    id: IDS.users.memoryAgent,
    workspaceId: IDS.workspace,
    name: 'Hypothesis Monitor',
    role: 'System',
    authenticationMode: 'demo',
    capabilities: ['memory.capture'],
  };
  await runProjectBackgroundFormation(serviceActor);
  const lead: RequestActor = {
    id: IDS.users.alex,
    workspaceId: IDS.workspace,
    name: 'Alex Chen',
    role: 'Project Lead',
    authenticationMode: 'demo',
    capabilities: ['memory.capture', 'memory.review', 'kickoff.generate'],
  };
  const state = await getProjectMemoryState(lead);
  const candidate = state.memories.find(
    (memory) => memory.status === 'candidate',
  );
  if (candidate) {
    await reviewProjectMemory(lead, {
      memoryId: candidate.id,
      decision: 'approve',
      note: 'Synthetic fixture review: evidence is attributable and useful within this project.',
    });
  }
  return generateProjectKickoffPack(lead);
}
