import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import { ONTOLOGY } from './ontology';

export const ONTOLOGY_VERSION = 'northstar-ontology-v1';

export async function storeCurrentOntology(client: PoolClient) {
  const document = JSON.stringify(ONTOLOGY);
  const checksum = createHash('sha256').update(document).digest('hex');
  await client.query(
    `INSERT INTO ontology_versions
      (id, workspace_id, version, status, schema_document, checksum, process_name, process_version)
     VALUES ($1, $2, $3, 'current', $4, $5, 'ontology-bootstrap', '1.0.0')
     ON CONFLICT (workspace_id, version) DO NOTHING`,
    [stableId('ontology-version', ONTOLOGY_VERSION), IDS.workspace, ONTOLOGY_VERSION, ONTOLOGY, checksum],
  );
  return { version: ONTOLOGY_VERSION, checksum };
}
