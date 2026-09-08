import type { ResearchSourceRecord } from '@/src/modules/connectors/types';

export const ELIGIBILITY_RESEARCH_MUTATION: ResearchSourceRecord = {
  externalId: 'atlas-eligibility-followup-009',
  uri: 'research://northstar/atlas/studies/eligibility-followup-009',
  title: 'Atlas eligibility guidance follow-up',
  body: 'In a follow-up with six customers who received clear eligibility guidance before identity checks, five completed verification on the first attempt. Participants said knowing which documents qualified reduced uncertainty, suggesting verification friction alone does not explain abandonment.',
  author: 'Jamie Patel',
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-02T15:15:00.000Z',
  visibility: 'everyone',
  authority: 0.89,
  projectRef: 'atlas-onboarding',
  clientRef: 'atlas-bank',
  evidence: {
    title: 'Clear eligibility guidance enables verification completion',
    summary: 'Five of six customers given clear eligibility guidance completed identity verification, disputing a single-cause explanation of abandonment.',
    confidence: 0.87,
    stance: 'CONTRADICTS',
  },
};
