import type { MeetingSourceRecord } from '@/src/modules/connectors/types';

export const INITIAL_MEETING_RECORDS: MeetingSourceRecord[] = [
  {
    externalId: 'atlas-weekly-2026-08-28',
    uri: 'meeting://northstar/atlas/weekly/2026-08-28',
    title: 'Atlas onboarding weekly synthesis',
    body: 'The team connected the latest interview pattern to the Atlas onboarding work. Customers described the identity step as a black box: after document capture they could not tell whether the check was processing, had failed, or needed another upload. The meeting agreed that uncertainty, not only elapsed time, is a credible abandonment driver.',
    author: 'Alex Chen',
    attendees: ['Alex Chen', 'Jamie Patel'],
    createdAt: '2026-08-28T10:00:00.000Z',
    updatedAt: '2026-08-28T11:00:00.000Z',
    visibility: 'everyone',
    authority: 0.84,
    projectRef: 'atlas-onboarding',
    clientRef: 'atlas-bank',
    evidence: {
      title: 'Status uncertainty after document capture drives abandonment',
      summary: 'A cross-functional synthesis meeting connected unclear identity-check status after document capture with customers leaving onboarding.',
      confidence: 0.83,
      stance: 'SUPPORTS',
    },
  },
];
