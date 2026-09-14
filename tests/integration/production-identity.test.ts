import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { IDS } from '@/src/modules/canonical/ids';

describe('server-owned external identity mapping', () => {
  it('lets the app role resolve only an active, configured issuer-subject mapping', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_OWNER });
    const client = await pool.connect();
    const providerId = randomUUID();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO identity_providers
          (id, workspace_id, issuer, audience, jwks_uri)
         VALUES ($1, $2, 'https://identity.example.test/', 'org-brain-api',
           'https://identity.example.test/.well-known/jwks.json')`,
        [providerId, IDS.workspace],
      );
      await client.query(
        `INSERT INTO external_identities
          (id, workspace_id, identity_provider_id, subject, user_id)
         VALUES ($1, $2, $3, 'external-alex', $4)`,
        [randomUUID(), IDS.workspace, providerId, IDS.users.alex],
      );
      await client.query(
        `INSERT INTO user_capabilities
          (id, workspace_id, user_id, capability)
         VALUES ($1, $2, $3, 'ontology.review')
         ON CONFLICT (user_id, capability) DO NOTHING`,
        [randomUUID(), IDS.workspace, IDS.users.alex],
      );
      await client.query('SET LOCAL ROLE org_brain_app');
      const privileges = await client.query<{
        identities: boolean;
        capabilities: boolean;
      }>(
        `SELECT has_table_privilege(current_user, 'external_identities', 'SELECT') AS identities,
          has_table_privilege(current_user, 'user_capabilities', 'SELECT') AS capabilities`,
      );
      const mapped = await client.query<{
        actor_id: string;
        workspace_id: string;
        actor_name: string;
        role_label: string;
        capabilities: string[];
      }>(
        `SELECT actor_id, workspace_id, actor_name, role_label, capabilities
         FROM resolve_external_identity($1, $2, $3)`,
        ['https://identity.example.test/', 'external-alex', 'org-brain-api'],
      );
      const unlinked = await client.query(
        `SELECT actor_id FROM resolve_external_identity($1, $2, $3)`,
        ['https://identity.example.test/', 'unlinked-person', 'org-brain-api'],
      );
      expect(mapped.rows).toHaveLength(1);
      expect(mapped.rows[0]).toMatchObject({
        actor_id: IDS.users.alex,
        workspace_id: IDS.workspace,
        actor_name: 'Alex Chen',
        role_label: 'Project Lead',
      });
      expect(mapped.rows[0]?.capabilities).toContain('ontology.review');
      expect(unlinked.rows).toHaveLength(0);
      expect(privileges.rows[0]).toEqual({
        identities: false,
        capabilities: false,
      });
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });
});
