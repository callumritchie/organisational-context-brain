import { describe, expect, it } from 'vitest';
import { reciprocalRankFusion } from '@/src/modules/search/reciprocal-rank-fusion';

describe('reciprocal-rank fusion', () => {
  it('normalises the leading lexical-only result to one', () => {
    expect(reciprocalRankFusion({ lexical: 1, semantic: null }, false)).toMatchObject({
      semantic: 0,
      score: 1,
    });
  });

  it('rewards evidence that ranks in both hybrid channels', () => {
    const both = reciprocalRankFusion({ lexical: 3, semantic: 2 }, true);
    const lexicalOnly = reciprocalRankFusion({ lexical: 1, semantic: null }, true);
    expect(both.score).toBeGreaterThan(lexicalOnly.score);
  });
});
