import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { IDS } from '@/src/modules/canonical/ids';
import { DocumentFixtureConnector } from '@/src/modules/connectors/document-fixture-connector';
import { runDocumentSync } from '@/src/modules/sync/research-sync';

describe('Documents connector sync', () => {
  it('replays unchanged documents and preserves folder identity resolution', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_INGEST });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true)", [IDS.users.ingestion]);
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [IDS.workspace]);
      const result = await runDocumentSync(client, new DocumentFixtureConnector());
      const keys = await client.query<{ resource_id: string; key_type: string; external_key: string }>(
        `SELECT resource_id, key_type, external_key
         FROM resource_identity_keys
         WHERE source_system = 'documents'
         ORDER BY key_type`,
      );
      const documents = await client.query<{ resource_kind: string; semantic_type: string }>(
        `SELECT resource_kind, semantic_type
         FROM resources
         WHERE canonical_name = 'Atlas onboarding research plan'`,
      );
      await client.query('COMMIT');
      expect(result).toMatchObject({ seen: 0, changed: 0 });
      expect(result.cursorBefore).toBe(result.cursorAfter);
      expect(keys.rows).toEqual([
        { resource_id: IDS.resources.atlas, key_type: 'folder-id', external_key: 'fld-atlas-381' },
        { resource_id: IDS.resources.atlas, key_type: 'folder-path', external_key: '/clients/atlas-bank' },
      ]);
      expect(documents.rows).toEqual([{ resource_kind: 'content', semantic_type: 'Document' }]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  });
});
