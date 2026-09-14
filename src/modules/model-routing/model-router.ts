import type { PoolClient } from 'pg';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import type {
  ModelRouteDecision,
  ModelGateway,
  ModelGatewayResult,
  ModelRoutePolicyContract,
  ModelRouteTask,
} from './types';

export const BACKGROUND_ROUTE_PROCESS = {
  promptVersion: 'hypothesis-monitor-v1',
  priceVersion: 'no-external-model-v1',
} as const;

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function estimateTokens(characters: number) {
  return Math.max(0, Math.ceil(characters / 4));
}

export function chooseModelRoute(
  policy: ModelRoutePolicyContract,
  task: ModelRouteTask,
): ModelRouteDecision {
  const estimatedInputTokens = estimateTokens(task.inputCharacters);
  const maximumOutputTokens = Math.max(
    0,
    policy.budgetLimits.maximumOutputTokens ?? 500,
  );
  const noModel = (reason: string): ModelRouteDecision => ({
    route: 'no-model',
    reason,
    provider: null,
    model: null,
    estimatedInputTokens: 0,
    maximumOutputTokens: 0,
    estimatedCostMicros: 0,
    status: 'skipped',
  });
  if (task.deterministicSufficient) {
    return noModel('Deterministic evidence-delta rules were sufficient.');
  }
  if (!policy.enabled) {
    return { ...noModel('Model routing is disabled.'), route: 'deferred', status: 'budget-blocked' };
  }
  if (policy.mode === 'deterministic-only') {
    return noModel('Policy permits deterministic processing only.');
  }
  const provider = task.provider ?? policy.allowedProviders[0];
  if (!provider || !policy.allowedProviders.includes(provider)) {
    return { ...noModel('No approved provider is configured.'), route: 'deferred', status: 'budget-blocked' };
  }
  const tokenLimit = policy.budgetLimits.dailyInputTokens ?? 0;
  const costLimit = policy.budgetLimits.monthlyCostMicros ?? 0;
  if (
    tokenLimit <= 0 ||
    costLimit <= 0 ||
    (task.dailyInputTokensUsed ?? 0) + estimatedInputTokens > tokenLimit ||
    (task.monthlyCostMicrosUsed ?? 0) >= costLimit
  ) {
    return { ...noModel('The configured token or cost budget would be exceeded.'), route: 'deferred', status: 'budget-blocked' };
  }
  const highAssurance =
    policy.mode === 'high-assurance' ||
    (policy.mode === 'balanced' &&
      (clampUnit(task.materiality) >=
        (policy.routingRules.highAssuranceMateriality ?? 0.8) ||
        clampUnit(task.ambiguity) >=
          (policy.routingRules.highAssuranceAmbiguity ?? 0.7)));
  const route = highAssurance ? 'high-assurance' : 'economy';
  const model = highAssurance
    ? policy.routingRules.highAssuranceModel
    : policy.routingRules.economyModel;
  if (!model) {
    return { ...noModel(`No ${route} model is configured.`), route: 'deferred', status: 'budget-blocked' };
  }
  return {
    route,
    reason: highAssurance
      ? 'Materiality or ambiguity requires the approved high-assurance route.'
      : 'The task needs interpretation and fits the approved economy route.',
    provider,
    model,
    estimatedInputTokens,
    maximumOutputTokens,
    estimatedCostMicros: 0,
    status: 'routed',
  };
}

export async function executeRoutedModelTask<T>(
  policy: ModelRoutePolicyContract,
  task: ModelRouteTask,
  request: Omit<Parameters<ModelGateway['invoke']>[0], 'model' | 'maximumOutputTokens'>,
  gateways: ModelGateway[],
): Promise<{
  decision: ModelRouteDecision;
  result: ModelGatewayResult<T> | null;
}> {
  const decision = chooseModelRoute(policy, task);
  if (decision.status !== 'routed' || !decision.provider || !decision.model) {
    return { decision, result: null };
  }
  const gateway = gateways.find((candidate) => candidate.provider === decision.provider);
  if (!gateway) throw new Error(`No gateway is registered for ${decision.provider}`);
  const result = await gateway.invoke<T>({
    ...request,
    model: decision.model,
    maximumOutputTokens: decision.maximumOutputTokens,
  });
  return { decision, result };
}

