import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { IDS } from '@/src/modules/canonical/ids';

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('revocable browser session boundary', () => {
  it('keeps flow/session tables private while exposing narrow one-time functions', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_OWNER });
    const client = await pool.connect();
    const providerId = randomUUID();
    const identityId = randomUUID();
    const state = hash('state');
    const binding = hash('browser');
    const sessionToken = hash('session');
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO identity_providers
          (id, workspace_id, issuer, audience, jwks_uri)
         VALUES ($1, $2, 'https://browser.example.test/', 'org-brain-api',
           'https://browser.example.test/jwks')`,
        [providerId, IDS.workspace],
      );
      await client.query(
        `INSERT INTO external_identities
          (id, workspace_id, identity_provider_id, subject, user_id)
         VALUES ($1, $2, $3, 'browser-alex', $4)`,
        [identityId, IDS.workspace, providerId, IDS.users.alex],
      );
      await client.query('SET LOCAL ROLE org_brain_app');
      const privileges = await client.query<{
        attempts: boolean;
        sessions: boolean;
      }>(
        `SELECT
          has_table_privilege(current_user, 'oidc_login_attempts', 'SELECT') AS attempts,
          has_table_privilege(current_user, 'browser_sessions', 'SELECT') AS sessions`,
      );
      await client.query(
        `SELECT begin_oidc_login_attempt($1, $2, $3, $4, $5, $6, $7)`,
        [
          state,
          binding,
          'v'.repeat(43),
          'n'.repeat(32),
          'https://brain.example.test/api/v1/auth/callback',
          '/#ask',
          new Date(Date.now() + 60_000),
        ],
      );
      const attempt = await client.query(
        `SELECT * FROM consume_oidc_login_attempt($1, $2)`,
        [state, binding],
      );
      const replay = await client.query(
        `SELECT * FROM consume_oidc_login_attempt($1, $2)`,
        [state, binding],
      );
      const created = await client.query<{ session_id: string }>(
        `SELECT session_id FROM create_browser_session(
          $1, $2, $3, $4, $5, $6, $7, $8
        )`,
        [
          'https://browser.example.test/',
          'browser-alex',
          'org-brain-api',
          sessionToken,
          hash('csrf'),
          hash('user-agent'),
          new Date(Date.now() + 20 * 60_000),
          new Date(Date.now() + 8 * 60 * 60_000),
        ],
      );
      const resolved = await client.query<{ actor_id: string }>(
        `SELECT actor_id FROM resolve_browser_session($1, $2, interval '30 minutes')`,
        [sessionToken, hash('user-agent')],
      );
      const limited = await client.query<{ allowed: boolean }>(
        `SELECT allowed FROM consume_api_rate_limit($1, $2, 'mutation', 1, interval '1 minute')`,
        [IDS.workspace, IDS.users.alex],
      );
      const blocked = await client.query<{ allowed: boolean }>(
        `SELECT allowed FROM consume_api_rate_limit($1, $2, 'mutation', 1, interval '1 minute')`,
        [IDS.workspace, IDS.users.alex],
      );
      await client.query(`SELECT revoke_browser_session($1, 'test')`, [
        sessionToken,
      ]);
      const revoked = await client.query(
        `SELECT actor_id FROM resolve_browser_session($1, $2, interval '30 minutes')`,
        [sessionToken, hash('user-agent')],
      );

      expect(privileges.rows[0]).toEqual({ attempts: false, sessions: false });
      expect(attempt.rows).toHaveLength(1);
      expect(replay.rows).toHaveLength(0);
      expect(created.rows).toHaveLength(1);
      expect(resolved.rows[0]?.actor_id).toBe(IDS.users.alex);
      expect(limited.rows[0]?.allowed).toBe(true);
      expect(blocked.rows[0]?.allowed).toBe(false);
      expect(revoked.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });
});
