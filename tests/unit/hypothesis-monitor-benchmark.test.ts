import { describe, expect, it } from 'vitest';
import { evaluateHypothesisMonitorBenchmark } from '@/src/modules/benchmarks/hypothesis-monitor-benchmark';
import { generateScaleCorpus } from '@/src/modules/benchmarks/scale-corpus';

describe('hypothesis monitor benchmark', () => {
  it('covers all connectors and detects versioned stance changes without leakage or model spend', () => {
    const result = evaluateHypothesisMonitorBenchmark(
      generateScaleCorpus({ recordCount: 1_000, questionProjectCount: 10, seed: 42 }),
    );
    expect(result).toMatchObject({
      passed: true,
      sourceSystemsCovered: 5,
      permissionLeaks: 0,
      eventKeyCollisions: 0,
      modelRoute: 'no-model',
      externalTokens: 0,
    });
    expect(result.stanceChangesDetected).toBe(result.stanceChangesExpected);
    expect(result.projectsEvaluated).toBe(200);
  });
});
