import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import type {
  Connector,
  DocumentSourceRecord,
  KnowledgeSourceRecord,
  MeetingSourceRecord,
  MessageSourceRecord,
  ResearchSourceRecord,
  SourceVisibility,
} from '@/src/modules/connectors/types';

function contentHash(record: KnowledgeSourceRecord) {
  return createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scopeFor(visibility: SourceVisibility) {
  if (visibility === 'internal') return IDS.scopes.internal;
  if (visibility === 'alex-only') return IDS.scopes.alexOnly;
  if (visibility === 'jamie-only') return IDS.scopes.jamieOnly;
  return IDS.scopes.everyone;
}

async function upsertResource(
  client: PoolClient,
  input: {
    id: string;
    scopeId: string;
    kind: 'entity' | 'content';
    type: string;
    name: string;
    summary?: string;
    properties?: Record<string, unknown>;
  },
) {
  await client.query(
    `INSERT INTO resources
      (id, workspace_id, access_scope_id, resource_kind, semantic_type, canonical_name, summary, properties)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       canonical_name = EXCLUDED.canonical_name,
       summary = COALESCE(EXCLUDED.summary, resources.summary),
       properties = resources.properties || EXCLUDED.properties,
       updated_at = now()`,
    [
      input.id,
      IDS.workspace,
      input.scopeId,
      input.kind,
      input.type,
      input.name,
      input.summary ?? null,
      input.properties ?? {},
    ],
  );

  if (input.kind === 'entity') {
    await client.query(
      `INSERT INTO entities (resource_id, normalized_name) VALUES ($1, $2)
       ON CONFLICT (resource_id) DO UPDATE SET normalized_name = EXCLUDED.normalized_name`,
      [input.id, normalizeName(input.name)],
    );
  }
}

async function ensureRelationshipAssertion(
  client: PoolClient,
  input: {
    from: string;
    to: string;
    type: string;
    scopeId: string;
    assertionKind: 'source-backed' | 'rule-derived' | 'AI-inferred';
    sourceVersionId: string;
    confidence: number;
    excerpt: string;
    processName?: string;
  },
) {
  const relationshipId = stableId('relationship', `${input.from}:${input.type}:${input.to}`);
  const assertionId = stableId('assertion', `${input.sourceVersionId}:${relationshipId}:${input.assertionKind}`);
  await client.query(
    `INSERT INTO relationships
      (id, workspace_id, from_resource_id, to_resource_id, relationship_type)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, from_resource_id, to_resource_id, relationship_type) DO NOTHING`,
    [relationshipId, IDS.workspace, input.from, input.to, input.type],
  );
  await client.query(
    `INSERT INTO assertions
      (id, workspace_id, access_scope_id, subject_resource_id, predicate, object_resource_id,
       relationship_id, assertion_kind, source_object_version_id, process_name, process_version,
       confidence, valid_from)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '1.0.0', $11, now())
     ON CONFLICT (id) DO NOTHING`,
    [
      assertionId,
      IDS.workspace,
      input.scopeId,
      input.from,
      input.type,
      input.to,
      relationshipId,
      input.assertionKind,
      input.sourceVersionId,
      input.processName ?? 'research-semantic-mapper',
      input.confidence,
    ],
  );
  await client.query(
    `INSERT INTO provenance_spans
      (id, workspace_id, assertion_id, source_object_version_id, start_offset, end_offset, excerpt)
     VALUES ($1, $2, $3, $4, 0, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [
      stableId('provenance', assertionId),
      IDS.workspace,
      assertionId,
      input.sourceVersionId,
      input.excerpt.length,
      input.excerpt,
    ],
  );
  return { relationshipId, assertionId };
}

export async function seedIdentityAndScopes(client: PoolClient) {
  await client.query(
    `INSERT INTO workspaces (id, name) VALUES ($1, 'Northstar Labs')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [IDS.workspace],
  );
  await client.query(
    `INSERT INTO users (id, workspace_id, name, role_label) VALUES
      ($1, $5, 'Alex Chen', 'Project Lead'),
      ($2, $5, 'Jamie Patel', 'Consultant'),
      ($3, $5, 'Morgan Reed', 'External Contractor'),
      ($4, $5, 'Sync Service', 'System')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role_label = EXCLUDED.role_label`,
    [IDS.users.alex, IDS.users.jamie, IDS.users.morgan, IDS.users.ingestion, IDS.workspace],
  );
  await client.query(
    `INSERT INTO groups (id, workspace_id, name) VALUES ($1, $2, 'Northstar delivery team')
     ON CONFLICT (id) DO NOTHING`,
    [IDS.groups.internal, IDS.workspace],
  );
  await client.query(
    `INSERT INTO group_memberships (group_id, user_id) VALUES ($1, $2), ($1, $3)
     ON CONFLICT DO NOTHING`,
    [IDS.groups.internal, IDS.users.alex, IDS.users.jamie],
  );
  await client.query(
    `INSERT INTO access_scopes (id, workspace_id, name) VALUES
      ($1, $5, 'Everyone in workspace'),
      ($2, $5, 'Northstar delivery team only'),
      ($3, $5, 'Alex Chen only'),
      ($4, $5, 'Jamie Patel only')
     ON CONFLICT (id) DO NOTHING`,
    [IDS.scopes.everyone, IDS.scopes.internal, IDS.scopes.alexOnly, IDS.scopes.jamieOnly, IDS.workspace],
  );
  await client.query(
    `INSERT INTO access_scope_grants (id, access_scope_id, principal_type, principal_id, permission) VALUES
      ($1, $2, 'everyone', NULL, 'read'),
      ($3, $4, 'group', $5, 'read'),
      ($6, $7, 'user', $8, 'read'),
      ($9, $10, 'user', $11, 'read'),
      ($12, $4, 'user', $13, 'manage'),
      ($14, $7, 'user', $13, 'manage'),
      ($15, $10, 'user', $13, 'manage')
     ON CONFLICT (id) DO NOTHING`,
    [
      stableId('grant', 'everyone'),
      IDS.scopes.everyone,
      stableId('grant', 'internal'),
      IDS.scopes.internal,
      IDS.groups.internal,
      stableId('grant', 'alex-only'),
      IDS.scopes.alexOnly,
      IDS.users.alex,
      stableId('grant', 'jamie-only'),
      IDS.scopes.jamieOnly,
      IDS.users.jamie,
      stableId('grant', 'ingestion-internal'),
      IDS.users.ingestion,
      stableId('grant', 'ingestion-alex'),
      stableId('grant', 'ingestion-jamie'),
    ],
  );
}

async function ensureCoreResources(client: PoolClient) {
  const publicScope = IDS.scopes.everyone;
  const core = [
    { id: IDS.resources.northstar, type: 'Organisation', name: 'Northstar Labs', summary: 'A fictional research and product consultancy.' },
    { id: IDS.resources.atlas, type: 'Client', name: 'Atlas Bank', summary: 'A fictional digital banking client.' },
    { id: IDS.resources.project, type: 'Project', name: 'Atlas Onboarding', summary: 'Research into abandonment in Atlas Bank’s mobile onboarding journey.' },
    { id: IDS.resources.hypothesis, type: 'Hypothesis', name: 'Identity verification drives abandonment', summary: 'Users abandon onboarding mainly because identity verification takes too long and feels uncertain.' },
    { id: IDS.resources.alex, type: 'Person', name: 'Alex Chen', summary: 'Project lead for Atlas Onboarding.' },
    { id: IDS.resources.jamie, type: 'Person', name: 'Jamie Patel', summary: 'Consultant conducting onboarding research.' },
    { id: IDS.resources.morgan, type: 'Person', name: 'Morgan Reed', summary: 'External contractor supporting the Atlas programme.' },
  ];
  for (const item of core) {
    await upsertResource(client, { ...item, scopeId: publicScope, kind: 'entity' });
  }
  const privateContexts = [
    { id: IDS.resources.cedar, scopeId: IDS.scopes.alexOnly, type: 'Client', name: 'Cedar Health', summary: 'An executive-sponsored client visible only to Alex in this fixture.' },
    { id: IDS.resources.cedarProject, scopeId: IDS.scopes.alexOnly, type: 'Project', name: 'Cedar Renewal', summary: 'A restricted renewal programme visible only to Alex.' },
    { id: IDS.resources.harbour, scopeId: IDS.scopes.jamieOnly, type: 'Client', name: 'Harbour Energy', summary: 'A fieldwork client visible only to Jamie in this fixture.' },
    { id: IDS.resources.harbourProject, scopeId: IDS.scopes.jamieOnly, type: 'Project', name: 'Harbour Discovery', summary: 'A restricted discovery programme visible only to Jamie.' },
  ];
  for (const item of privateContexts) {
    await upsertResource(client, { ...item, kind: 'entity' });
  }
  const aliases = [
    { alias: 'Atlas Bank', normalized: 'atlas bank', type: 'name' },
    { alias: 'Atlas', normalized: 'atlas', type: 'name' },
    { alias: 'atlas-bank', normalized: 'atlas bank', type: 'slug' },
  ];
  for (const alias of aliases) {
    await client.query(
      `INSERT INTO entity_aliases
        (id, workspace_id, resource_id, alias, normalized_alias, alias_type, source_system)
       VALUES ($1, $2, $3, $4, $5, $6, 'canonical-seed')
       ON CONFLICT (workspace_id, normalized_alias, alias_type, source_system) DO UPDATE SET alias = EXCLUDED.alias`,
      [stableId('entity-alias', `${alias.type}:${alias.alias}`), IDS.workspace, IDS.resources.atlas,
        alias.alias, alias.normalized, alias.type],
    );
  }
  for (const resource of privateContexts) {
    await client.query(
      `INSERT INTO entity_aliases
        (id, workspace_id, resource_id, alias, normalized_alias, alias_type, source_system)
       VALUES ($1, $2, $3, $4, $5, 'name', 'canonical-seed')
       ON CONFLICT (workspace_id, normalized_alias, alias_type, source_system) DO UPDATE SET
         resource_id = EXCLUDED.resource_id, alias = EXCLUDED.alias`,
      [stableId('entity-alias', `private:${resource.name}`), IDS.workspace, resource.id,
        resource.name, normalizeName(resource.name)],
    );
  }
}

async function mapRecord(
  client: PoolClient,
  record: KnowledgeSourceRecord,
  sourceVersionId: string,
  contentType: 'ResearchNote' | 'MeetingNote' | 'Document' | 'MessageThread',
  processName: string,
) {
  const scopeId = scopeFor(record.visibility);
  const contentResourceId = stableId('content-resource', record.externalId);
  const contentVersionId = stableId('content-version', sourceVersionId);
  const hash = contentHash(record);

  await upsertResource(client, {
    id: contentResourceId,
    scopeId,
    kind: 'content',
    type: contentType,
    name: record.title,
    summary: record.body,
    properties: {
      sourceUri: record.uri,
      author: record.author,
      ...('folder' in record ? { folder: record.folder } : {}),
      ...('channel' in record ? {
        channel: record.channel,
        threadExternalId: record.threadExternalId,
        participants: record.participants,
      } : {}),
    },
  });
  await client.query(
    `INSERT INTO content_objects (resource_id, content_type) VALUES ($1, $2)
     ON CONFLICT (resource_id) DO NOTHING`,
    [contentResourceId, contentType],
  );
  await client.query(
    `UPDATE content_versions SET is_current = false WHERE content_resource_id = $1 AND is_current`,
    [contentResourceId],
  );
  await client.query(
    `INSERT INTO content_versions
      (id, workspace_id, content_resource_id, source_object_version_id, access_scope_id,
       body, content_hash, version_number, is_current)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
       COALESCE((SELECT max(version_number) + 1 FROM content_versions WHERE content_resource_id = $3), 1), true)
     ON CONFLICT (id) DO UPDATE SET is_current = true`,
    [contentVersionId, IDS.workspace, contentResourceId, sourceVersionId, scopeId, record.body, hash],
  );
  await client.query('UPDATE content_objects SET current_version_id = $2 WHERE resource_id = $1', [contentResourceId, contentVersionId]);

  const authorResourceId = record.author === 'Alex Chen' ? IDS.resources.alex : IDS.resources.jamie;
  await ensureRelationshipAssertion(client, {
    from: contentResourceId,
    to: IDS.resources.project,
    type: 'BELONGS_TO',
    scopeId,
    assertionKind: 'rule-derived',
    sourceVersionId,
    confidence: 1,
    excerpt: record.body,
    processName,
  });

  if ('folder' in record) {
    const folderKeys = [
      { type: 'folder-id', value: record.folder.externalId },
      { type: 'folder-path', value: record.folder.path },
    ];
    for (const key of folderKeys) {
      await client.query(
        `INSERT INTO resource_identity_keys
          (id, workspace_id, resource_id, source_system, key_type, external_key, confidence, source_object_version_id)
         VALUES ($1, $2, $3, 'documents', $4, $5, 1, $6)
         ON CONFLICT (workspace_id, source_system, key_type, external_key) DO UPDATE SET
           resource_id = EXCLUDED.resource_id,
           confidence = EXCLUDED.confidence,
           source_object_version_id = EXCLUDED.source_object_version_id`,
        [stableId('identity-key', `documents:${key.type}:${key.value}`), IDS.workspace, IDS.resources.atlas,
          key.type, key.value, sourceVersionId],
      );
    }
    await client.query(
      `INSERT INTO entity_aliases
        (id, workspace_id, resource_id, alias, normalized_alias, alias_type, source_system)
       VALUES ($1, $2, $3, $4, $5, 'source-key', 'documents')
       ON CONFLICT (workspace_id, normalized_alias, alias_type, source_system) DO UPDATE SET
         resource_id = EXCLUDED.resource_id,
         alias = EXCLUDED.alias`,
      [stableId('entity-alias', `documents:folder:${record.folder.externalId}`), IDS.workspace,
        IDS.resources.atlas, record.folder.alias, normalizeName(record.folder.alias)],
    );
  }

  if ('channel' in record) {
    const projectKeys = [
      { type: 'channel-id', value: record.channel.externalId },
      { type: 'channel-slug', value: record.channel.slug },
    ];
    for (const key of projectKeys) {
      await client.query(
        `INSERT INTO resource_identity_keys
          (id, workspace_id, resource_id, source_system, key_type, external_key, confidence, source_object_version_id)
         VALUES ($1, $2, $3, 'messages', $4, $5, 1, $6)
         ON CONFLICT (workspace_id, source_system, key_type, external_key) DO UPDATE SET
           resource_id = EXCLUDED.resource_id,
           confidence = EXCLUDED.confidence,
           source_object_version_id = EXCLUDED.source_object_version_id`,
        [stableId('identity-key', `messages:${key.type}:${key.value}`), IDS.workspace, IDS.resources.project,
          key.type, key.value, sourceVersionId],
      );
    }
    await client.query(
      `INSERT INTO resource_identity_keys
        (id, workspace_id, resource_id, source_system, key_type, external_key, confidence, source_object_version_id)
       VALUES ($1, $2, $3, 'messages', 'thread-id', $4, 1, $5)
       ON CONFLICT (workspace_id, source_system, key_type, external_key) DO UPDATE SET
         resource_id = EXCLUDED.resource_id,
         confidence = EXCLUDED.confidence,
         source_object_version_id = EXCLUDED.source_object_version_id`,
      [stableId('identity-key', `messages:thread-id:${record.threadExternalId}`), IDS.workspace,
        contentResourceId, record.threadExternalId, sourceVersionId],
    );
    await client.query(
      `INSERT INTO entity_aliases
        (id, workspace_id, resource_id, alias, normalized_alias, alias_type, source_system)
       VALUES ($1, $2, $3, $4, $5, 'source-key', 'messages')
       ON CONFLICT (workspace_id, normalized_alias, alias_type, source_system) DO UPDATE SET
         resource_id = EXCLUDED.resource_id,
         alias = EXCLUDED.alias`,
      [stableId('entity-alias', `messages:channel:${record.channel.externalId}`), IDS.workspace,
        IDS.resources.project, record.channel.alias, normalizeName(record.channel.alias)],
    );
  }
  await ensureRelationshipAssertion(client, {
    from: authorResourceId,
    to: contentResourceId,
    type: 'AUTHORED',
    scopeId,
    assertionKind: 'source-backed',
    sourceVersionId,
    confidence: 1,
    excerpt: record.body,
    processName,
  });
  await ensureRelationshipAssertion(client, {
    from: IDS.resources.project,
    to: IDS.resources.atlas,
    type: 'IS_FOR',
    scopeId,
    assertionKind: 'rule-derived',
    sourceVersionId,
    confidence: 1,
    excerpt: record.body,
    processName,
  });

  if (!record.evidence) return;
  const evidenceResourceId = stableId('evidence-resource', record.externalId);
  await upsertResource(client, {
    id: evidenceResourceId,
    scopeId,
    kind: 'entity',
    type: 'Evidence',
    name: record.evidence.title,
    summary: record.evidence.summary,
    properties: { stance: record.evidence.stance },
  });
  await ensureRelationshipAssertion(client, {
    from: evidenceResourceId,
    to: contentResourceId,
    type: 'DERIVED_FROM',
    scopeId,
    assertionKind: 'rule-derived',
    sourceVersionId,
    confidence: record.evidence.confidence,
    excerpt: record.body,
    processName,
  });
  await ensureRelationshipAssertion(client, {
    from: evidenceResourceId,
    to: IDS.resources.project,
    type: 'BELONGS_TO',
    scopeId,
    assertionKind: 'rule-derived',
    sourceVersionId,
    confidence: 1,
    excerpt: record.body,
    processName,
  });
  const stance = await ensureRelationshipAssertion(client, {
    from: evidenceResourceId,
    to: IDS.resources.hypothesis,
    type: record.evidence.stance,
    scopeId,
    assertionKind: 'source-backed',
    sourceVersionId,
    confidence: record.evidence.confidence,
    excerpt: record.body,
    processName,
  });
  await client.query(
    `INSERT INTO search_documents
      (id, workspace_id, access_scope_id, resource_id, assertion_id, content_version_id, body, authority,
       confidence, source_updated_at, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
     ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, authority = EXCLUDED.authority,
       access_scope_id = EXCLUDED.access_scope_id, confidence = EXCLUDED.confidence,
       source_updated_at = EXCLUDED.source_updated_at, active = true`,
    [
      stableId('search-document', `${evidenceResourceId}:${contentVersionId}`),
      IDS.workspace,
      scopeId,
      evidenceResourceId,
      stance.assertionId,
      contentVersionId,
      `${record.evidence.title}. ${record.evidence.summary} ${record.body}`,
      record.authority,
      record.evidence.confidence,
      record.updatedAt,
    ],
  );
}

async function runSourceSync<T extends KnowledgeSourceRecord>(
  client: PoolClient,
  connector: Connector<T>,
  config: {
    sourceId: string;
    sourceName: string;
    contentType: 'ResearchNote' | 'MeetingNote' | 'Document' | 'MessageThread';
    processName: string;
  },
) {
  await ensureCoreResources(client);
  await client.query(
    `INSERT INTO sources (id, workspace_id, source_type, name, status)
     VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT (id) DO NOTHING`,
    [config.sourceId, IDS.workspace, connector.sourceType, config.sourceName],
  );
  const source = await client.query<{ cursor: string | null }>('SELECT cursor FROM sources WHERE id = $1', [config.sourceId]);
  const cursorBefore = source.rows[0]?.cursor ?? null;
  const runId = randomUUID();
  await client.query(
    `INSERT INTO sync_runs (id, workspace_id, source_id, status, cursor_before)
     VALUES ($1, $2, $3, 'running', $4)`,
    [runId, IDS.workspace, config.sourceId, cursorBefore],
  );
  try {
    const page = await connector.listChanges(cursorBefore);
    let changed = 0;
    for (const record of page.records) {
      const hash = contentHash(record);
      const sourceObjectId = stableId('source-object', `${config.sourceId}:${record.externalId}`);
      const sourceVersionId = stableId('source-version', `${config.sourceId}:${record.externalId}:${hash}`);
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
           access_scope_id = EXCLUDED.access_scope_id,
           source_uri = EXCLUDED.source_uri,
           source_updated_at = EXCLUDED.source_updated_at,
           current_content_hash = EXCLUDED.current_content_hash,
           deleted = false,
           updated_at = now()`,
        [sourceObjectId, IDS.workspace, config.sourceId, scopeFor(record.visibility), record.externalId,
          record.uri, record.createdAt, record.updatedAt, hash],
      );
      if (existing.rows[0]?.current_content_hash === hash) continue;
      changed += 1;
      await client.query(
        `INSERT INTO source_object_versions
          (id, workspace_id, source_object_id, access_scope_id, content_hash, raw_payload, source_updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (source_object_id, content_hash) DO NOTHING`,
        [sourceVersionId, IDS.workspace, sourceObjectId, scopeFor(record.visibility), hash, record, record.updatedAt],
      );
      await mapRecord(client, record, sourceVersionId, config.contentType, config.processName);
    }
    await client.query(
      `UPDATE sources SET cursor = $2, status = 'healthy', last_successful_sync_at = now(), updated_at = now()
       WHERE id = $1`,
      [config.sourceId, page.nextCursor],
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

export function runResearchSync(client: PoolClient, connector: Connector<ResearchSourceRecord>) {
  return runSourceSync(client, connector, {
    sourceId: IDS.sources.research,
    sourceName: 'Northstar Research Repository',
    contentType: 'ResearchNote',
    processName: 'research-semantic-mapper',
  });
}

export function runMeetingSync(client: PoolClient, connector: Connector<MeetingSourceRecord>) {
  return runSourceSync(client, connector, {
    sourceId: IDS.sources.meetings,
    sourceName: 'Northstar Meeting Notes',
    contentType: 'MeetingNote',
    processName: 'meeting-semantic-mapper',
  });
}

export function runDocumentSync(client: PoolClient, connector: Connector<DocumentSourceRecord>) {
  return runSourceSync(client, connector, {
    sourceId: IDS.sources.documents,
    sourceName: 'Northstar Documents',
    contentType: 'Document',
    processName: 'document-semantic-mapper',
  });
}

export function runMessageSync(client: PoolClient, connector: Connector<MessageSourceRecord>) {
  return runSourceSync(client, connector, {
    sourceId: IDS.sources.messages,
    sourceName: 'Northstar Messages',
    contentType: 'MessageThread',
    processName: 'message-semantic-mapper',
  });
}
