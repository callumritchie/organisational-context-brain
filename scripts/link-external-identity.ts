import dotenv from 'dotenv';
import { z } from 'zod';
import { getOwnerPool } from '@/src/db/pool';
import { stableId } from '@/src/modules/canonical/stable-id';
import { readOidcAuthConfig } from '@/src/modules/identity/request-actor';

dotenv.config({ path: '.env.local' });

if (!process.argv.includes('--confirm')) {
  throw new Error(
    'Identity linking changes authorisation. Review the environment values and rerun with --confirm.',
  );
}

const config = readOidcAuthConfig();
const subject = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .parse(process.env.AUTH_LINK_SUBJECT);
const userId = z.string().uuid().parse(process.env.AUTH_LINK_USER_ID);
const workspaceId = z.string().uuid().parse(process.env.AUTH_LINK_WORKSPACE_ID);
const capabilities = z
  .array(z.enum(['hypothesis.review', 'monitor.operate', 'ontology.review']))
  .parse(
    (process.env.AUTH_LINK_CAPABILITIES ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
const providerId = stableId(
  'identity-provider',
  `${workspaceId}:${config.issuer}:${config.audience}`,
);
const identityId = stableId('external-identity', `${providerId}:${subject}`);
const pool = getOwnerPool();
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const member = await client.query(
    `SELECT id FROM users WHERE id = $1 AND workspace_id = $2`,
    [userId, workspaceId],
  );
  if (!member.rows[0]) {
    throw new Error('The target user is not a member of the target workspace.');
  }
  await client.query(
    `INSERT INTO identity_providers
      (id, workspace_id, issuer, audience, jwks_uri, enabled)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (issuer, audience, workspace_id) DO UPDATE SET
       jwks_uri = EXCLUDED.jwks_uri, enabled = true, updated_at = now()`,
    [providerId, workspaceId, config.issuer, config.audience, config.jwksUrl],
  );
  await client.query(
    `INSERT INTO external_identities
      (id, workspace_id, identity_provider_id, subject, user_id, active)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (identity_provider_id, subject) DO UPDATE SET
       user_id = EXCLUDED.user_id, active = true, updated_at = now()`,
    [identityId, workspaceId, providerId, subject, userId],
  );
  await client.query(
    `UPDATE browser_sessions
     SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = 'identity_relinked'
     WHERE external_identity_id = $1 AND revoked_at IS NULL`,
    [identityId],
  );
  await client.query(`DELETE FROM user_capabilities WHERE user_id = $1`, [
    userId,
  ]);
  for (const capability of capabilities) {
    await client.query(
      `INSERT INTO user_capabilities
        (id, workspace_id, user_id, capability)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, capability) DO NOTHING`,
      [
        stableId('user-capability', `${userId}:${capability}`),
        workspaceId,
        userId,
        capability,
      ],
    );
  }
  await client.query(
    `INSERT INTO security_audit_events
      (id, workspace_id, actor_id, event_type, outcome, metadata)
     VALUES (gen_random_uuid(), $1, $2, 'identity.linked', 'success', $3::jsonb)`,
    [
      workspaceId,
      userId,
      JSON.stringify({ capabilityCount: capabilities.length }),
    ],
  );
  await client.query('COMMIT');
  console.log(
    `Linked external subject to workspace user ${userId} with ${capabilities.length} explicit capabilities.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
