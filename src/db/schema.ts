import {
  type AnyPgColumn,
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
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  ...timestamps,
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  name: text('name').notNull(),
  roleLabel: text('role_label').notNull(),
  ...timestamps,
});

export const identityProviders = pgTable(
  'identity_providers',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    issuer: text('issuer').notNull(),
    audience: text('audience').notNull(),
    jwksUri: text('jwks_uri').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('identity_providers_issuer_audience_workspace').on(
      table.issuer,
      table.audience,
      table.workspaceId,
    ),
  ],
);

export const externalIdentities = pgTable(
  'external_identities',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    identityProviderId: uuid('identity_provider_id')
      .notNull()
      .references(() => identityProviders.id),
    subject: text('subject').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    active: boolean('active').notNull().default(true),
    lastAuthenticatedAt: timestamp('last_authenticated_at', {
      withTimezone: true,
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('external_identities_provider_subject').on(
      table.identityProviderId,
      table.subject,
    ),
    uniqueIndex('external_identities_provider_user').on(
      table.identityProviderId,
      table.userId,
    ),
  ],
);

export const userCapabilities = pgTable(
  'user_capabilities',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    capability: text('capability').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('user_capabilities_user_capability').on(
      table.userId,
      table.capability,
    ),
  ],
);

export const oidcLoginAttempts = pgTable(
  'oidc_login_attempts',
  {
    id: uuid('id').primaryKey(),
    stateHash: text('state_hash').notNull(),
    browserBindingHash: text('browser_binding_hash').notNull(),
    codeVerifier: text('code_verifier').notNull(),
    nonce: text('nonce').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    returnTo: text('return_to').notNull().default('/'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('oidc_login_attempts_state_hash').on(table.stateHash),
  ],
);

export const browserSessions = pgTable(
  'browser_sessions',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    externalIdentityId: uuid('external_identity_id')
      .notNull()
      .references(() => externalIdentities.id),
    sessionTokenHash: text('session_token_hash').notNull(),
    csrfTokenHash: text('csrf_token_hash').notNull(),
    userAgentHash: text('user_agent_hash'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    idleExpiresAt: timestamp('idle_expires_at', {
      withTimezone: true,
    }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokeReason: text('revoke_reason'),
  },
  (table) => [
    uniqueIndex('browser_sessions_session_token_hash').on(
      table.sessionTokenHash,
    ),
  ],
);

export const apiRateLimitWindows = pgTable(
  'api_rate_limit_windows',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    operationClass: text('operation_class').notNull(),
    windowStartedAt: timestamp('window_started_at', {
      withTimezone: true,
    }).notNull(),
    requestCount: integer('request_count').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('api_rate_limit_windows_actor_operation').on(
      table.workspaceId,
      table.actorId,
      table.operationClass,
    ),
  ],
);

export const securityAuditEvents = pgTable('security_audit_events', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  actorId: uuid('actor_id').references(() => users.id),
  eventType: text('event_type').notNull(),
  outcome: text('outcome').notNull(),
  requestId: text('request_id'),
  sessionId: uuid('session_id'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  name: text('name').notNull(),
  ...timestamps,
});

export const groupMemberships = pgTable('group_memberships', {
  groupId: uuid('group_id')
    .notNull()
    .references(() => groups.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
});

export const accessScopes = pgTable('access_scopes', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  name: text('name').notNull(),
  ...timestamps,
});

export const accessScopeGrants = pgTable('access_scope_grants', {
  id: uuid('id').primaryKey(),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  principalType: text('principal_type').notNull(),
  principalId: uuid('principal_id'),
  permission: text('permission').notNull().default('read'),
});

export const resources = pgTable('resources', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  resourceKind: text('resource_kind').notNull(),
  semanticType: text('semantic_type').notNull(),
  canonicalName: text('canonical_name').notNull(),
  summary: text('summary'),
  properties: jsonb('properties').notNull().default({}),
  status: text('status').notNull().default('active'),
  ...timestamps,
});

export const entities = pgTable('entities', {
  resourceId: uuid('resource_id')
    .primaryKey()
    .references(() => resources.id),
  normalizedName: text('normalized_name').notNull(),
});

