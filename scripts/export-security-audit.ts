import dotenv from 'dotenv';
import { z } from 'zod';
import { getOwnerPool } from '@/src/db/pool';

dotenv.config({ path: '.env.local' });

const workspaceId = z
  .string()
  .uuid()
  .parse(process.env.AUTH_AUDIT_WORKSPACE_ID);
const since = z.coerce
  .date()
  .default(() => new Date(Date.now() - 24 * 60 * 60 * 1000))
  .parse(process.env.AUTH_AUDIT_SINCE);
const pool = getOwnerPool();
try {
  const result = await pool.query(
    `SELECT id, workspace_id, actor_id, event_type, outcome, request_id,
       session_id, metadata, created_at
     FROM security_audit_events
     WHERE workspace_id = $1 AND created_at >= $2
     ORDER BY created_at ASC`,
    [workspaceId, since],
  );
  for (const event of result.rows) console.log(JSON.stringify(event));
} finally {
  await pool.end();
}
