import { INITIAL_MEETING_RECORDS } from '@/data/sources/meetings/initial';
import type { Connector, MeetingSourceRecord } from './types';

const INITIAL_CURSOR = 'meeting-fixture-v1';

export class MeetingFixtureConnector implements Connector<MeetingSourceRecord> {
  readonly sourceType = 'meeting-notes';

  async listChanges(cursor?: string | null) {
    return {
      records: cursor === INITIAL_CURSOR ? [] : INITIAL_MEETING_RECORDS,
      nextCursor: INITIAL_CURSOR,
    };
  }

  async getObject(externalId: string) {
    return INITIAL_MEETING_RECORDS.find((record) => record.externalId === externalId) ?? null;
  }
}
