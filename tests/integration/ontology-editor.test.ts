import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { IDS } from '@/src/modules/canonical/ids';
import {
  OntologyPermissionError,
  publishOntologyRelationship,
} from '@/src/modules/ontology/ontology-editor';

const edit = {
  name: 'COLLABORATES_WITH',
  from: 'Person',
  to: 'Person',
  description: 'One person actively collaborates with another person.',
};

describe('ontology editor', () => {
  it('publishes an attributed immutable version and preserves its predecessor', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_INGEST });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true)", [IDS.users.alex]);
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [IDS.workspace]);
      const ontology = await publishOntologyRelationship(
        client,
        { id: IDS.users.alex, role: 'Project Lead' },
        edit,
      );
      const versions = await client.query<{
        version: string;
        status: string;
        created_by: string | null;
        checksum: string;
      }>(
        `SELECT version, status, created_by, checksum
         FROM ontology_versions
         ORDER BY version`,
      );
      expect(ontology).toMatchObject({ version: 'northstar-ontology-v2', status: 'current' });
      expect(ontology.relationships).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: edit.name, from: ['Person'], to: ['Person'] }),
      ]));
      expect(versions.rows).toEqual([
        expect.objectContaining({ version: 'northstar-ontology-v1', status: 'superseded', created_by: null }),
        expect.objectContaining({
          version: 'northstar-ontology-v2',
          status: 'current',
          created_by: IDS.users.alex,
          checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]);
      await expect(client.query(
        `UPDATE ontology_versions SET checksum = 'tampered' WHERE version = 'northstar-ontology-v2'`,
      )).rejects.toThrow('Ontology version snapshots are immutable');
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });

  it('rejects ontology publication by a non-lead demo actor', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_INGEST });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true)", [IDS.users.jamie]);
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [IDS.workspace]);
      await expect(publishOntologyRelationship(
        client,
        { id: IDS.users.jamie, role: 'Consultant' },
        edit,
      )).rejects.toBeInstanceOf(OntologyPermissionError);
      await client.query('ROLLBACK');
    } finally {
      client.release();
      await pool.end();
    }
  });
});
