import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { getIngestionPool } from '@/src/db/pool';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import { ontologySchema, type OntologyDocument } from './ontology';

export const ontologyRelationshipEditSchema = z.object({
  name: z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
  from: z.string().trim().min(1).max(64),
  to: z.string().trim().min(1).max(64),
  description: z.string().trim().min(10).max(240),
}).strict();

export type OntologyRelationshipEdit = z.infer<typeof ontologyRelationshipEditSchema>;

export class OntologyPermissionError extends Error {}
export class OntologyConflictError extends Error {}

function nextVersion(currentVersion: string) {
  const match = /^(.*)-v(\d+)$/.exec(currentVersion);
  if (!match) throw new OntologyConflictError('The current ontology version cannot be incremented');
  return `${match[1]}-v${Number(match[2]) + 1}`;
}

function toOntologyDto(version: string, checksum: string, document: OntologyDocument) {
  return {
    version,
    status: 'current',
    checksum,
    resourceTypes: Object.entries(document.resourceTypes).map(([name, definition]) => ({ name, ...definition })),
    relationships: Object.entries(document.relationships).map(([name, definition]) => ({ name, ...definition })),
  };
}

async function publishOntologyRelationship(
  client: PoolClient,
  actor: { id: string; role: string },
  rawInput: OntologyRelationshipEdit,
) {
  if (actor.id !== IDS.users.alex || actor.role !== 'Project Lead') {
    throw new OntologyPermissionError('Only the demo Project Lead can publish ontology versions');
  }
  const input = ontologyRelationshipEditSchema.parse(rawInput);
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`ontology:${IDS.workspace}`]);
  const currentResult = await client.query<{
    id: string;
    version: string;
    schema_document: unknown;
  }>(
    `SELECT id, version, schema_document
     FROM ontology_versions
     WHERE workspace_id = $1 AND status = 'current'
     FOR UPDATE`,
    [IDS.workspace],
  );
  const current = currentResult.rows[0];
  if (!current) throw new OntologyConflictError('No current ontology version is available');
  const document = ontologySchema.parse(current.schema_document);
  if (!document.resourceTypes[input.from] || !document.resourceTypes[input.to]) {
    throw new OntologyConflictError('Relationship endpoints must use existing resource types');
  }
  if (document.relationships[input.name]) {
    throw new OntologyConflictError('A relationship with this name already exists');
  }
  const nextDocument = ontologySchema.parse({
    ...document,
    relationships: {
      ...document.relationships,
      [input.name]: { from: [input.from], to: [input.to], description: input.description },
    },
  });
  const version = nextVersion(current.version);
  const checksum = createHash('sha256').update(JSON.stringify(nextDocument)).digest('hex');
  await client.query(
    `UPDATE ontology_versions SET status = 'superseded' WHERE id = $1`,
    [current.id],
  );
  await client.query(
    `INSERT INTO ontology_versions
      (id, workspace_id, version, status, schema_document, checksum, process_name, process_version, created_by)
     VALUES ($1, $2, $3, 'current', $4, $5, 'ontology-editor', '1.0.0', $6)`,
    [stableId('ontology-version', version), IDS.workspace, version, nextDocument, checksum, actor.id],
  );
  return toOntologyDto(version, checksum, nextDocument);
}

export async function publishOntologyRelationshipForDemoActor(
  actor: { id: string; role: string },
  rawInput: OntologyRelationshipEdit,
) {
  const client = await getIngestionPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_id', $1, true)", [actor.id]);
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [IDS.workspace]);
    const applied = await client.query<{ actor_id: string; workspace_id: string }>(
      'SELECT app_actor_id()::text AS actor_id, app_workspace_id()::text AS workspace_id',
    );
    if (applied.rows[0]?.actor_id !== actor.id || applied.rows[0]?.workspace_id !== IDS.workspace) {
      throw new Error('Ontology editor transaction scope could not be established');
    }
    const ontology = await publishOntologyRelationship(client, actor, rawInput);
    await client.query('COMMIT');
    return ontology;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export { publishOntologyRelationship };
