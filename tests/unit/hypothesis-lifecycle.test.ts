import { describe, expect, it } from 'vitest';
import { evidenceStatus } from '@/src/modules/hypotheses/lifecycle';

describe('hypothesis evidence lifecycle', () => {
  it.each([
    [0, 0, 'insufficient'],
    [4, 0, 'supported'],
    [4, 1, 'contested'],
    [0, 2, 'refuted'],
  ])('maps %i supporting and %i contradicting observations to %s', (supporting, contradicting, expected) => {
    expect(evidenceStatus(supporting, contradicting)).toBe(expected);
  });
});
