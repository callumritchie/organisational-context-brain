import { describe, expect, it } from 'vitest';
import { DEMO_RANKING_V2, scoreCandidate } from '@/src/modules/ranking/demo-ranking-v2';

describe('demo-ranking-v2', () => {
  const shared = {
    lexical: 0.7,
    authority: 0.8,
    confidence: 0.9,
    freshness: 0.7,
    engagement: 0.6,
    affinity: 0.9,
    epistemicConfidence: 0.85,
    graphConnectivity: 1,
  };

  it('exposes every signal and graph contribution', () => {
    const score = scoreCandidate({ ...shared, lexical: 1 });
    expect(Object.keys(score.contributions)).toEqual([
      'lexical', 'authority', 'confidence', 'freshness', 'engagement', 'affinity',
      'epistemicConfidence', 'graphConnectivity',
    ]);
    expect(score.total).toBeCloseTo(0.902);
    expect(DEMO_RANKING_V2.description).toContain('not claimed as empirically optimised');
  });

  it('ranks an otherwise equal higher-authority item above a lower-authority item', () => {
    expect(scoreCandidate({ ...shared, authority: 0.95 }).total)
      .toBeGreaterThan(scoreCandidate({ ...shared, authority: 0.4 }).total);
  });

  it('rewards an actor-visible graph connection when other inputs are equal', () => {
    expect(scoreCandidate({ ...shared, graphConnectivity: 1 }).total)
      .toBeGreaterThan(scoreCandidate({ ...shared, graphConnectivity: 0 }).total);
  });
});
