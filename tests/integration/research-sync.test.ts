import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { ResearchFixtureConnector } from '@/src/modules/connectors/research-fixture-connector';
import { MeetingFixtureConnector } from '@/src/modules/connectors/meeting-fixture-connector';
import { IDS } from '@/src/modules/canonical/ids';
import { runMeetingSync, runResearchSync } from '@/src/modules/sync/research-sync';

describe('research connector sync', () => {
  it('replays an unchanged cursor idempotently', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_INGEST });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true)", [IDS.users.jamie]);
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
});

describe('meeting connector sync', () => {
  it('replays an unchanged cursor idempotently through the ingestion role', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_INGEST });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true)", [IDS.users.jamie]);
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
