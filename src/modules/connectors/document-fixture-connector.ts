import { INITIAL_DOCUMENT_RECORDS } from '@/data/sources/documents/initial';
import type { Connector, DocumentSourceRecord } from './types';

const INITIAL_CURSOR = 'document-fixture-v1';

export class DocumentFixtureConnector implements Connector<DocumentSourceRecord> {
  readonly sourceType = 'documents';

  async listChanges(cursor?: string | null) {
    return {
      records: cursor === INITIAL_CURSOR ? [] : INITIAL_DOCUMENT_RECORDS,
      nextCursor: INITIAL_CURSOR,
    };
  }

  async getObject(externalId: string) {
    return INITIAL_DOCUMENT_RECORDS.find((record) => record.externalId === externalId) ?? null;
  }
}
