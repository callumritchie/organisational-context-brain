import path from 'node:path';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import {
  compareMigrationLedger,
  readMigrationManifest,
} from '@/src/modules/operations/migration-manifest';

dotenv.config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL_OWNER;
if (!connectionString) throw new Error('DATABASE_URL_OWNER is required');
const appPassword = process.env.DATABASE_PASSWORD_APP;
const ingestionPassword = process.env.DATABASE_PASSWORD_INGEST;
if (!appPassword || !ingestionPassword) {
  throw new Error(
    'DATABASE_PASSWORD_APP and DATABASE_PASSWORD_INGEST are required',
  );
}

const pool = new Pool({ connectionString });
const migrationDirectory = path.join(process.cwd(), 'src/db/migrations');
const manifest = await readMigrationManifest(migrationDirectory);

const client = await pool.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  await client.query('REVOKE ALL ON schema_migrations FROM PUBLIC');
  await client.query(
    "SELECT pg_advisory_lock(hashtext('organisational-context-brain:migrations'))",
  );
  const ledger = await client.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations ORDER BY name',
  );
  const comparison = compareMigrationLedger(manifest, ledger.rows);
  if (comparison.changed.length || comparison.unexpected.length) {
    throw new Error(
      `Migration integrity check failed: changed=${comparison.changed.join(',') || 'none'} unexpected=${comparison.unexpected.join(',') || 'none'}`,
    );
  }

  for (const migration of manifest) {
    if (!comparison.pending.includes(migration.name)) {
      console.log(`Verified ${migration.name}`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(
        "SELECT set_config('app.bootstrap_app_password', $1, true)",
        [appPassword],
      );
      await client.query(
        "SELECT set_config('app.bootstrap_ingest_password', $1, true)",
        [ingestionPassword],
      );
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
        [migration.name, migration.checksum],
      );
      await client.query('COMMIT');
      console.log(`Applied ${migration.name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  await client.query('BEGIN');
  try {
    await client.query(
      "SELECT set_config('app.bootstrap_app_password', $1, true)",
      [appPassword],
    );
    await client.query(
      "SELECT set_config('app.bootstrap_ingest_password', $1, true)",
      [ingestionPassword],
    );
    await client.query(`DO $$
      BEGIN
        EXECUTE format(
          'ALTER ROLE org_brain_app PASSWORD %L',
          current_setting('app.bootstrap_app_password')
        );
        EXECUTE format(
          'ALTER ROLE org_brain_ingest PASSWORD %L',
          current_setting('app.bootstrap_ingest_password')
        );
      END
    $$`);
    await client.query(
      'GRANT SELECT (name, checksum) ON schema_migrations TO org_brain_app',
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
} finally {
  await client
    .query(
      "SELECT pg_advisory_unlock(hashtext('organisational-context-brain:migrations'))",
    )
    .catch(() => undefined);
  client.release();
  await pool.end();
}
