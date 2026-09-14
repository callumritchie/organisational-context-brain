import {
  bigint,
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

export const identityResolutionCandidates = pgTable('identity_resolution_candidates', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  sourceSystem: text('source_system').notNull(),
  keyType: text('key_type').notNull(),
  externalKey: text('external_key').notNull(),
  candidateResourceId: uuid('candidate_resource_id').notNull().references(() => resources.id),
  sourceObjectVersionId: uuid('source_object_version_id').notNull().references(() => sourceObjectVersions.id),
  confidence: real('confidence').notNull(),
  status: text('status').notNull(),
  rationale: text('rationale').notNull(),
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
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  assertionId: uuid('assertion_id').references(() => assertions.id),
  contentVersionId: uuid('content_version_id').references(() => contentVersions.id),
  body: text('body').notNull(),
  chunkIndex: integer('chunk_index').notNull().default(0),
  chunkStartOffset: integer('chunk_start_offset').notNull().default(0),
  chunkEndOffset: integer('chunk_end_offset').notNull(),
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

export const modelRoutePolicies = pgTable('model_route_policies', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  name: text('name').notNull(),
  mode: text('mode').notNull().default('deterministic-only'),
  routingRules: jsonb('routing_rules').notNull(),
  budgetLimits: jsonb('budget_limits').notNull(),
  allowedProviders: jsonb('allowed_providers').notNull().default([]),
  enabled: boolean('enabled').notNull().default(true),
  ...timestamps,
});

export const monitorPolicies = pgTable('monitor_policies', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  hypothesisResourceId: uuid('hypothesis_resource_id').notNull().references(() => resources.id),
  ownerActorId: uuid('owner_actor_id').notNull().references(() => users.id),
  serviceActorId: uuid('service_actor_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  queryText: text('query_text').notNull(),
  status: text('status').notNull().default('active'),
  triggerPolicy: jsonb('trigger_policy').notNull(),
  materialityPolicy: jsonb('materiality_policy').notNull(),
  reviewPolicy: jsonb('review_policy').notNull(),
  stopConditions: jsonb('stop_conditions').notNull(),
  modelRoutePolicyId: uuid('model_route_policy_id').references(() => modelRoutePolicies.id),
  latestSnapshotId: uuid('latest_snapshot_id'),
  ...timestamps,
});

export const sourceChangeEvents = pgTable('source_change_events', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  sourceId: uuid('source_id').references(() => sources.id),
  triggerRef: text('trigger_ref').notNull(),
  changedObjects: integer('changed_objects').notNull(),
  eventKind: text('event_kind').notNull().default('source-change'),
  connectorType: text('connector_type'),
  changeKind: text('change_kind').notNull().default('upsert'),
  sourceObjectVersionIds: jsonb('source_object_version_ids').notNull().default([]),
  affectedResourceIds: jsonb('affected_resource_ids').notNull().default([]),
  routingPayload: jsonb('routing_payload').notNull().default({}),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => [uniqueIndex('source_change_events_trigger_ref').on(table.workspaceId, table.triggerRef)]);

export const monitorRuns = pgTable('monitor_runs', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  monitorPolicyId: uuid('monitor_policy_id').notNull().references(() => monitorPolicies.id),
  sourceChangeEventId: uuid('source_change_event_id').notNull().references(() => sourceChangeEvents.id),
  serviceActorId: uuid('service_actor_id').notNull().references(() => users.id),
  status: text('status').notNull(),
  material: boolean('material').notNull().default(false),
  beforeSnapshotId: uuid('before_snapshot_id'),
  afterSnapshotId: uuid('after_snapshot_id'),
  rationale: text('rationale'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (table) => [uniqueIndex('monitor_runs_policy_event').on(table.monitorPolicyId, table.sourceChangeEventId)]);

export const contextSnapshots = pgTable('context_snapshots', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  monitorPolicyId: uuid('monitor_policy_id').notNull().references(() => monitorPolicies.id),
  monitorRunId: uuid('monitor_run_id').references(() => monitorRuns.id),
  traceId: uuid('trace_id').references(() => queryTraces.id),
  contextHash: text('context_hash').notNull(),
  epistemicStatus: text('epistemic_status').notNull(),
  supportingEvidence: integer('supporting_evidence').notNull(),
  contradictingEvidence: integer('contradicting_evidence').notNull(),
  evidencePayload: jsonb('evidence_payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const evidenceDeltas = pgTable('evidence_deltas', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  monitorRunId: uuid('monitor_run_id').notNull().references(() => monitorRuns.id),
  evidenceResourceId: uuid('evidence_resource_id').notNull().references(() => resources.id),
  deltaType: text('delta_type').notNull(),
  previousStance: text('previous_stance'),
  currentStance: text('current_stance'),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memoryCandidates = pgTable('memory_candidates', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  monitorPolicyId: uuid('monitor_policy_id').notNull().references(() => monitorPolicies.id),
  monitorRunId: uuid('monitor_run_id').notNull().references(() => monitorRuns.id),
  hypothesisResourceId: uuid('hypothesis_resource_id').notNull().references(() => resources.id),
  evidenceResourceId: uuid('evidence_resource_id').notNull().references(() => resources.id),
  evidenceAssertionId: uuid('evidence_assertion_id').notNull().references(() => assertions.id),
  candidateKind: text('candidate_kind').notNull(),
  statement: text('statement').notNull(),
  rationale: text('rationale').notNull(),
  confidence: real('confidence').notNull(),
  status: text('status').notNull().default('proposed'),
  processName: text('process_name').notNull(),
  processVersion: text('process_version').notNull(),
  proposedScope: jsonb('proposed_scope').notNull().default({}),
  predictions: jsonb('predictions').notNull().default([]),
  falsificationConditions: jsonb('falsification_conditions').notNull().default([]),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  promotedResourceId: uuid('promoted_resource_id').references(() => resources.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const hypothesisRecords = pgTable('hypothesis_records', {
  resourceId: uuid('resource_id').primaryKey().references(() => resources.id),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  ownerActorId: uuid('owner_actor_id').notNull().references(() => users.id),
  lifecycleStatus: text('lifecycle_status').notNull().default('proposed'),
  epistemicStatus: text('epistemic_status').notNull().default('untested'),
  currentRevision: integer('current_revision').notNull().default(1),
  staleAfterSeconds: integer('stale_after_seconds').notNull().default(2_592_000),
  lastEvaluatedAt: timestamp('last_evaluated_at', { withTimezone: true }),
  supersededByResourceId: uuid('superseded_by_resource_id').references(() => resources.id),
  ...timestamps,
});

export const hypothesisRevisions = pgTable('hypothesis_revisions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  hypothesisResourceId: uuid('hypothesis_resource_id').notNull().references(() => hypothesisRecords.resourceId),
  revisionNumber: integer('revision_number').notNull(),
  statement: text('statement').notNull(),
  scopeDocument: jsonb('scope_document').notNull().default({}),
  predictions: jsonb('predictions').notNull().default([]),
  falsificationConditions: jsonb('falsification_conditions').notNull().default([]),
  ontologyVersionId: uuid('ontology_version_id').references(() => ontologyVersions.id),
  processName: text('process_name').notNull(),
  processVersion: text('process_version').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  changeReason: text('change_reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const hypothesisEvaluations = pgTable('hypothesis_evaluations', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  hypothesisResourceId: uuid('hypothesis_resource_id').notNull().references(() => hypothesisRecords.resourceId),
  monitorRunId: uuid('monitor_run_id').notNull().references(() => monitorRuns.id),
  contextSnapshotId: uuid('context_snapshot_id').notNull().references(() => contextSnapshots.id),
  epistemicStatus: text('epistemic_status').notNull(),
  supportingEvidence: integer('supporting_evidence').notNull(),
  contradictingEvidence: integer('contradicting_evidence').notNull(),
  rationale: text('rationale').notNull(),
  processName: text('process_name').notNull(),
  processVersion: text('process_version').notNull(),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const hypothesisTransitions = pgTable('hypothesis_transitions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  hypothesisResourceId: uuid('hypothesis_resource_id').notNull().references(() => hypothesisRecords.resourceId),
  transitionKind: text('transition_kind').notNull(),
  fromState: text('from_state').notNull(),
  toState: text('to_state').notNull(),
  reason: text('reason').notNull(),
  actorId: uuid('actor_id').notNull().references(() => users.id),
  monitorRunId: uuid('monitor_run_id').references(() => monitorRuns.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const monitorJobs = pgTable('monitor_jobs', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  monitorPolicyId: uuid('monitor_policy_id').notNull().references(() => monitorPolicies.id),
  sourceChangeEventId: uuid('source_change_event_id').references(() => sourceChangeEvents.id),
  jobKind: text('job_kind').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status').notNull().default('pending'),
  priority: integer('priority').notNull().default(50),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  leasedUntil: timestamp('leased_until', { withTimezone: true }),
  workerId: text('worker_id'),
  lastError: text('last_error'),
  payload: jsonb('payload').notNull().default({}),
  ...timestamps,
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const monitorSchedules = pgTable('monitor_schedules', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  monitorPolicyId: uuid('monitor_policy_id').notNull().references(() => monitorPolicies.id),
  intervalSeconds: integer('interval_seconds').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  nextDueAt: timestamp('next_due_at', { withTimezone: true }).notNull(),
  lastEnqueuedAt: timestamp('last_enqueued_at', { withTimezone: true }),
  ...timestamps,
});

export const modelInvocations = pgTable('model_invocations', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  routePolicyId: uuid('route_policy_id').notNull().references(() => modelRoutePolicies.id),
  monitorRunId: uuid('monitor_run_id').references(() => monitorRuns.id),
  monitorJobId: uuid('monitor_job_id').references(() => monitorJobs.id),
  purpose: text('purpose').notNull(),
  taskFingerprint: text('task_fingerprint').notNull(),
  selectedRoute: text('selected_route').notNull(),
  decisionReason: text('decision_reason').notNull(),
  provider: text('provider'),
  model: text('model'),
  promptVersion: text('prompt_version').notNull(),
  estimatedInputTokens: integer('estimated_input_tokens').notNull(),
  maximumOutputTokens: integer('maximum_output_tokens').notNull(),
  actualInputTokens: integer('actual_input_tokens'),
  actualOutputTokens: integer('actual_output_tokens'),
  estimatedCostMicros: bigint('estimated_cost_micros', { mode: 'number' }).notNull().default(0),
  actualCostMicros: bigint('actual_cost_micros', { mode: 'number' }),
  cacheHit: boolean('cache_hit').notNull().default(false),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const modelUsageLedger = pgTable('model_usage_ledger', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  invocationId: uuid('invocation_id').notNull().references(() => modelInvocations.id),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cachedTokens: integer('cached_tokens').notNull().default(0),
  reasoningTokens: integer('reasoning_tokens').notNull().default(0),
  costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
  priceVersion: text('price_version').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notificationOutbox = pgTable('notification_outbox', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id').notNull().references(() => accessScopes.id),
  monitorPolicyId: uuid('monitor_policy_id').notNull().references(() => monitorPolicies.id),
  memoryCandidateId: uuid('memory_candidate_id').references(() => memoryCandidates.id),
  recipientActorId: uuid('recipient_actor_id').notNull().references(() => users.id),
  notificationType: text('notification_type').notNull(),
  severity: text('severity').notNull(),
  deduplicationKey: text('deduplication_key').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
});
