import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import { inMonitorTransaction } from '@/src/modules/memory/hypothesis-monitor';
import type { DiscoveryConceptRule } from './types';

export interface DiscoveryPolicyDefinition {
  accessScopeId: string;
  ownerActorId: string;
  serviceActorId: string;
  name: string;
  subject: string;
  projectResourceId: string;
  sourceIds: string[];
  conceptRules: DiscoveryConceptRule[];
  minimumSourceDiversity?: number;
  intervalSeconds?: number;
}

export async function createDiscoveryPolicy(
  definition: DiscoveryPolicyDefinition,
) {
  if (!definition.sourceIds.length) {
    throw new Error('A discovery policy needs at least one connector source');
  }
  if (!definition.conceptRules.length) {
    throw new Error('A discovery policy needs at least one governed concept rule');
  }
  if (definition.serviceActorId !== IDS.users.memoryAgent) {
    throw new Error(
      'This prototype currently supports the dedicated Hypothesis Monitor service actor',
    );
  }
  const minimumSourceDiversity = Math.max(
    2,
    definition.minimumSourceDiversity ?? 3,
  );
  if (minimumSourceDiversity > definition.sourceIds.length) {
    throw new Error(
      'The source-diversity threshold cannot exceed the configured source count',
    );
  }
  const policyId = stableId(
    'hypothesis-discovery-policy',
    `${definition.projectResourceId}:${definition.subject}:${definition.accessScopeId}`,
  );
  const routePolicyId = stableId('model-route-policy', policyId);
  const scheduleId = stableId('hypothesis-discovery-schedule', policyId);
  await inMonitorTransaction(async (client) => {
    const access = await client.query<{ permitted: boolean }>(
      'SELECT actor_can_access_scope($1) AS permitted',
      [definition.accessScopeId],
    );
    if (!access.rows[0]?.permitted) {
      throw new Error(
        'The configured service actor cannot access this discovery scope',
      );
    }
    const project = await client.query<{ access_scope_id: string }>(
      `SELECT access_scope_id FROM resources
       WHERE id = $1 AND resource_kind = 'entity'`,
      [definition.projectResourceId],
    );
    if (!project.rows[0]) throw new Error('The discovery project was not found');
    if (project.rows[0].access_scope_id !== definition.accessScopeId) {
      throw new Error('The discovery policy and project must use the same scope');
    }
    const sources = await client.query<{ id: string }>(
      `SELECT id FROM sources WHERE workspace_id = $1 AND id = ANY($2::uuid[])`,
      [IDS.workspace, definition.sourceIds],
    );
    if (sources.rows.length !== new Set(definition.sourceIds).size) {
      throw new Error('One or more configured discovery sources were not found');
    }
    const owner = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE workspace_id = $1 AND id = $2`,
      [IDS.workspace, definition.ownerActorId],
    );
    if (!owner.rows[0]) throw new Error('The discovery policy owner was not found');

    await client.query(
      `INSERT INTO model_route_policies
        (id, workspace_id, access_scope_id, name, mode, routing_rules,
         budget_limits, allowed_providers, enabled)
       VALUES ($1, $2, $3, $4, 'deterministic-only', '{}',
         '{"dailyInputTokens":0,"monthlyCostMicros":0,"maximumOutputTokens":0}',
         '[]', true)
       ON CONFLICT (id) DO NOTHING`,
      [
        routePolicyId,
        IDS.workspace,
        definition.accessScopeId,
        `${definition.name} routing`,
      ],
    );
    await client.query(
      `INSERT INTO hypothesis_discovery_policies
        (id, workspace_id, access_scope_id, owner_actor_id, service_actor_id,
         name, subject, project_resource_id, source_ids, concept_rules,
         minimum_source_diversity, status, model_route_policy_id,
         ontology_version_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active',
         $12, (SELECT id FROM ontology_versions
          WHERE workspace_id = $2 AND status = 'current'))
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
         source_ids = EXCLUDED.source_ids, concept_rules = EXCLUDED.concept_rules,
         minimum_source_diversity = EXCLUDED.minimum_source_diversity,
         updated_at = now()`,
      [
        policyId,
        IDS.workspace,
        definition.accessScopeId,
        definition.ownerActorId,
        definition.serviceActorId,
        definition.name,
        definition.subject,
        definition.projectResourceId,
        JSON.stringify([...new Set(definition.sourceIds)]),
        JSON.stringify(definition.conceptRules),
        minimumSourceDiversity,
        routePolicyId,
      ],
    );
    await client.query(
      `INSERT INTO hypothesis_discovery_schedules
        (id, workspace_id, access_scope_id, discovery_policy_id,
         interval_seconds, enabled, next_due_at)
       VALUES ($1, $2, $3, $4, $5, true,
         now() + make_interval(secs => $5))
       ON CONFLICT (discovery_policy_id) DO UPDATE SET
         interval_seconds = EXCLUDED.interval_seconds, updated_at = now()`,
      [
        scheduleId,
        IDS.workspace,
        definition.accessScopeId,
        policyId,
        Math.max(60, definition.intervalSeconds ?? 21_600),
      ],
    );
  });
  return { policyId, routePolicyId, scheduleId };
}
