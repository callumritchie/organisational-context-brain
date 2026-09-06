import { describe, expect, it } from 'vitest';
import { understandQuery } from '@/src/modules/search/query-understanding';

describe('query understanding', () => {
  it('identifies the Atlas context and expands abandonment language', () => {
    const result = understandQuery('Why do users abandon Atlas onboarding?');
    expect(result.entities.map((entity) => entity.name)).toEqual([
      'Atlas Bank',
      'Atlas Onboarding',
      'Identity verification drives abandonment',
    ]);
    expect(result.tsQuery).toContain('abandon:*');
    expect(result.tsQuery).toContain('verification:*');
  });
});
