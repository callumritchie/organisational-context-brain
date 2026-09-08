import { describe, expect, it } from 'vitest';
import { assessEpistemicState } from '@/src/modules/context/epistemic-state';

describe('epistemic assessment', () => {
  it('reports supported evidence until a contradiction is visible', () => {
    expect(assessEpistemicState([{ stance: 'SUPPORTS' }, { stance: 'SUPPORTS' }])).toMatchObject({
      status: 'supported',
      supportingEvidence: 2,
      contradictingEvidence: 0,
    });
  });

  it('reports contested evidence when a contradiction is visible', () => {
    expect(assessEpistemicState([{ stance: 'SUPPORTS' }, { stance: 'CONTRADICTS' }])).toMatchObject({
      status: 'contested',
      supportingEvidence: 1,
      contradictingEvidence: 1,
    });
  });

  it('reports insufficient evidence for an empty context', () => {
    expect(assessEpistemicState([])).toMatchObject({
      status: 'insufficient',
      supportingEvidence: 0,
      contradictingEvidence: 0,
    });
  });
});
