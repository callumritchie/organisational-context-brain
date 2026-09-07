import type { DocumentSourceRecord } from '@/src/modules/connectors/types';

export const INITIAL_DOCUMENT_RECORDS: DocumentSourceRecord[] = [
  {
    externalId: 'atlas-research-plan-001',
    uri: 'documents://northstar/clients/atlas-bank/onboarding/research-plan',
    title: 'Atlas onboarding research plan',
    body: 'The Atlas Bank client folder contains the working research plan for Atlas Onboarding, including interview recruitment, identity-verification journey mapping, and synthesis activities.',
    author: 'Jamie Patel',
    createdAt: '2026-08-12T09:00:00.000Z',
    updatedAt: '2026-08-29T14:30:00.000Z',
    visibility: 'everyone',
    authority: 0.8,
    projectRef: 'atlas-onboarding',
    clientRef: 'atlas-bank',
    folder: {
      externalId: 'fld-atlas-381',
      path: '/clients/atlas-bank',
      alias: 'Atlas client folder',
    },
  },
];
