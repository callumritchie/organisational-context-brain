import type { ContextEvidence, ContextResponse } from './types';

export function assessEpistemicState(
  evidence: Array<Pick<ContextEvidence, 'stance'>>,
): ContextResponse['epistemicState'] {
  const supportingEvidence = evidence.filter((item) => item.stance === 'SUPPORTS').length;
  const contradictingEvidence = evidence.filter((item) => item.stance === 'CONTRADICTS').length;

  if (contradictingEvidence > 0) {
    return {
      status: 'contested',
      supportingEvidence,
      contradictingEvidence,
      assessment: 'Actor-visible evidence now disputes a single-cause explanation. Treat the working hypothesis as contested.',
    };
  }
  if (supportingEvidence > 0) {
    return {
      status: 'supported',
      supportingEvidence,
      contradictingEvidence,
      assessment: 'The selected actor-visible evidence supports the working hypothesis and contains no direct contradiction.',
    };
  }
  return {
    status: 'insufficient',
    supportingEvidence,
    contradictingEvidence,
    assessment: 'There is not enough actor-visible evidence to assess the working hypothesis.',
  };
}
