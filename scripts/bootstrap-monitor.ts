import dotenv from 'dotenv';
import { getAppPool, getIngestionPool, getOwnerPool } from '@/src/db/pool';
import { IDS } from '@/src/modules/canonical/ids';
import { initializeDefaultMonitor } from '@/src/modules/memory/hypothesis-monitor';
import { initializeDiscoveryDemo } from '@/src/modules/discovery/discovery-demo';

dotenv.config({ path: '.env.local' });

const ownerPool = getOwnerPool();
const ownerClient = await ownerPool.connect();
try {
  await ownerClient.query('BEGIN');
  const workspace = await ownerClient.query(
    'SELECT id FROM workspaces WHERE id = $1',
    [IDS.workspace],
  );
  if (!workspace.rows[0]) {
    throw new Error(
      'The demo workspace is missing. Run npm run demo:setup first.',
    );
  }
  await ownerClient.query(
    `INSERT INTO users (id, workspace_id, name, role_label)
     VALUES ($1, $2, 'Hypothesis Monitor', 'System')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role_label = EXCLUDED.role_label`,
    [IDS.users.memoryAgent, IDS.workspace],
  );
  await ownerClient.query('COMMIT');
} catch (error) {
  await ownerClient.query('ROLLBACK');
  throw error;
} finally {
  ownerClient.release();
  await ownerPool.end();
}

try {
  const memory = await initializeDefaultMonitor({
    catchUpPreparedMutation: true,
  });
  console.log(
    `Monitor ready: ${memory.checkpoint?.epistemicStatus ?? 'no checkpoint'}, ${memory.candidates.length} memory proposal(s).`,
  );
  const discovery = await initializeDiscoveryDemo();
  console.log(
    `Discovery ready: ${discovery.documents} unlabeled inputs, ${discovery.candidates} candidate(s).`,
  );
} finally {
  await getAppPool().end();
  await getIngestionPool().end();
}
