import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import type { Connector, CrmAccountRecord } from '@/src/modules/connectors/types';

function contentHash(record: CrmAccountRecord) {
  return createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

export async function runCrmSync(client: PoolClient, connector: Connector<CrmAccountRecord>) {
  await client.query(
    `INSERT INTO sources (id, workspace_id, source_type, name, status)
     VALUES ($1, $2, $3, 'Northstar CRM', 'pending')
     ON CONFLICT (id) DO NOTHING`,
    [IDS.sources.crm, IDS.workspace, connector.sourceType],
  );
  const source = await client.query<{ cursor: string | null }>(
    'SELECT cursor FROM sources WHERE id = $1',
    [IDS.sources.crm],
  );
  const cursorBefore = source.rows[0]?.cursor ?? null;
  const runId = randomUUID();
  await client.query(
    `INSERT INTO sync_runs (id, workspace_id, source_id, status, cursor_before)
     VALUES ($1, $2, $3, 'running', $4)`,
    [runId, IDS.workspace, IDS.sources.crm, cursorBefore],
  );
  try {
    const page = await connector.listChanges(cursorBefore);
    let changed = 0;
    for (const record of page.records) {
      const hash = contentHash(record);
      const sourceObjectId = stableId('source-object', `${IDS.sources.crm}:${record.externalId}`);
      const sourceVersionId = stableId('source-version', `${IDS.sources.crm}:${record.externalId}:${hash}`);
      const existing = await client.query<{ current_content_hash: string | null }>(
        'SELECT current_content_hash FROM source_objects WHERE id = $1',
        [sourceObjectId],
      );
      await client.query(
        `INSERT INTO source_objects
          (id, workspace_id, source_id, access_scope_id, external_id, source_uri,
           source_created_at, source_updated_at, current_content_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (source_id, external_id) DO UPDATE SET
           source_uri = EXCLUDED.source_uri,
           source_updated_at = EXCLUDED.source_updated_at,
           current_content_hash = EXCLUDED.current_content_hash,
           deleted = false,
           updated_at = now()`,
        [sourceObjectId, IDS.workspace, IDS.sources.crm, IDS.scopes.everyone, record.externalId,
          record.uri, record.createdAt, record.updatedAt, hash],
      );
      if (existing.rows[0]?.current_content_hash === hash) continue;
      changed += 1;
      await client.query(
        `INSERT INTO source_object_versions
          (id, workspace_id, source_object_id, access_scope_id, content_hash, raw_payload, source_updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (source_object_id, content_hash) DO NOTHING`,
        [sourceVersionId, IDS.workspace, sourceObjectId, IDS.scopes.everyone, hash, record, record.updatedAt],
      );
      for (const key of record.sourceKeys) {
        await client.query(
          `INSERT INTO resource_identity_keys
            (id, workspace_id, resource_id, source_system, key_type, external_key, confidence, source_object_version_id)
           VALUES ($1, $2, $3, 'crm', $4, $5, 1, $6)
           ON CONFLICT (workspace_id, source_system, key_type, external_key) DO UPDATE SET
             resource_id = EXCLUDED.resource_id,
             confidence = EXCLUDED.confidence,
             source_object_version_id = EXCLUDED.source_object_version_id`,
          [stableId('identity-key', `crm:${key.type}:${key.value}`), IDS.workspace, IDS.resources.atlas,
            key.type, key.value, sourceVersionId],
        );
      }
      await client.query(
        `INSERT INTO entity_aliases
          (id, workspace_id, resource_id, alias, normalized_alias, alias_type, source_system)
         VALUES ($1, $2, $3, 'CRM account 381', 'crm account 381', 'source-key', 'crm')
         ON CONFLICT (workspace_id, normalized_alias, alias_type, source_system) DO UPDATE SET
           resource_id = EXCLUDED.resource_id`,
        [stableId('entity-alias', 'crm:account:381'), IDS.workspace, IDS.resources.atlas],
      );
      const relationshipId = stableId('relationship', `${IDS.resources.project}:IS_FOR:${IDS.resources.atlas}`);
      const assertionId = stableId('assertion', `${sourceVersionId}:${relationshipId}:source-backed`);
      await client.query(
        `INSERT INTO relationships (id, workspace_id, from_resource_id, to_resource_id, relationship_type)
         VALUES ($1, $2, $3, $4, 'IS_FOR')
         ON CONFLICT (workspace_id, from_resource_id, to_resource_id, relationship_type) DO NOTHING`,
        [relationshipId, IDS.workspace, IDS.resources.project, IDS.resources.atlas],
      );
      await client.query(
        `INSERT INTO assertions
          (id, workspace_id, access_scope_id, subject_resource_id, predicate, object_resource_id,
           relationship_id, assertion_kind, source_object_version_id, process_name, process_version,
           confidence, valid_from)
         VALUES ($1, $2, $3, $4, 'IS_FOR', $5, $6, 'source-backed', $7,
           'crm-account-mapper', '1.0.0', 1, $8)
         ON CONFLICT (id) DO NOTHING`,
        [assertionId, IDS.workspace, IDS.scopes.everyone, IDS.resources.project, IDS.resources.atlas,
          relationshipId, sourceVersionId, record.updatedAt],
      );
      const excerpt = `CRM account ${record.accountNumber}: ${record.name}; linked project ${record.projectRef}.`;
      await client.query(
        `INSERT INTO provenance_spans
          (id, workspace_id, assertion_id, source_object_version_id, start_offset, end_offset, excerpt)
         VALUES ($1, $2, $3, $4, 0, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [stableId('provenance', assertionId), IDS.workspace, assertionId, sourceVersionId,
          excerpt.length, excerpt],
      );
    }
    await client.query(
      `UPDATE sources SET cursor = $2, status = 'healthy', last_successful_sync_at = now(), updated_at = now()
       WHERE id = $1`,
      [IDS.sources.crm, page.nextCursor],
    );
    await client.query(
      `UPDATE sync_runs SET status = 'succeeded', cursor_after = $2, objects_seen = $3,
       objects_changed = $4, finished_at = now() WHERE id = $1`,
      [runId, page.nextCursor, page.records.length, changed],
    );
    return { runId, cursorBefore, cursorAfter: page.nextCursor, seen: page.records.length, changed };
  } catch (error) {
    await client.query(
      `UPDATE sync_runs SET status = 'failed', error_summary = $2, finished_at = now() WHERE id = $1`,
      [runId, error instanceof Error ? error.message : 'Unknown sync failure'],
    );
    throw error;
  }
}
