import path from 'node:path';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import {
  compareMigrationLedger,
  readMigrationManifest,
} from '@/src/modules/operations/migration-manifest';
import { validateRecoveryConfiguration } from '@/src/modules/operations/production-config';

dotenv.config({ path: '.env.local' });

const configuration = validateRecoveryConfiguration();
const owner = new Pool({
  connectionString: process.env.DATABASE_URL_RECOVERY_OWNER,
  max: 1,
  application_name: 'org-brain-recovery-verifier-owner',
});
const app = new Pool({
  connectionString: process.env.DATABASE_URL_RECOVERY_APP,
  max: 1,
  application_name: 'org-brain-recovery-verifier-app',
});

try {
  await Promise.all([
    owner.query('SET default_transaction_read_only = on'),
    app.query('SET default_transaction_read_only = on'),
  ]);
  const manifest = await readMigrationManifest(
    path.join(process.cwd(), 'src/db/migrations'),
  );
  const ledger = await owner.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations ORDER BY name',
  );
  const migrationState = compareMigrationLedger(manifest, ledger.rows);
  if (!migrationState.current) {
    throw new Error(
      `Restored migration ledger is not current: pending=${migrationState.pending.join(',') || 'none'} changed=${migrationState.changed.join(',') || 'none'} unexpected=${migrationState.unexpected.join(',') || 'none'}`,
    );
  }

  const roles = await owner.query<{
    rolname: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
  }>(
    `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
     WHERE rolname IN ('org_brain_app', 'org_brain_ingest') ORDER BY rolname`,
  );
  if (
    roles.rowCount !== 2 ||
    roles.rows.some((role) => role.rolsuper || role.rolbypassrls)
  ) {
    throw new Error(
      'Restored runtime roles are missing or exceed their authority.',
    );
  }

  const schema = await owner.query<{
    workspace_count: string;
    resource_count: string;
    forced_rls_tables: string;
    session_boundary: string | null;
  }>(`SELECT
      (SELECT count(*) FROM workspaces)::text AS workspace_count,
      (SELECT count(*) FROM resources)::text AS resource_count,
      (SELECT count(*) FROM pg_class
        WHERE relnamespace = 'public'::regnamespace
          AND relname IN ('resources', 'source_objects', 'browser_sessions',
            'hypothesis_records', 'hypothesis_discovery_jobs')
          AND relrowsecurity AND relforcerowsecurity)::text AS forced_rls_tables,
      to_regprocedure('resolve_browser_session(text,text,interval)')::text
        AS session_boundary`);
  const boundary = schema.rows[0];
  if (!boundary?.session_boundary || Number(boundary.forced_rls_tables) !== 5) {
    throw new Error(
      'Restored schema is missing the session boundary or forced RLS.',
    );
  }

  const appBoundary = await app.query<{
    role_name: string;
    session_boundary: string | null;
  }>(`SELECT current_user AS role_name,
      to_regprocedure('resolve_browser_session(text,text,interval)')::text
        AS session_boundary`);
  if (
    appBoundary.rows[0]?.role_name !== 'org_brain_app' ||
    !appBoundary.rows[0]?.session_boundary
  ) {
    throw new Error('The restored application role is not ready.');
  }

  console.log(
    JSON.stringify({
      status: 'verified',
      target: configuration.target,
      migrations: migrationState.verified,
      runtimeRoles: roles.rows.map((role) => role.rolname),
      forcedRlsTables: Number(boundary.forced_rls_tables),
      workspaceCount: Number(boundary.workspace_count),
      resourceCount: Number(boundary.resource_count),
    }),
  );
} finally {
  await Promise.all([owner.end(), app.end()]);
}