export async function ensureBackgroundRoutePolicy(client: PoolClient) {
  await client.query(
    `INSERT INTO model_route_policies
      (id, workspace_id, access_scope_id, name, mode, routing_rules, budget_limits,
       allowed_providers, enabled)
     VALUES ($1, $2, $3, 'Background hypothesis routing', 'deterministic-only', $4, $5, '[]'::jsonb, true)
     ON CONFLICT (id) DO NOTHING`,
    [
      IDS.modelPolicies.background,
      IDS.workspace,
      IDS.scopes.everyone,
      {
        highAssuranceMateriality: 0.8,
        highAssuranceAmbiguity: 0.7,
      },
      {
        dailyInputTokens: 0,
        monthlyCostMicros: 0,
        maximumOutputTokens: 0,
      },
    ],
  );
}

export async function recordDeterministicRouteDecision(
  client: PoolClient,
  input: {
    monitorRunId?: string | null;
    discoveryRunId?: string | null;
    monitorJobId?: string | null;
    taskFingerprint: string;
    inputCharacters: number;
    routePolicyId?: string;
    accessScopeId?: string;
    purpose?: string;
  },
) {
  const policy: ModelRoutePolicyContract = {
    id: IDS.modelPolicies.background,
    mode: 'deterministic-only',
    enabled: true,
    routingRules: {},
    budgetLimits: { dailyInputTokens: 0, monthlyCostMicros: 0 },
    allowedProviders: [],
  };
  const decision = chooseModelRoute(policy, {
    deterministicSufficient: true,
    inputCharacters: input.inputCharacters,
    ambiguity: 0,
    materiality: 0,
  });
  const proposedInvocationId = stableId(
    'model-invocation',
    input.purpose
      ? `${input.purpose}:${input.taskFingerprint}:${BACKGROUND_ROUTE_PROCESS.promptVersion}`
      : `${input.taskFingerprint}:${BACKGROUND_ROUTE_PROCESS.promptVersion}`,
  );
  const routePolicyId = input.routePolicyId ?? IDS.modelPolicies.background;
  const accessScopeId = input.accessScopeId ?? IDS.scopes.everyone;
  const invocation = await client.query<{ id: string }>(
    `INSERT INTO model_invocations
      (id, workspace_id, access_scope_id, route_policy_id, monitor_run_id, monitor_job_id,
       discovery_run_id,
       purpose, task_fingerprint, selected_route, decision_reason, provider, model,
       prompt_version, estimated_input_tokens, maximum_output_tokens, estimated_cost_micros,
       actual_input_tokens, actual_output_tokens, actual_cost_micros, status, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
       $12, $13, $14, $15, $16, $17, 0, 0, 0, $18, now())
     ON CONFLICT (workspace_id, purpose, task_fingerprint, prompt_version)
     DO UPDATE SET id = model_invocations.id
     RETURNING id`,
    [
      proposedInvocationId,
      IDS.workspace,
      accessScopeId,
      routePolicyId,
      input.monitorRunId,
      input.monitorJobId ?? null,
      input.discoveryRunId ?? null,
      input.purpose ?? 'hypothesis-evaluation',
      input.taskFingerprint,
      decision.route,
      decision.reason,
      decision.provider,
      decision.model,
      BACKGROUND_ROUTE_PROCESS.promptVersion,
      decision.estimatedInputTokens,
      decision.maximumOutputTokens,
      decision.estimatedCostMicros,
      decision.status,
    ],
  );
  const invocationId = invocation.rows[0]?.id ?? proposedInvocationId;
  await client.query(
    `INSERT INTO model_usage_ledger
      (id, workspace_id, access_scope_id, invocation_id, input_tokens, output_tokens,
       cached_tokens, reasoning_tokens, cost_micros, price_version)
     VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0, $5)
     ON CONFLICT (invocation_id) DO NOTHING`,
    [
      stableId('model-usage-ledger', invocationId),
      IDS.workspace,
      accessScopeId,
      invocationId,
      BACKGROUND_ROUTE_PROCESS.priceVersion,
    ],
  );
  return decision;
}
