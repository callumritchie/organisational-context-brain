export type ModelRouteMode =
  | 'deterministic-only'
  | 'economy'
  | 'balanced'
  | 'high-assurance';

export interface ModelRoutePolicyContract {
  id: string;
  mode: ModelRouteMode;
  enabled: boolean;
  routingRules: {
    economyModel?: string;
    highAssuranceModel?: string;
    highAssuranceMateriality?: number;
    highAssuranceAmbiguity?: number;
  };
  budgetLimits: {
    dailyInputTokens?: number;
    monthlyCostMicros?: number;
    maximumOutputTokens?: number;
  };
  allowedProviders: string[];
}

export interface ModelRouteTask {
  deterministicSufficient: boolean;
  inputCharacters: number;
  ambiguity: number;
  materiality: number;
  provider?: string;
  dailyInputTokensUsed?: number;
  monthlyCostMicrosUsed?: number;
}

export interface ModelRouteDecision {
  route: 'no-model' | 'economy' | 'high-assurance' | 'deferred';
  reason: string;
  provider: string | null;
  model: string | null;
  estimatedInputTokens: number;
  maximumOutputTokens: number;
  estimatedCostMicros: number;
  status: 'skipped' | 'routed' | 'budget-blocked';
}

export interface ModelGatewayRequest {
  purpose: string;
  input: string;
  model: string;
  maximumOutputTokens: number;
}

export interface ModelGatewayResult<T> {
  output: T;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  costMicros: number;
}

export interface ModelGateway {
  provider: string;
  invoke<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>>;
}
