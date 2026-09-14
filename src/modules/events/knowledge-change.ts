import type { PoolClient } from 'pg';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';

export interface KnowledgeChange {
  accessScopeId: string;
  sourceObjectVersionId: string;
  affectedResourceIds: string[];
  changeKind?: 'created' | 'updated' | 'deleted';
}

export interface KnowledgeChangeBatch {
  sourceId: string;
  connectorType: string;
  syncRunId: string;
  changes: KnowledgeChange[];
}

export async function recordKnowledgeChangeEvents(
  client: PoolClient,
  batch: KnowledgeChangeBatch,
) {
  const byScope = new Map<string, KnowledgeChange[]>();
  for (const change of batch.changes) {
    const values = byScope.get(change.accessScopeId) ?? [];
    values.push(change);
    byScope.set(change.accessScopeId, values);
  }
  const results: Array<{ eventId: string; jobIds: string[]; status: 'queued' | 'ignored' }> = [];
  for (const [accessScopeId, changes] of byScope) {
    const triggerRef = `sync-run:${batch.syncRunId}:scope:${accessScopeId}`;
    const eventId = stableId('source-change-event', triggerRef);
    const versions = [...new Set(changes.map((change) => change.sourceObjectVersionId))];
    const resources = [...new Set(changes.flatMap((change) => change.affectedResourceIds))];
    const changeKinds = [...new Set(changes.map((change) => change.changeKind ?? 'updated'))];
    const monitorPolicies = await client.query<{
      id: string;
      trigger_policy: { sources?: string[] };
    }>(
      `SELECT id, trigger_policy FROM monitor_policies
       WHERE workspace_id = $1 AND access_scope_id = $2 AND status = 'active'`,
      [IDS.workspace, accessScopeId],
    );
    const matchingMonitors = monitorPolicies.rows.filter((policy) =>
      (policy.trigger_policy.sources ?? []).includes(batch.sourceId),
    );
    const discoveryPolicies = await client.query<{
      id: string;
      project_resource_id: string;
      source_ids: string[];
    }>(
      `SELECT id, project_resource_id, source_ids
       FROM hypothesis_discovery_policies
       WHERE workspace_id = $1 AND access_scope_id = $2 AND status = 'active'`,
      [IDS.workspace, accessScopeId],
    );
    const matchingDiscoveries = discoveryPolicies.rows.filter(
      (policy) =>
        policy.source_ids.includes(batch.sourceId) &&
        resources.includes(policy.project_resource_id),
    );
    const status =
      matchingMonitors.length > 0 || matchingDiscoveries.length > 0
        ? 'queued'
        : 'ignored';
    await client.query(
      `INSERT INTO source_change_events
        (id, workspace_id, access_scope_id, source_id, trigger_ref, changed_objects,
         event_kind, connector_type, change_kind, source_object_version_ids,
         affected_resource_ids, routing_payload, status, processed_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'source-change', $7, $8, $9, $10, $11, $12,
         CASE WHEN $12 = 'ignored' THEN now() ELSE NULL END)
       ON CONFLICT (workspace_id, trigger_ref) DO UPDATE SET
         source_object_version_ids = EXCLUDED.source_object_version_ids,
         affected_resource_ids = EXCLUDED.affected_resource_ids,
         routing_payload = EXCLUDED.routing_payload`,
      [
        eventId,
        IDS.workspace,
        accessScopeId,
        batch.sourceId,
        triggerRef,
        changes.length,
        batch.connectorType,
        changeKinds.length === 1 ? changeKinds[0] : 'mixed',
        JSON.stringify(versions),
        JSON.stringify(resources),
        { syncRunId: batch.syncRunId, connectorType: batch.connectorType },
        status,
      ],
    );
    const jobIds: string[] = [];
    for (const policy of matchingMonitors) {
      const idempotencyKey = `event:${policy.id}:${eventId}`;
      const jobId = stableId('monitor-job', idempotencyKey);
      await client.query(
        `INSERT INTO monitor_jobs
          (id, workspace_id, access_scope_id, monitor_policy_id, source_change_event_id,
           job_kind, idempotency_key, status, priority, payload)
         VALUES ($1, $2, $3, $4, $5, 'event', $6, 'pending', 70, $7)
         ON CONFLICT (workspace_id, idempotency_key) DO NOTHING`,
        [
          jobId,
          IDS.workspace,
          accessScopeId,
          policy.id,
          eventId,
          idempotencyKey,
          { sourceId: batch.sourceId, connectorType: batch.connectorType },
        ],
      );
      jobIds.push(jobId);
    }
    for (const policy of matchingDiscoveries) {
      const idempotencyKey = `event-discovery:${policy.id}:${eventId}`;
      const jobId = stableId('hypothesis-discovery-job', idempotencyKey);
      await client.query(
        `INSERT INTO hypothesis_discovery_jobs
          (id, workspace_id, access_scope_id, discovery_policy_id,
           source_change_event_id, job_kind, idempotency_key, status, priority,
           payload)
         VALUES ($1, $2, $3, $4, $5, 'event', $6, 'pending', 70, $7)
         ON CONFLICT (workspace_id, idempotency_key) DO NOTHING`,
        [
          jobId,
          IDS.workspace,
          accessScopeId,
          policy.id,
          eventId,
          idempotencyKey,
          { sourceId: batch.sourceId, connectorType: batch.connectorType },
        ],
      );
      jobIds.push(jobId);
    }
    results.push({ eventId, jobIds, status });
  }
  return results;
}
