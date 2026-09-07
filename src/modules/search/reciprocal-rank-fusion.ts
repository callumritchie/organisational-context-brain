export const RECIPROCAL_RANK_CONSTANT = 60;

export function reciprocalRankFusion(
  ranks: { lexical: number | null; semantic: number | null },
  semanticAvailable: boolean,
) {
  const lexical = ranks.lexical ? 1 / (RECIPROCAL_RANK_CONSTANT + ranks.lexical) : 0;
  const semantic = semanticAvailable && ranks.semantic
    ? 1 / (RECIPROCAL_RANK_CONSTANT + ranks.semantic)
    : 0;
  const maximum = (semanticAvailable ? 2 : 1) / (RECIPROCAL_RANK_CONSTANT + 1);
  return {
    lexical,
    semantic,
    score: (lexical + semantic) / maximum,
  };
}
