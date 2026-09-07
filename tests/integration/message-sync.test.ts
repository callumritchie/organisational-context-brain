import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { IDS } from '@/src/modules/canonical/ids';
import { MessageFixtureConnector } from '@/src/modules/connectors/message-fixture-connector';
import { runMessageSync } from '@/src/modules/sync/research-sync';

describe('Messages connector sync', () => {
  it('replays unchanged messages and preserves channel and thread identities', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_INGEST });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true)", [IDS.users.jamie]);
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [IDS.workspace]);
      const result = await runMessageSync(client, new MessageFixtureConnector());
      const keys = await client.query<{ resource_id: string; key_type: string; external_key: string }>(
        `SELECT resource_id, key_type, external_key
         FROM resource_identity_keys
         WHERE source_system = 'messages'
         ORDER BY key_type`,
      );
      const threads = await client.query<{ id: string; resource_kind: string; semantic_type: string }>(
        `SELECT id, resource_kind, semantic_type
         FROM resources
         WHERE canonical_name = 'Atlas onboarding channel synthesis thread'`,
      );
      await client.query('COMMIT');
      expect(result).toMatchObject({ seen: 0, changed: 0 });
      expect(result.cursorBefore).toBe(result.cursorAfter);
      expect(keys.rows).toEqual([
        { resource_id: IDS.resources.project, key_type: 'channel-id', external_key: 'chn-atlas-onboarding' },
        { resource_id: IDS.resources.project, key_type: 'channel-slug', external_key: 'atlas-onboarding' },
        { resource_id: threads.rows[0]?.id, key_type: 'thread-id', external_key: 'thr-2026-08-30-synthesis' },
      ]);
      expect(threads.rows[0]).toMatchObject({ resource_kind: 'content', semantic_type: 'MessageThread' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  });
});
