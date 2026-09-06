import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { getAppPool } from '@/src/db/pool';
import { IDS } from '@/src/modules/canonical/ids';
import { assembleContext } from '@/src/modules/context/context-service';

const query = "What do we currently know about why users abandon Atlas Bank's onboarding journey?";
const restrictedMarkers = [
  'Internal verification operations note',
  'Manual compliance hand-offs',
  'research://northstar/atlas/internal/risk-003',
  'sensitive operational context',
];

describe('permission leakage', () => {
  afterAll(async () => { await getAppPool().end(); });

  it('fails closed outside an actor transaction', async () => {
    const result = await getAppPool().query<{ count: string }>('SELECT count(*)::text AS count FROM resources');
    expect(result.rows[0]?.count).toBe('0');
  });

  it('uses a non-owning application role without RLS bypass', async () => {
    const owner = new Pool({ connectionString: process.env.DATABASE_URL_OWNER });
    try {
      const role = await owner.query<{ rolbypassrls: boolean; owns_resources: boolean }>(
        `SELECT app_role.rolbypassrls,
          pg_get_userbyid(resource_table.relowner) = app_role.rolname AS owns_resources
         FROM pg_roles app_role
         JOIN pg_class resource_table ON resource_table.relname = 'resources'
         WHERE app_role.rolname = 'org_brain_app'`,
      );
      expect(role.rows[0]).toEqual({ rolbypassrls: false, owns_resources: false });
    } finally {
      await owner.end();
    }
  });

  it('never allows Morgan restricted evidence or side-channel metadata', async () => {
    const context = await assembleContext(
      { id: IDS.users.morgan, workspaceId: IDS.workspace, name: 'Morgan Reed', role: 'External Contractor' },
      { query, maxEvidence: 6 },
    );
    const serialized = JSON.stringify(context);
    expect(context.evidence).toHaveLength(3);
    for (const marker of restrictedMarkers) expect(serialized).not.toContain(marker);
    expect(context.trace.find((stage) => stage.stage === 'Retrieval')?.detail)
      .toBe('3 permitted lexical candidates. Inaccessible candidates never entered the pipeline.');
    for (const marker of restrictedMarkers) expect(JSON.stringify(context.graph)).not.toContain(marker);
  });

  it('forces RLS and uses a dedicated non-owning ingestion role without bypass', async () => {
    const owner = new Pool({ connectionString: process.env.DATABASE_URL_OWNER });
    try {
      const role = await owner.query<{ rolbypassrls: boolean; owns_resources: boolean; relforcerowsecurity: boolean }>(
        `SELECT ingest_role.rolbypassrls,
          pg_get_userbyid(resource_table.relowner) = ingest_role.rolname AS owns_resources,
          resource_table.relforcerowsecurity
         FROM pg_roles ingest_role
         JOIN pg_class resource_table ON resource_table.relname = 'resources'
         WHERE ingest_role.rolname = 'org_brain_ingest'`,
      );
      expect(role.rows[0]).toEqual({ rolbypassrls: false, owns_resources: false, relforcerowsecurity: true });
    } finally {
      await owner.end();
    }
  });

  it('allows internal team members the restricted assertion', async () => {
    const context = await assembleContext(
      { id: IDS.users.jamie, workspaceId: IDS.workspace, name: 'Jamie Patel', role: 'Consultant' },
      { query, maxEvidence: 6 },
    );
    expect(JSON.stringify(context)).toContain('Manual compliance hand-offs');
  });
});
