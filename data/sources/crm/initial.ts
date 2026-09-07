import type { CrmAccountRecord } from '@/src/modules/connectors/types';

export const INITIAL_CRM_ACCOUNTS: CrmAccountRecord[] = [
  {
    externalId: 'account-381',
    uri: 'crm://northstar/accounts/381',
    name: 'Atlas Bank',
    accountNumber: '381',
    createdAt: '2026-07-15T09:00:00.000Z',
    updatedAt: '2026-08-29T15:20:00.000Z',
    visibility: 'everyone',
    projectRef: 'atlas-onboarding',
    sourceKeys: [
      { type: 'account-id', value: '381' },
      { type: 'account-slug', value: 'atlas-bank' },
    ],
  },
];
