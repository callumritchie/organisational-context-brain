import { INITIAL_RESEARCH_RECORDS } from '@/data/sources/research/initial';
import type { Connector, ResearchSourceRecord } from './types';

const INITIAL_CURSOR = 'research-fixture-v1';

export class ResearchFixtureConnector implements Connector<ResearchSourceRecord> {
  readonly sourceType = 'research-repository';

  async listChanges(cursor?: string | null) {
    return {
      records: cursor === INITIAL_CURSOR ? [] : INITIAL_RESEARCH_RECORDS,
      nextCursor: INITIAL_CURSOR,
    };
  }

  async getObject(externalId: string) {
    return INITIAL_RESEARCH_RECORDS.find((record) => record.externalId === externalId) ?? null;
  }
}
