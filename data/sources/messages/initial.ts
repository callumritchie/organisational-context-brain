import type { MessageSourceRecord } from '@/src/modules/connectors/types';

export const INITIAL_MESSAGE_RECORDS: MessageSourceRecord[] = [
  {
    externalId: 'thread-atlas-onboarding-2026-08-30',
    uri: 'messages://northstar/channels/atlas-onboarding/threads/2026-08-30-synthesis',
    title: 'Atlas onboarding channel synthesis thread',
    body: 'Alex and Jamie used the Atlas Onboarding project channel to coordinate the next synthesis. They linked the research plan, agreed to separate elapsed verification time from status uncertainty, and assigned Jamie to consolidate the next interview round.',
    author: 'Alex Chen',
    participants: ['Alex Chen', 'Jamie Patel'],
    createdAt: '2026-08-30T09:10:00.000Z',
    updatedAt: '2026-08-30T09:42:00.000Z',
    visibility: 'everyone',
    authority: 0.76,
    projectRef: 'atlas-onboarding',
    clientRef: 'atlas-bank',
    channel: {
      externalId: 'chn-atlas-onboarding',
      slug: 'atlas-onboarding',
      alias: 'Atlas onboarding channel',
    },
    threadExternalId: 'thr-2026-08-30-synthesis',
  },
];
