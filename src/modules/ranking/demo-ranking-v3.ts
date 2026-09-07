export const DEMO_RANKING_V3 = {
  id: 'demo-ranking-v3',
  description: 'Illustrative hybrid-retrieval, signal and graph weights; expected ordering is tested, not claimed as empirically optimised.',
  weights: {
    retrievalFusion: 0.5,
    authority: 0.12,
    confidence: 0.1,
    freshness: 0.08,
    engagement: 0.07,
    affinity: 0.06,
    epistemicConfidence: 0.04,
    graphConnectivity: 0.03,
  },
} as const;

export type RankingFactor = keyof typeof DEMO_RANKING_V3.weights;

export function scoreCandidate(input: Record<RankingFactor, number>) {
  const contributions = Object.fromEntries(
    (Object.keys(DEMO_RANKING_V3.weights) as RankingFactor[]).map((factor) => [
      factor,
      input[factor] * DEMO_RANKING_V3.weights[factor],
    ]),
  ) as Record<RankingFactor, number>;
  return {
    contributions,
    total: Object.values(contributions).reduce((sum, value) => sum + value, 0),
  };
}
