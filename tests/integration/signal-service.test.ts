import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { IDS } from '@/src/modules/canonical/ids';
import { seedInitialSignals } from '@/src/modules/signals/signal-service';

describe('first-class ranking signals', () => {
  it('replays fixture observations idempotently and maintains one current snapshot per evidence resource', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_INGEST });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true)", [IDS.users.jamie]);
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [IDS.workspace]);
      const result = await seedInitialSignals(client);
      const observations = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM signal_observations',
      );
      const snapshots = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM signal_snapshots WHERE is_current',
      );
      const untraceable = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM signal_observations WHERE source_object_version_id IS NULL',
      );
      await client.query('COMMIT');
      expect(result).toEqual({ observations: 20, snapshots: 4 });
      expect(observations.rows[0]?.count).toBe('20');
      expect(snapshots.rows[0]?.count).toBe('4');
      expect(untraceable.rows[0]?.count).toBe('0');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('hides the internal evidence snapshot from Morgan at the database boundary', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true)", [IDS.users.morgan]);
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [IDS.workspace]);
      const snapshots = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM signal_snapshots WHERE is_current',
      );
      const observations = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM signal_observations',
      );
      await client.query('COMMIT');
      expect(snapshots.rows[0]?.count).toBe('3');
      expect(observations.rows[0]?.count).toBe('15');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  });
});
