import dotenv from 'dotenv';
import { getIngestionPool } from '@/src/db/pool';
import { IDS } from '@/src/modules/canonical/ids';
import { syncSearchEmbeddings } from '@/src/modules/embeddings/embedding-indexer';
import { getConfiguredEmbeddingProvider } from '@/src/modules/embeddings/embedding-provider';

dotenv.config({ path: '.env.local' });

const provider = getConfiguredEmbeddingProvider();
if (!provider) {
  console.log('Embedding sync skipped: configure EMBEDDING_PROVIDER=openai and OPENAI_API_KEY to enable genuine embeddings.');
  process.exit(0);
}

const pool = getIngestionPool();
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.actor_id', $1, true)", [IDS.users.ingestion]);
  await client.query("SELECT set_config('app.workspace_id', $1, true)", [IDS.workspace]);
  const result = await syncSearchEmbeddings(client, provider);
  await client.query('COMMIT');
  console.log(`Embedding sync complete: ${result.indexed} indexed, ${result.unchanged} unchanged, ${result.total} total.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
