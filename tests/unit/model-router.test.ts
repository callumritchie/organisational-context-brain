import { describe, expect, it } from 'vitest';
import { chooseModelRoute, estimateTokens } from '@/src/modules/model-routing/model-router';

const basePolicy = {
  id: 'policy',
  mode: 'balanced' as const,
  enabled: true,
  routingRules: {
    economyModel: 'economy-model',
    highAssuranceModel: 'assurance-model',
    highAssuranceMateriality: 0.8,
    highAssuranceAmbiguity: 0.7,
  },
  budgetLimits: {
    dailyInputTokens: 10_000,
    monthlyCostMicros: 1_000_000,
    maximumOutputTokens: 600,
  },
  allowedProviders: ['approved-provider'],
};

describe('model routing', () => {
  it('spends no tokens when deterministic rules are sufficient', () => {
    const decision = chooseModelRoute(basePolicy, {
      deterministicSufficient: true,
      inputCharacters: 40_000,
      ambiguity: 1,
      materiality: 1,
    });
    expect(decision).toMatchObject({ route: 'no-model', estimatedInputTokens: 0, estimatedCostMicros: 0 });
  });

  it('routes ambiguous material work to high assurance within budget', () => {
    const decision = chooseModelRoute(basePolicy, {
      deterministicSufficient: false,
      inputCharacters: 4_000,
      ambiguity: 0.9,
      materiality: 0.9,
      provider: 'approved-provider',
    });
    expect(decision).toMatchObject({
      route: 'high-assurance',
      model: 'assurance-model',
      estimatedInputTokens: estimateTokens(4_000),
      status: 'routed',
    });
  });

  it('defers work that would exceed budget', () => {
    const decision = chooseModelRoute(basePolicy, {
      deterministicSufficient: false,
      inputCharacters: 8_000,
      ambiguity: 0.2,
      materiality: 0.2,
      provider: 'approved-provider',
      dailyInputTokensUsed: 9_000,
    });
    expect(decision).toMatchObject({ route: 'deferred', status: 'budget-blocked' });
  });
});
