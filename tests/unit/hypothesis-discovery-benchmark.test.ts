import { describe, expect, it } from 'vitest';
import {
  evaluateHypothesisDiscoveryBenchmark,
  generateHypothesisDiscoveryCases,
} from '@/src/modules/benchmarks/hypothesis-discovery-benchmark';

describe('hypothesis discovery benchmark', () => {
  it('forms grounded and falsifiable candidates across 50 unfamiliar cases without external spend', () => {
    const result = evaluateHypothesisDiscoveryBenchmark(
      generateHypothesisDiscoveryCases(50),
    );
    expect(result).toMatchObject({
      passed: true,
      casesEvaluated: 50,
      candidatesFormed: 50,
      primaryConceptsCorrect: 50,
      groundedCandidates: 50,
      crossSourceCandidates: 50,
      falsifiableCandidates: 50,
      modelRoute: 'no-model',
      externalTokens: 0,
      externalCostMicros: 0,
    });
  });
});