export const entityAliases = pgTable('entity_aliases', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  resourceId: uuid('resource_id')
    .notNull()
    .references(() => resources.id),
  alias: text('alias').notNull(),
  normalizedAlias: text('normalized_alias').notNull(),
  aliasType: text('alias_type').notNull(),
  sourceSystem: text('source_system').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ontologyVersions = pgTable('ontology_versions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  version: text('version').notNull(),
  status: text('status').notNull(),
  schemaDocument: jsonb('schema_document').notNull(),
  checksum: text('checksum').notNull(),
  processName: text('process_name').notNull(),
  processVersion: text('process_version').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ontologyChangeProposals = pgTable('ontology_change_proposals', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  baseOntologyVersionId: uuid('base_ontology_version_id')
    .notNull()
    .references(() => ontologyVersions.id),
  sourceCandidateId: uuid('source_candidate_id'),
  proposedBy: uuid('proposed_by')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  changeSet: jsonb('change_set').notNull(),
  evidenceResourceIds: jsonb('evidence_resource_ids').notNull().default([]),
  impactAnalysis: jsonb('impact_analysis').notNull(),
  status: text('status').notNull().default('proposed'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  publishedOntologyVersionId: uuid('published_ontology_version_id').references(
    () => ontologyVersions.id,
  ),
  ...timestamps,
});

export const ontologyMappingRules = pgTable('ontology_mapping_rules', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  ontologyVersionId: uuid('ontology_version_id')
    .notNull()
    .references(() => ontologyVersions.id),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => ontologyChangeProposals.id),
  alias: text('alias').notNull(),
  canonicalTarget: text('canonical_target').notNull(),
  description: text('description').notNull(),
  processName: text('process_name').notNull(),
  processVersion: text('process_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ontologyActivationRuns = pgTable('ontology_activation_runs', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => ontologyChangeProposals.id),
  fromOntologyVersionId: uuid('from_ontology_version_id')
    .notNull()
    .references(() => ontologyVersions.id),
  toOntologyVersionId: uuid('to_ontology_version_id')
    .notNull()
    .references(() => ontologyVersions.id),
  status: text('status').notNull(),
  affectedResourceIds: jsonb('affected_resource_ids').notNull(),
  affectedHypothesisIds: jsonb('affected_hypothesis_ids').notNull(),
  replayContract: jsonb('replay_contract').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const contentObjects = pgTable('content_objects', {
  resourceId: uuid('resource_id')
    .primaryKey()
    .references(() => resources.id),
  contentType: text('content_type').notNull(),
  currentVersionId: uuid('current_version_id'),
});

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  sourceType: text('source_type').notNull(),
  name: text('name').notNull(),
  cursor: text('cursor'),
  status: text('status').notNull().default('pending'),
  lastSuccessfulSyncAt: timestamp('last_successful_sync_at', {
    withTimezone: true,
  }),
  ...timestamps,
});

export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id),
  status: text('status').notNull(),
  cursorBefore: text('cursor_before'),
  cursorAfter: text('cursor_after'),
  objectsSeen: integer('objects_seen').notNull().default(0),
  objectsChanged: integer('objects_changed').notNull().default(0),
  errorSummary: text('error_summary'),
  startedAt: timestamp('started_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const sourceObjects = pgTable(
  'source_objects',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id),
    accessScopeId: uuid('access_scope_id')
      .notNull()
      .references(() => accessScopes.id),
    externalId: text('external_id').notNull(),
    sourceUri: text('source_uri').notNull(),
    sourceCreatedAt: timestamp('source_created_at', {
      withTimezone: true,
    }).notNull(),
    sourceUpdatedAt: timestamp('source_updated_at', {
      withTimezone: true,
    }).notNull(),
    currentContentHash: text('current_content_hash'),
    deleted: boolean('deleted').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('source_objects_external_key').on(
      table.sourceId,
      table.externalId,
    ),
  ],
);

