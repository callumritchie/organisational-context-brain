import { describe, expect, it } from 'vitest';
import { DEMO_RANKING_V1, scoreCandidate } from '@/src/modules/ranking/demo-ranking-v1';

describe('demo-ranking-v1', () => {
  it('exposes every illustrative contribution', () => {
    const score = scoreCandidate({ lexical: 1, authority: 0.8, confidence: 0.9, freshness: 0.7 });
    expect(Object.keys(score.contributions)).toEqual(['lexical', 'authority', 'confidence', 'freshness']);
    expect(score.total).toBeCloseTo(0.926);
    expect(DEMO_RANKING_V1.description).toContain('not claimed as empirically optimised');
  });

  it('ranks an otherwise equal higher-authority item above a lower-authority item', () => {
    const shared = { lexical: 0.7, confidence: 0.8, freshness: 0.9 };
    expect(scoreCandidate({ ...shared, authority: 0.95 }).total)
      .toBeGreaterThan(scoreCandidate({ ...shared, authority: 0.4 }).total);
  });
});
