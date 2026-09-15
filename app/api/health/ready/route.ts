import { NextResponse } from 'next/server';
import { getAppPool } from '@/src/db/pool';
import { currentMigration } from '@/src/modules/operations/current-migration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await getAppPool().query<{
      role_name: string;
      session_boundary: string | null;
      migration_checksum: string | null;
    }>(
      `SELECT current_user AS role_name,
        to_regprocedure('resolve_browser_session(text,text,interval)')::text
          AS session_boundary,
        (SELECT checksum FROM schema_migrations WHERE name = $1)
          AS migration_checksum`,
      [currentMigration.name],
    );
    const check = result.rows[0];
    if (
      check?.role_name !== 'org_brain_app' ||
      check.session_boundary === null ||
      check.migration_checksum !== currentMigration.checksum
    ) {
      throw new Error('The database role or migration boundary is not ready.');
    }
    return NextResponse.json(
      { status: 'ready', database: 'available', migrations: 'current' },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'readiness_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }),
    );
    return NextResponse.json(
      { status: 'not-ready' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
