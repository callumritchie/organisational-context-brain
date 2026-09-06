import { Pool } from 'pg';

declare global {
  var __orgBrainAppPool: Pool | undefined;
  var __orgBrainOwnerPool: Pool | undefined;
  var __orgBrainIngestionPool: Pool | undefined;
}

function makePool(connectionString: string | undefined, label: string) {
  if (!connectionString) {
    throw new Error(`${label} is required. Run npm run demo:setup after configuring .env.local.`);
  }
  return new Pool({ connectionString, max: 8 });
}

export function getAppPool() {
  globalThis.__orgBrainAppPool ??= makePool(process.env.DATABASE_URL_APP, 'DATABASE_URL_APP');
  return globalThis.__orgBrainAppPool;
}

export function getOwnerPool() {
  globalThis.__orgBrainOwnerPool ??= makePool(process.env.DATABASE_URL_OWNER, 'DATABASE_URL_OWNER');
  return globalThis.__orgBrainOwnerPool;
}

export function getIngestionPool() {
  globalThis.__orgBrainIngestionPool ??= makePool(
    process.env.DATABASE_URL_INGEST,
    'DATABASE_URL_INGEST',
  );
  return globalThis.__orgBrainIngestionPool;
}
