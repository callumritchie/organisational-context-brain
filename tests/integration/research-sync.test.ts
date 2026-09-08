import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { ResearchFixtureConnector } from '@/src/modules/connectors/research-fixture-connector';
import { MeetingFixtureConnector } from '@/src/modules/connectors/meeting-fixture-connector';
import type { Connector, ResearchSourceRecord } from '@/src/modules/connectors/types';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import { runMeetingSync, runResearchSync } from '@/src/modules/sync/research-sync';

describe('research connector sync', () => {
  it('replays an unchanged cursor idempotently', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_INGEST });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true)", [IDS.users.ingestion]);
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [IDS.workspace]);
      const result = await runResearchSync(client, new ResearchFixtureConnector());
      await client.query('COMMIT');
      expect(result.seen).toBe(0);
      expect(result.changed).toBe(0);
      expect(result.cursorBefore).toBe(result.cursorAfter);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('chunks a changed long source version and retires its previous search document', async () => {
    const body = Array.from(
      { length: 80 },
      (_, index) => `Interview section ${index + 1} preserves source-grounded onboarding context.`,
    ).join(' ');
    const record: ResearchSourceRecord = {
      externalId: 'atlas-study-017',
      uri: 'research://northstar/atlas/studies/017',
      title: 'Atlas onboarding moderated usability study',
      body,
      author: 'Jamie Patel',
      createdAt: '2026-08-12T09:00:00.000Z',
      updatedAt: '2026-09-08T12:00:00.000Z',
      visibility: 'everyone',
      authority: 0.92,
      projectRef: 'atlas-onboarding',
      clientRef: 'atlas-bank',
      evidence: {
        title: 'Repeated identity checks create a high-friction abandonment point',
        summary: 'A long-form follow-up preserves the detailed interview context.',
        confidence: 0.88,
        stance: 'SUPPORTS',
      },
    };
    const connector: Connector<ResearchSourceRecord> = {
      sourceType: 'research-repository',
      async listChanges() {
        return { records: [record], nextCursor: 'research-test-long-version' };
      },
      async getObject(externalId) {
        return externalId === record.externalId ? record : null;
      },
    };
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_INGEST });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true)", [IDS.users.ingestion]);
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [IDS.workspace]);
      const result = await runResearchSync(client, connector);
      const evidenceId = stableId('evidence-resource', record.externalId);
      const documents = await client.query<{
        active: boolean;
        chunk_start_offset: number;
        chunk_end_offset: number;
      }>(
        `SELECT active, chunk_start_offset, chunk_end_offset
         FROM search_documents WHERE resource_id = $1
         ORDER BY active, chunk_index`,
        [evidenceId],
      );

      expect(result.changed).toBe(1);
      expect(documents.rows.filter((document) => document.active).length).toBeGreaterThan(1);
      expect(documents.rows.filter((document) => !document.active)).toHaveLength(1);
      for (const document of documents.rows.filter((candidate) => candidate.active)) {
        expect(document.chunk_start_offset).toBeGreaterThanOrEqual(0);
        expect(document.chunk_end_offset).toBeLessThanOrEqual(body.length);
      }
      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  });
});

describe('meeting connector sync', () => {
  it('replays an unchanged cursor idempotently through the ingestion role', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_INGEST });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true)", [IDS.users.ingestion]);
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [IDS.workspace]);
      const result = await runMeetingSync(client, new MeetingFixtureConnector());
      await client.query('COMMIT');
      expect(result.seen).toBe(0);
      expect(result.changed).toBe(0);
      expect(result.cursorBefore).toBe(result.cursorAfter);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  });
});
