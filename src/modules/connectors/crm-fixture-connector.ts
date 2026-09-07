import { INITIAL_CRM_ACCOUNTS } from '@/data/sources/crm/initial';
import type { Connector, CrmAccountRecord } from './types';

const INITIAL_CURSOR = 'crm-fixture-v1';

export class CrmFixtureConnector implements Connector<CrmAccountRecord> {
  readonly sourceType = 'crm-accounts';

  async listChanges(cursor?: string | null) {
    return {
      records: cursor === INITIAL_CURSOR ? [] : INITIAL_CRM_ACCOUNTS,
      nextCursor: INITIAL_CURSOR,
    };
  }

  async getObject(externalId: string) {
    return INITIAL_CRM_ACCOUNTS.find((record) => record.externalId === externalId) ?? null;
  }
}
