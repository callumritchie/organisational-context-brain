import { describe, expect, it } from 'vitest';
import { contextRequestSchema } from '@/src/modules/context/types';

describe('context contract', () => {
  it('rejects an actor supplied in the request body', () => {
    const result = contextRequestSchema.safeParse({
      query: 'Why do users abandon onboarding?',
      actorId: '20000000-0000-4000-8000-000000000001',
    });
    expect(result.success).toBe(false);
  });
});
