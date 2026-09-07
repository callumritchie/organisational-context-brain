import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  ...timestamps,
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  roleLabel: text('role_label').notNull(),
  ...timestamps,
});

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  ...timestamps,
});

export const groupMemberships = pgTable('group_memberships', {
  groupId: uuid('group_id').notNull().references(() => groups.id),
  userId: uuid('user_id').notNull().references(() => users.id),
});

export const accessScopes = pgTable('access_scopes', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  ...timestamps,
});

export const accessScopeGrants = pgTable('access_scope_grants', {
  id: uuid('id').primaryKey(),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  principalType: text('principal_type').notNull(),
  principalId: uuid('principal_id'),
  permission: text('permission').notNull().default('read'),
});

export const resources = pgTable('resources', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  resourceKind: text('resource_kind').notNull(),
  semanticType: text('semantic_type').notNull(),
  canonicalName: text('canonical_name').notNull(),
  summary: text('summary'),
  properties: jsonb('properties').notNull().default({}),
  status: text('status').notNull().default('active'),
  ...timestamps,
});

export const entities = pgTable('entities', {
  resourceId: uuid('resource_id').primaryKey().references(() => resources.id),
  normalizedName: text('normalized_name').notNull(),
});

export const entityAliases = pgTable('entity_aliases', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  alias: text('alias').notNull(),
  normalizedAlias: text('normalized_alias').notNull(),
  aliasType: text('alias_type').notNull(),
  sourceSystem: text('source_system').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ontologyVersions = pgTable('ontology_versions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  version: text('version').notNull(),
  status: text('status').notNull(),
  schemaDocument: jsonb('schema_document').notNull(),
  checksum: text('checksum').notNull(),
  processName: text('process_name').notNull(),
  processVersion: text('process_version').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contentObjects = pgTable('content_objects', {
  resourceId: uuid('resource_id').primaryKey().references(() => resources.id),
  contentType: text('content_type').notNull(),
  currentVersionId: uuid('current_version_id'),
});

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  sourceType: text('source_type').notNull(),
  name: text('name').notNull(),
  cursor: text('cursor'),
  status: text('status').notNull().default('pending'),
  lastSuccessfulSyncAt: timestamp('last_successful_sync_at', { withTimezone: true }),
  ...timestamps,
});

export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  sourceId: uuid('source_id').notNull().references(() => sources.id),
  status: text('status').notNull(),
  cursorBefore: text('cursor_before'),
  cursorAfter: text('cursor_after'),
  objectsSeen: integer('objects_seen').notNull().default(0),
  objectsChanged: integer('objects_changed').notNull().default(0),
  errorSummary: text('error_summary'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const sourceObjects = pgTable('source_objects', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  sourceId: uuid('source_id').notNull().references(() => sources.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  externalId: text('external_id').notNull(),
  sourceUri: text('source_uri').notNull(),
  sourceCreatedAt: timestamp('source_created_at', { withTimezone: true }).notNull(),
  sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }).notNull(),
  currentContentHash: text('current_content_hash'),
  deleted: boolean('deleted').notNull().default(false),
  ...timestamps,
}, (table) => [uniqueIndex('source_objects_external_key').on(table.sourceId, table.externalId)]);

export const sourceObjectVersions = pgTable('source_object_versions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  sourceObjectId: uuid('source_object_id').notNull().references(() => sourceObjects.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  contentHash: text('content_hash').notNull(),
  rawPayload: jsonb('raw_payload').notNull(),
  sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }).notNull(),
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
});

export const resourceIdentityKeys = pgTable('resource_identity_keys', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  sourceSystem: text('source_system').notNull(),
  keyType: text('key_type').notNull(),
  externalKey: text('external_key').notNull(),
  confidence: real('confidence').notNull(),
  sourceObjectVersionId: uuid('source_object_version_id').notNull().references(() => sourceObjectVersions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contentVersions = pgTable('content_versions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  contentResourceId: uuid('content_resource_id').notNull().references(() => resources.id),
  sourceObjectVersionId: uuid('source_object_version_id').notNull().references(() => sourceObjectVersions.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  body: text('body').notNull(),
  contentHash: text('content_hash').notNull(),
  versionNumber: integer('version_number').notNull(),
  isCurrent: boolean('is_current').notNull().default(true),
  ...timestamps,
});

export const relationships = pgTable('relationships', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  fromResourceId: uuid('from_resource_id').notNull().references(() => resources.id),
  toResourceId: uuid('to_resource_id').notNull().references(() => resources.id),
  relationshipType: text('relationship_type').notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex('relationships_canonical_edge').on(
    table.workspaceId,
    table.fromResourceId,
    table.toResourceId,
    table.relationshipType,
  ),
]);

export const assertions = pgTable('assertions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  subjectResourceId: uuid('subject_resource_id').notNull().references(() => resources.id),
  predicate: text('predicate').notNull(),
  objectResourceId: uuid('object_resource_id').references(() => resources.id),
  relationshipId: uuid('relationship_id').references(() => relationships.id),
  value: jsonb('value'),
  assertionKind: text('assertion_kind').notNull(),
  sourceObjectVersionId: uuid('source_object_version_id').references(() => sourceObjectVersions.id),
  processName: text('process_name').notNull(),
  processVersion: text('process_version').notNull(),
  confidence: real('confidence').notNull(),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  validTo: timestamp('valid_to', { withTimezone: true }),
  ...timestamps,
});

export const provenanceSpans = pgTable('provenance_spans', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  assertionId: uuid('assertion_id').notNull().references(() => assertions.id),
  sourceObjectVersionId: uuid('source_object_version_id').notNull().references(() => sourceObjectVersions.id),
  startOffset: integer('start_offset').notNull(),
  endOffset: integer('end_offset').notNull(),
  excerpt: text('excerpt').notNull(),
});

export const searchDocuments = pgTable('search_documents', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  assertionId: uuid('assertion_id').references(() => assertions.id),
  contentVersionId: uuid('content_version_id').references(() => contentVersions.id),
  body: text('body').notNull(),
  authority: real('authority').notNull().default(0.5),
  confidence: real('confidence').notNull().default(0.5),
  sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }).notNull(),
  active: boolean('active').notNull().default(true),
});

export const searchEmbeddings = pgTable('search_embeddings', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  searchDocumentId: uuid('search_document_id').notNull().references(() => searchDocuments.id),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  dimensions: integer('dimensions').notNull(),
  contentHash: text('content_hash').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
  isCurrent: boolean('is_current').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const signalObservations = pgTable('signal_observations', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  signalType: text('signal_type').notNull(),
  value: real('value').notNull(),
  sourceKind: text('source_kind').notNull(),
  sourceObjectVersionId: uuid('source_object_version_id').references(() => sourceObjectVersions.id),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const signalSnapshots = pgTable('signal_snapshots', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  authority: real('authority').notNull(),
  freshness: real('freshness').notNull(),
  engagement: real('engagement').notNull(),
  affinity: real('affinity').notNull(),
  epistemicConfidence: real('epistemic_confidence').notNull(),
  modelVersion: text('model_version').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  isCurrent: boolean('is_current').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const queryTraces = pgTable('query_traces', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  actorId: uuid('actor_id').notNull().references(() => users.id),
  queryText: text('query_text').notNull(),
  rankingVersion: text('ranking_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const traceStages = pgTable('trace_stages', {
  id: uuid('id').primaryKey(),
  traceId: uuid('trace_id').notNull().references(() => queryTraces.id),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  actorId: uuid('actor_id').notNull().references(() => users.id),
  stage: text('stage').notNull(),
  ordinal: integer('ordinal').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
