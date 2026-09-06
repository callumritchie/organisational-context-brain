export const DEMO_RANKING_V1 = {
  id: 'demo-ranking-v1',
  description: 'Illustrative Milestone 1 weights; expected ordering is tested, not claimed as empirically optimised.',
  weights: {
    lexical: 0.62,
    authority: 0.16,
    confidence: 0.12,
    freshness: 0.1,
  },
} as const;

export function scoreCandidate(input: {
  lexical: number;
  authority: number;
  confidence: number;
  freshness: number;
}) {
  const contributions = {
    lexical: input.lexical * DEMO_RANKING_V1.weights.lexical,
    authority: input.authority * DEMO_RANKING_V1.weights.authority,
    confidence: input.confidence * DEMO_RANKING_V1.weights.confidence,
    freshness: input.freshness * DEMO_RANKING_V1.weights.freshness,
  };
  return {
    contributions,
    total: Object.values(contributions).reduce((sum, value) => sum + value, 0),
  };
}
