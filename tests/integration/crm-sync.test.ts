import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { IDS } from '@/src/modules/canonical/ids';
import { CrmFixtureConnector } from '@/src/modules/connectors/crm-fixture-connector';
import { runCrmSync } from '@/src/modules/sync/crm-sync';

describe('CRM connector sync', () => {
  it('replays unchanged CRM accounts idempotently through the ingestion role', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_INGEST });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true)", [IDS.users.jamie]);
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [IDS.workspace]);
      const result = await runCrmSync(client, new CrmFixtureConnector());
      const keys = await client.query<{ resource_id: string; count: string }>(
        `SELECT resource_id, count(*)::text AS count
         FROM resource_identity_keys
         WHERE source_system = 'crm'
         GROUP BY resource_id`,
      );
      await client.query('COMMIT');
      expect(result).toMatchObject({ seen: 0, changed: 0 });
      expect(result.cursorBefore).toBe(result.cursorAfter);
      expect(keys.rows).toEqual([{ resource_id: IDS.resources.atlas, count: '2' }]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  });
});