export const sourceObjectVersions = pgTable('source_object_versions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  sourceObjectId: uuid('source_object_id')
    .notNull()
    .references(() => sourceObjects.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  contentHash: text('content_hash').notNull(),
  rawPayload: jsonb('raw_payload').notNull(),
  sourceUpdatedAt: timestamp('source_updated_at', {
    withTimezone: true,
  }).notNull(),
  ingestedAt: timestamp('ingested_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const resourceIdentityKeys = pgTable('resource_identity_keys', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  resourceId: uuid('resource_id')
    .notNull()
    .references(() => resources.id),
  sourceSystem: text('source_system').notNull(),
  keyType: text('key_type').notNull(),
  externalKey: text('external_key').notNull(),
  confidence: real('confidence').notNull(),
  sourceObjectVersionId: uuid('source_object_version_id')
    .notNull()
    .references(() => sourceObjectVersions.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const identityResolutionCandidates = pgTable(
  'identity_resolution_candidates',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    sourceSystem: text('source_system').notNull(),
    keyType: text('key_type').notNull(),
    externalKey: text('external_key').notNull(),
    candidateResourceId: uuid('candidate_resource_id')
      .notNull()
      .references(() => resources.id),
    sourceObjectVersionId: uuid('source_object_version_id')
      .notNull()
      .references(() => sourceObjectVersions.id),
    confidence: real('confidence').notNull(),
    status: text('status').notNull(),
    rationale: text('rationale').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const contentVersions = pgTable('content_versions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  contentResourceId: uuid('content_resource_id')
    .notNull()
    .references(() => resources.id),
  sourceObjectVersionId: uuid('source_object_version_id')
    .notNull()
    .references(() => sourceObjectVersions.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  body: text('body').notNull(),
  contentHash: text('content_hash').notNull(),
  versionNumber: integer('version_number').notNull(),
  isCurrent: boolean('is_current').notNull().default(true),
  ...timestamps,
});

export const relationships = pgTable(
  'relationships',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    fromResourceId: uuid('from_resource_id')
      .notNull()
      .references(() => resources.id),
    toResourceId: uuid('to_resource_id')
      .notNull()
      .references(() => resources.id),
    relationshipType: text('relationship_type').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('relationships_canonical_edge').on(
      table.workspaceId,
      table.fromResourceId,
      table.toResourceId,
      table.relationshipType,
    ),
  ],
);

export const assertions = pgTable('assertions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  subjectResourceId: uuid('subject_resource_id')
    .notNull()
    .references(() => resources.id),
  predicate: text('predicate').notNull(),
  objectResourceId: uuid('object_resource_id').references(() => resources.id),
  relationshipId: uuid('relationship_id').references(() => relationships.id),
  value: jsonb('value'),
  assertionKind: text('assertion_kind').notNull(),
  sourceObjectVersionId: uuid('source_object_version_id').references(
    () => sourceObjectVersions.id,
  ),
  processName: text('process_name').notNull(),
  processVersion: text('process_version').notNull(),
  confidence: real('confidence').notNull(),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  validTo: timestamp('valid_to', { withTimezone: true }),
  ...timestamps,
});

export const provenanceSpans = pgTable('provenance_spans', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  assertionId: uuid('assertion_id')
    .notNull()
    .references(() => assertions.id),
  sourceObjectVersionId: uuid('source_object_version_id')
    .notNull()
    .references(() => sourceObjectVersions.id),
  startOffset: integer('start_offset').notNull(),
  endOffset: integer('end_offset').notNull(),
  excerpt: text('excerpt').notNull(),
});

export const searchDocuments = pgTable('search_documents', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  resourceId: uuid('resource_id')
    .notNull()
    .references(() => resources.id),
  assertionId: uuid('assertion_id').references(() => assertions.id),
  contentVersionId: uuid('content_version_id').references(
    () => contentVersions.id,
  ),
  body: text('body').notNull(),
  chunkIndex: integer('chunk_index').notNull().default(0),
  chunkStartOffset: integer('chunk_start_offset').notNull().default(0),
  chunkEndOffset: integer('chunk_end_offset').notNull(),
  authority: real('authority').notNull().default(0.5),
  confidence: real('confidence').notNull().default(0.5),
  sourceUpdatedAt: timestamp('source_updated_at', {
    withTimezone: true,
  }).notNull(),
  active: boolean('active').notNull().default(true),
});

export const searchEmbeddings = pgTable('search_embeddings', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  searchDocumentId: uuid('search_document_id')
    .notNull()
    .references(() => searchDocuments.id),
  resourceId: uuid('resource_id')
    .notNull()
    .references(() => resources.id),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  dimensions: integer('dimensions').notNull(),
  contentHash: text('content_hash').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
  isCurrent: boolean('is_current').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const signalObservations = pgTable('signal_observations', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  resourceId: uuid('resource_id')
    .notNull()
    .references(() => resources.id),
  signalType: text('signal_type').notNull(),
  value: real('value').notNull(),
  sourceKind: text('source_kind').notNull(),
  sourceObjectVersionId: uuid('source_object_version_id').references(
    () => sourceObjectVersions.id,
  ),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const signalSnapshots = pgTable('signal_snapshots', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  resourceId: uuid('resource_id')
    .notNull()
    .references(() => resources.id),
  authority: real('authority').notNull(),
  freshness: real('freshness').notNull(),
  engagement: real('engagement').notNull(),
  affinity: real('affinity').notNull(),
  epistemicConfidence: real('epistemic_confidence').notNull(),
  modelVersion: text('model_version').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  isCurrent: boolean('is_current').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const queryTraces = pgTable('query_traces', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  queryText: text('query_text').notNull(),
  rankingVersion: text('ranking_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const traceStages = pgTable('trace_stages', {
  id: uuid('id').primaryKey(),
  traceId: uuid('trace_id')
    .notNull()
    .references(() => queryTraces.id),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  stage: text('stage').notNull(),
  ordinal: integer('ordinal').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const modelRoutePolicies = pgTable('model_route_policies', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
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
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  hypothesisResourceId: uuid('hypothesis_resource_id')
    .notNull()
    .references(() => resources.id),
  ownerActorId: uuid('owner_actor_id')
    .notNull()
    .references(() => users.id),
  serviceActorId: uuid('service_actor_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  queryText: text('query_text').notNull(),
  status: text('status').notNull().default('active'),
  triggerPolicy: jsonb('trigger_policy').notNull(),
  materialityPolicy: jsonb('materiality_policy').notNull(),
  reviewPolicy: jsonb('review_policy').notNull(),
  stopConditions: jsonb('stop_conditions').notNull(),
  modelRoutePolicyId: uuid('model_route_policy_id').references(
    () => modelRoutePolicies.id,
  ),
  latestSnapshotId: uuid('latest_snapshot_id'),
  ...timestamps,
});

export const sourceChangeEvents = pgTable(
  'source_change_events',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    accessScopeId: uuid('access_scope_id')
      .notNull()
      .references(() => accessScopes.id),
    sourceId: uuid('source_id').references(() => sources.id),
    triggerRef: text('trigger_ref').notNull(),
    changedObjects: integer('changed_objects').notNull(),
    eventKind: text('event_kind').notNull().default('source-change'),
    connectorType: text('connector_type'),
    changeKind: text('change_kind').notNull().default('upsert'),
    sourceObjectVersionIds: jsonb('source_object_version_ids')
      .notNull()
      .default([]),
    affectedResourceIds: jsonb('affected_resource_ids').notNull().default([]),
    routingPayload: jsonb('routing_payload').notNull().default({}),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('source_change_events_trigger_ref').on(
      table.workspaceId,
      table.triggerRef,
    ),
  ],
);

export const monitorRuns = pgTable(
  'monitor_runs',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    accessScopeId: uuid('access_scope_id')
      .notNull()
      .references(() => accessScopes.id),
    monitorPolicyId: uuid('monitor_policy_id')
      .notNull()
      .references(() => monitorPolicies.id),
    sourceChangeEventId: uuid('source_change_event_id')
      .notNull()
      .references(() => sourceChangeEvents.id),
    serviceActorId: uuid('service_actor_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull(),
    material: boolean('material').notNull().default(false),
    beforeSnapshotId: uuid('before_snapshot_id'),
    afterSnapshotId: uuid('after_snapshot_id'),
    rationale: text('rationale'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('monitor_runs_policy_event').on(
      table.monitorPolicyId,
      table.sourceChangeEventId,
    ),
  ],
);

export const contextSnapshots = pgTable('context_snapshots', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  monitorPolicyId: uuid('monitor_policy_id')
    .notNull()
    .references(() => monitorPolicies.id),
  monitorRunId: uuid('monitor_run_id').references(() => monitorRuns.id),
  traceId: uuid('trace_id').references(() => queryTraces.id),
  contextHash: text('context_hash').notNull(),
  epistemicStatus: text('epistemic_status').notNull(),
  supportingEvidence: integer('supporting_evidence').notNull(),
  contradictingEvidence: integer('contradicting_evidence').notNull(),
  evidencePayload: jsonb('evidence_payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const evidenceDeltas = pgTable('evidence_deltas', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  monitorRunId: uuid('monitor_run_id')
    .notNull()
    .references(() => monitorRuns.id),
  evidenceResourceId: uuid('evidence_resource_id')
    .notNull()
    .references(() => resources.id),
  deltaType: text('delta_type').notNull(),
  previousStance: text('previous_stance'),
  currentStance: text('current_stance'),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const memoryCandidates = pgTable('memory_candidates', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  monitorPolicyId: uuid('monitor_policy_id')
    .notNull()
    .references(() => monitorPolicies.id),
  monitorRunId: uuid('monitor_run_id')
    .notNull()
    .references(() => monitorRuns.id),
  hypothesisResourceId: uuid('hypothesis_resource_id')
    .notNull()
    .references(() => resources.id),
  evidenceResourceId: uuid('evidence_resource_id')
    .notNull()
    .references(() => resources.id),
  evidenceAssertionId: uuid('evidence_assertion_id')
    .notNull()
    .references(() => assertions.id),
  candidateKind: text('candidate_kind').notNull(),
  statement: text('statement').notNull(),
  rationale: text('rationale').notNull(),
  confidence: real('confidence').notNull(),
  status: text('status').notNull().default('proposed'),
  processName: text('process_name').notNull(),
  processVersion: text('process_version').notNull(),
  proposedScope: jsonb('proposed_scope').notNull().default({}),
  predictions: jsonb('predictions').notNull().default([]),
  falsificationConditions: jsonb('falsification_conditions')
    .notNull()
    .default([]),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  promotedResourceId: uuid('promoted_resource_id').references(
    () => resources.id,
  ),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const memoryScopes = pgTable('memory_scopes', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  scopeKind: text('scope_kind').notNull(),
  name: text('name').notNull(),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  subjectResourceId: uuid('subject_resource_id').references(() => resources.id),
  ownerActorId: uuid('owner_actor_id').references(() => users.id),
  parentScopeId: uuid('parent_scope_id').references(
    (): AnyPgColumn => memoryScopes.id,
  ),
  status: text('status').notNull().default('active'),
  ...timestamps,
});

export const organisationalMemories = pgTable(
  'organisational_memories',
  {
    resourceId: uuid('resource_id')
      .primaryKey()
      .references(() => resources.id),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    originScopeId: uuid('origin_scope_id')
      .notNull()
      .references(() => memoryScopes.id),
    visibilityScopeId: uuid('visibility_scope_id')
      .notNull()
      .references(() => memoryScopes.id),
    memoryType: text('memory_type').notNull(),
    statement: text('statement').notNull(),
    statementHash: text('statement_hash').notNull(),
    contextDocument: jsonb('context_document').notNull().default({}),
    policyContext: jsonb('policy_context').notNull().default({}),
    transferClass: text('transfer_class').notNull(),
    sensitivity: text('sensitivity').notNull(),
    lifecycleStatus: text('lifecycle_status').notNull().default('candidate'),
    reviewStatus: text('review_status').notNull().default('proposed'),
    outcomeStatus: text('outcome_status').notNull().default('untested'),
    confidence: real('confidence').notNull(),
    qualityScore: real('quality_score').notNull().default(0),
    abstractionReviewed: boolean('abstraction_reviewed')
      .notNull()
      .default(false),
    validFrom: timestamp('valid_from', { withTimezone: true })
      .notNull()
      .defaultNow(),
    staleAfterSeconds: integer('stale_after_seconds')
      .notNull()
      .default(15_552_000),
    lastOutcomeAt: timestamp('last_outcome_at', { withTimezone: true }),
    processName: text('process_name').notNull(),
    processVersion: text('process_version').notNull(),
    policyVersion: text('policy_version')
      .notNull()
      .default('memory-isolation-v1'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    supersededByMemoryId: uuid('superseded_by_memory_id').references(
      (): AnyPgColumn => organisationalMemories.resourceId,
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('organisational_memories_scope_statement').on(
      table.visibilityScopeId,
      table.statementHash,
    ),
  ],
);

export const organisationalMemoryEvidence = pgTable(
  'organisational_memory_evidence',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    memoryId: uuid('memory_id')
      .notNull()
      .references(() => organisationalMemories.resourceId),
    evidenceResourceId: uuid('evidence_resource_id')
      .notNull()
      .references(() => resources.id),
    evidenceAssertionId: uuid('evidence_assertion_id').references(
      () => assertions.id,
    ),
    evidenceScopeId: uuid('evidence_scope_id')
      .notNull()
      .references(() => memoryScopes.id),
    stance: text('stance').notNull(),
    contribution: text('contribution').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('organisational_memory_evidence_unique').on(
      table.memoryId,
      table.evidenceResourceId,
      table.evidenceAssertionId,
      table.stance,
    ),
  ],
);

export const organisationalMemoryRelations = pgTable(
  'organisational_memory_relations',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    fromMemoryId: uuid('from_memory_id')
      .notNull()
      .references(() => organisationalMemories.resourceId),
    toMemoryId: uuid('to_memory_id')
      .notNull()
      .references(() => organisationalMemories.resourceId),
    relationType: text('relation_type').notNull(),
    rationale: text('rationale').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('organisational_memory_relations_unique').on(
      table.fromMemoryId,
      table.toMemoryId,
      table.relationType,
    ),
  ],
);

export const organisationalMemoryPromotions = pgTable(
  'organisational_memory_promotions',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    sourceMemoryId: uuid('source_memory_id')
      .notNull()
      .references(() => organisationalMemories.resourceId),
    promotedMemoryId: uuid('promoted_memory_id')
      .notNull()
      .references(() => organisationalMemories.resourceId),
    fromScopeId: uuid('from_scope_id')
      .notNull()
      .references(() => memoryScopes.id),
    toScopeId: uuid('to_scope_id')
      .notNull()
      .references(() => memoryScopes.id),
    decision: text('decision').notNull(),
    abstractionSummary: text('abstraction_summary').notNull(),
    rawEvidenceAttached: boolean('raw_evidence_attached')
      .notNull()
      .default(false),
    policyVersion: text('policy_version')
      .notNull()
      .default('memory-isolation-v1'),
    reviewedBy: uuid('reviewed_by')
      .notNull()
      .references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('organisational_memory_promotions_unique').on(
      table.sourceMemoryId,
      table.promotedMemoryId,
    ),
  ],
);

export const hypothesisRecords = pgTable('hypothesis_records', {
  resourceId: uuid('resource_id')
    .primaryKey()
    .references(() => resources.id),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  ownerActorId: uuid('owner_actor_id')
    .notNull()
    .references(() => users.id),
  lifecycleStatus: text('lifecycle_status').notNull().default('proposed'),
  epistemicStatus: text('epistemic_status').notNull().default('untested'),
  currentRevision: integer('current_revision').notNull().default(1),
  staleAfterSeconds: integer('stale_after_seconds')
    .notNull()
    .default(2_592_000),
  lastEvaluatedAt: timestamp('last_evaluated_at', { withTimezone: true }),
  supersededByResourceId: uuid('superseded_by_resource_id').references(
    () => resources.id,
  ),
  ...timestamps,
});

export const hypothesisRevisions = pgTable('hypothesis_revisions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  hypothesisResourceId: uuid('hypothesis_resource_id')
    .notNull()
    .references(() => hypothesisRecords.resourceId),
  revisionNumber: integer('revision_number').notNull(),
  statement: text('statement').notNull(),
  scopeDocument: jsonb('scope_document').notNull().default({}),
  predictions: jsonb('predictions').notNull().default([]),
  falsificationConditions: jsonb('falsification_conditions')
    .notNull()
    .default([]),
  ontologyVersionId: uuid('ontology_version_id').references(
    () => ontologyVersions.id,
  ),
  processName: text('process_name').notNull(),
  processVersion: text('process_version').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  changeReason: text('change_reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const hypothesisEvaluations = pgTable('hypothesis_evaluations', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  hypothesisResourceId: uuid('hypothesis_resource_id')
    .notNull()
    .references(() => hypothesisRecords.resourceId),
  monitorRunId: uuid('monitor_run_id')
    .notNull()
    .references(() => monitorRuns.id),
  contextSnapshotId: uuid('context_snapshot_id')
    .notNull()
    .references(() => contextSnapshots.id),
  epistemicStatus: text('epistemic_status').notNull(),
  supportingEvidence: integer('supporting_evidence').notNull(),
  contradictingEvidence: integer('contradicting_evidence').notNull(),
  rationale: text('rationale').notNull(),
  processName: text('process_name').notNull(),
  processVersion: text('process_version').notNull(),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const hypothesisTransitions = pgTable('hypothesis_transitions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  hypothesisResourceId: uuid('hypothesis_resource_id')
    .notNull()
    .references(() => hypothesisRecords.resourceId),
  transitionKind: text('transition_kind').notNull(),
  fromState: text('from_state').notNull(),
  toState: text('to_state').notNull(),
  reason: text('reason').notNull(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  monitorRunId: uuid('monitor_run_id').references(() => monitorRuns.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const monitorJobs = pgTable('monitor_jobs', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  monitorPolicyId: uuid('monitor_policy_id')
    .notNull()
    .references(() => monitorPolicies.id),
  sourceChangeEventId: uuid('source_change_event_id').references(
    () => sourceChangeEvents.id,
  ),
  jobKind: text('job_kind').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status').notNull().default('pending'),
  priority: integer('priority').notNull().default(50),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  availableAt: timestamp('available_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  leasedUntil: timestamp('leased_until', { withTimezone: true }),
  workerId: text('worker_id'),
  lastError: text('last_error'),
  payload: jsonb('payload').notNull().default({}),
  ...timestamps,
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const monitorSchedules = pgTable('monitor_schedules', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  monitorPolicyId: uuid('monitor_policy_id')
    .notNull()
    .references(() => monitorPolicies.id),
  intervalSeconds: integer('interval_seconds').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  nextDueAt: timestamp('next_due_at', { withTimezone: true }).notNull(),
  lastEnqueuedAt: timestamp('last_enqueued_at', { withTimezone: true }),
  ...timestamps,
});

export const modelInvocations = pgTable('model_invocations', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  routePolicyId: uuid('route_policy_id')
    .notNull()
    .references(() => modelRoutePolicies.id),
  monitorRunId: uuid('monitor_run_id').references(() => monitorRuns.id),
  monitorJobId: uuid('monitor_job_id').references(() => monitorJobs.id),
  discoveryRunId: uuid('discovery_run_id'),
  discoveryJobId: uuid('discovery_job_id'),
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
  estimatedCostMicros: bigint('estimated_cost_micros', { mode: 'number' })
    .notNull()
    .default(0),
  actualCostMicros: bigint('actual_cost_micros', { mode: 'number' }),
  cacheHit: boolean('cache_hit').notNull().default(false),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const modelUsageLedger = pgTable('model_usage_ledger', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  invocationId: uuid('invocation_id')
    .notNull()
    .references(() => modelInvocations.id),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cachedTokens: integer('cached_tokens').notNull().default(0),
  reasoningTokens: integer('reasoning_tokens').notNull().default(0),
  costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
  priceVersion: text('price_version').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notificationOutbox = pgTable('notification_outbox', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  monitorPolicyId: uuid('monitor_policy_id').references(
    () => monitorPolicies.id,
  ),
  discoveryPolicyId: uuid('discovery_policy_id'),
  memoryCandidateId: uuid('memory_candidate_id').references(
    () => memoryCandidates.id,
  ),
  recipientActorId: uuid('recipient_actor_id')
    .notNull()
    .references(() => users.id),
  notificationType: text('notification_type').notNull(),
  severity: text('severity').notNull(),
  deduplicationKey: text('deduplication_key').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
});

export const hypothesisDiscoveryPolicies = pgTable(
  'hypothesis_discovery_policies',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    accessScopeId: uuid('access_scope_id')
      .notNull()
      .references(() => accessScopes.id),
    ownerActorId: uuid('owner_actor_id')
      .notNull()
      .references(() => users.id),
    serviceActorId: uuid('service_actor_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    subject: text('subject').notNull().default('Organisational outcome'),
    projectResourceId: uuid('project_resource_id')
      .notNull()
      .references(() => resources.id),
    sourceIds: jsonb('source_ids').notNull(),
    conceptRules: jsonb('concept_rules').notNull(),
    minimumSourceDiversity: integer('minimum_source_diversity')
      .notNull()
      .default(3),
    status: text('status').notNull().default('active'),
    modelRoutePolicyId: uuid('model_route_policy_id')
      .notNull()
      .references(() => modelRoutePolicies.id),
    ontologyVersionId: uuid('ontology_version_id')
      .notNull()
      .references(() => ontologyVersions.id),
    lastSuccessfulRunAt: timestamp('last_successful_run_at', {
      withTimezone: true,
    }),
    ...timestamps,
  },
);

export const hypothesisDiscoveryRuns = pgTable('hypothesis_discovery_runs', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  discoveryPolicyId: uuid('discovery_policy_id')
    .notNull()
    .references(() => hypothesisDiscoveryPolicies.id),
  ontologyVersionId: uuid('ontology_version_id')
    .notNull()
    .references(() => ontologyVersions.id),
  triggerRef: text('trigger_ref').notNull(),
  status: text('status').notNull(),
  documentsScanned: integer('documents_scanned').notNull().default(0),
  sourceSystemsScanned: integer('source_systems_scanned').notNull().default(0),
  candidatesFormed: integer('candidates_formed').notNull().default(0),
  candidatesReobserved: integer('candidates_reobserved').notNull().default(0),
  selectedRoute: text('selected_route').notNull(),
  rationale: text('rationale'),
  startedAt: timestamp('started_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const hypothesisDiscoveryCandidates = pgTable(
  'hypothesis_discovery_candidates',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    accessScopeId: uuid('access_scope_id')
      .notNull()
      .references(() => accessScopes.id),
    discoveryPolicyId: uuid('discovery_policy_id')
      .notNull()
      .references(() => hypothesisDiscoveryPolicies.id),
    discoveryRunId: uuid('discovery_run_id')
      .notNull()
      .references(() => hypothesisDiscoveryRuns.id),
    statementHash: text('statement_hash').notNull(),
    statement: text('statement').notNull(),
    rationale: text('rationale').notNull(),
    concepts: jsonb('concepts').notNull(),
    evidenceResourceIds: jsonb('evidence_resource_ids').notNull(),
    sourceUris: jsonb('source_uris').notNull(),
    sourceSystems: jsonb('source_systems').notNull(),
    predictions: jsonb('predictions').notNull(),
    falsificationConditions: jsonb('falsification_conditions').notNull(),
    confidence: real('confidence').notNull(),
    noveltyScore: real('novelty_score').notNull(),
    sourceDiversity: integer('source_diversity').notNull(),
    status: text('status').notNull().default('proposed'),
    processName: text('process_name').notNull(),
    processVersion: text('process_version').notNull(),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    promotedResourceId: uuid('promoted_resource_id').references(
      () => resources.id,
    ),
    lastObservedAt: timestamp('last_observed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    missingRunCount: integer('missing_run_count').notNull().default(0),
    ...timestamps,
  },
);

export const hypothesisDiscoveryJobs = pgTable('hypothesis_discovery_jobs', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  accessScopeId: uuid('access_scope_id')
    .notNull()
    .references(() => accessScopes.id),
  discoveryPolicyId: uuid('discovery_policy_id')
    .notNull()
    .references(() => hypothesisDiscoveryPolicies.id),
  sourceChangeEventId: uuid('source_change_event_id').references(
    () => sourceChangeEvents.id,
  ),
  jobKind: text('job_kind').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status').notNull().default('pending'),
  priority: integer('priority').notNull().default(50),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  availableAt: timestamp('available_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  leasedUntil: timestamp('leased_until', { withTimezone: true }),
  workerId: text('worker_id'),
  lastError: text('last_error'),
  payload: jsonb('payload').notNull().default({}),
  ...timestamps,
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const hypothesisDiscoverySchedules = pgTable(
  'hypothesis_discovery_schedules',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    accessScopeId: uuid('access_scope_id')
      .notNull()
      .references(() => accessScopes.id),
    discoveryPolicyId: uuid('discovery_policy_id')
      .notNull()
      .references(() => hypothesisDiscoveryPolicies.id),
    intervalSeconds: integer('interval_seconds').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    nextDueAt: timestamp('next_due_at', { withTimezone: true }).notNull(),
    lastEnqueuedAt: timestamp('last_enqueued_at', { withTimezone: true }),
    ...timestamps,
  },
);

export const hypothesisDiscoveryCandidateObservations = pgTable(
  'hypothesis_discovery_candidate_observations',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    accessScopeId: uuid('access_scope_id')
      .notNull()
      .references(() => accessScopes.id),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => hypothesisDiscoveryCandidates.id),
    discoveryRunId: uuid('discovery_run_id')
      .notNull()
      .references(() => hypothesisDiscoveryRuns.id),
    observationKind: text('observation_kind').notNull(),
    evidenceResourceIds: jsonb('evidence_resource_ids').notNull(),
    sourceSystems: jsonb('source_systems').notNull(),
    confidence: real('confidence').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
