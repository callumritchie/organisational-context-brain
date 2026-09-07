import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { EmbeddingProvider } from './embedding-provider';

const BATCH_SIZE = 32;

function vectorLiteral(values: number[]) {
  return `[${values.join(',')}]`;
}

export async function syncSearchEmbeddings(client: PoolClient, provider: EmbeddingProvider) {
  const documents = await client.query<{
    id: string;
    workspace_id: string;
    access_scope_id: string;
    resource_id: string;
    body: string;
  }>(
    `SELECT document.id, document.workspace_id, resource.access_scope_id, document.resource_id, document.body
     FROM search_documents document
     JOIN resources resource ON resource.id = document.resource_id
     WHERE document.active
     ORDER BY document.id`,
  );
  let indexed = 0;
  let unchanged = 0;
  for (let offset = 0; offset < documents.rows.length; offset += BATCH_SIZE) {
    const batch = documents.rows.slice(offset, offset + BATCH_SIZE);
    const pending = [];
    for (const document of batch) {
      const contentHash = createHash('sha256').update(document.body).digest('hex');
      const current = await client.query(
        `SELECT 1 FROM search_embeddings
         WHERE search_document_id = $1 AND provider = $2 AND model = $3
           AND content_hash = $4 AND is_current`,
        [document.id, provider.id, provider.model, contentHash],
      );
      if (current.rowCount) unchanged += 1;
      else pending.push({ ...document, contentHash });
    }
    if (!pending.length) continue;
    const embeddings = await provider.embed(pending.map((document) => document.body));
    for (const [index, document] of pending.entries()) {
      await client.query(
        `UPDATE search_embeddings SET is_current = false
         WHERE search_document_id = $1 AND provider = $2 AND model = $3 AND is_current`,
        [document.id, provider.id, provider.model],
      );
      await client.query(
        `INSERT INTO search_embeddings (
           id, workspace_id, access_scope_id, search_document_id, resource_id,
           provider, model, dimensions, content_hash, embedding, is_current
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, true)`,
        [
          randomUUID(), document.workspace_id, document.access_scope_id, document.id, document.resource_id,
          provider.id, provider.model, provider.dimensions, document.contentHash, vectorLiteral(embeddings[index]!),
        ],
      );
      indexed += 1;
    }
  }
  return { indexed, unchanged, total: documents.rows.length };
}
