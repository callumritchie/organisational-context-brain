import { INITIAL_MESSAGE_RECORDS } from '@/data/sources/messages/initial';
import type { Connector, MessageSourceRecord } from './types';

const INITIAL_CURSOR = 'message-fixture-v1';

export class MessageFixtureConnector implements Connector<MessageSourceRecord> {
  readonly sourceType = 'messages';

  async listChanges(cursor?: string | null) {
    return {
      records: cursor === INITIAL_CURSOR ? [] : INITIAL_MESSAGE_RECORDS,
      nextCursor: INITIAL_CURSOR,
    };
  }

  async getObject(externalId: string) {
    return INITIAL_MESSAGE_RECORDS.find((record) => record.externalId === externalId) ?? null;
  }
}
