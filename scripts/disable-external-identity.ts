import dotenv from 'dotenv';
import { z } from 'zod';
import { getOwnerPool } from '@/src/db/pool';
import { readOidcAuthConfig } from '@/src/modules/identity/request-actor';

dotenv.config({ path: '.env.local' });

if (!process.argv.includes('--confirm')) {
  throw new Error(
    'Identity deprovisioning revokes active sessions. Review the environment values and rerun with --confirm.',
  );
}

const config = readOidcAuthConfig();
const subject = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .parse(process.env.AUTH_DISABLE_SUBJECT);
const workspaceId = z
  .string()
  .uuid()
  .parse(process.env.AUTH_DISABLE_WORKSPACE_ID);
const pool = getOwnerPool();
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const disabled = await client.query<{ id: string; user_id: string }>(
    `UPDATE external_identities identity
     SET active = false, updated_at = now()
     FROM identity_providers provider
     WHERE identity.identity_provider_id = provider.id
       AND identity.workspace_id = $1
       AND provider.workspace_id = identity.workspace_id
       AND provider.issuer = $2
       AND provider.audience = $3
       AND identity.subject = $4
       AND identity.active
     RETURNING identity.id, identity.user_id`,
    [workspaceId, config.issuer, config.audience, subject],
  );
  const identity = disabled.rows[0];
  if (!identity) throw new Error('No active matching identity link was found.');
  const revoked = await client.query(
    `UPDATE browser_sessions
     SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = 'identity_deprovisioned'
     WHERE external_identity_id = $1 AND revoked_at IS NULL
     RETURNING id`,
    [identity.id],
  );
  await client.query(
    `INSERT INTO security_audit_events
      (id, workspace_id, actor_id, event_type, outcome, metadata)
     VALUES (gen_random_uuid(), $1, $2, 'identity.deprovisioned', 'success', $3::jsonb)`,
    [
      workspaceId,
      identity.user_id,
      JSON.stringify({ revokedSessions: revoked.rowCount ?? 0 }),
    ],
  );
  await client.query('COMMIT');
  console.log(
    `Disabled the identity link and revoked ${revoked.rowCount ?? 0} active browser sessions.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
