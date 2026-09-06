import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL_OWNER;
if (!connectionString) throw new Error('DATABASE_URL_OWNER is required');
const appPassword = process.env.DATABASE_PASSWORD_APP;
const ingestionPassword = process.env.DATABASE_PASSWORD_INGEST;
if (!appPassword || !ingestionPassword) {
  throw new Error('DATABASE_PASSWORD_APP and DATABASE_PASSWORD_INGEST are required');
}

const pool = new Pool({ connectionString });
const migrationDirectory = path.join(process.cwd(), 'src/db/migrations');
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith('.sql'))
  .sort();

const client = await pool.connect();
try {
  await client.query("SELECT set_config('app.bootstrap_app_password', $1, false)", [appPassword]);
  await client.query("SELECT set_config('app.bootstrap_ingest_password', $1, false)", [ingestionPassword]);
  for (const file of migrationFiles) {
    await client.query(await readFile(path.join(migrationDirectory, file), 'utf8'));
    console.log(`Applied ${file}`);
  }
} finally {
  client.release();
  await pool.end();
}
