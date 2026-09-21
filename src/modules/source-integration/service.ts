import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getIngestionPool } from '@/src/db/pool';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import { CONTEXT_FOUNDATION_IDS } from '@/src/modules/context-assets/foundation';
import type { SourceVisibility } from '@/src/modules/connectors/types';
import { executeDiscoveryPolicy } from '@/src/modules/discovery/discovery-runner';
import { DISCOVERY_PROCESS } from '@/src/modules/discovery/discovery-demo';
import { recordKnowledgeChangeEvents } from '@/src/modules/events/knowledge-change';
import { perceiveExternalArtifact } from './perception';
import { simulatedExternalSourceAdapters } from './simulated-adapters';
import type {
  ExternalArtifact,
  ObservationLocator,
  SourceIntegrationState,
} from './types';

const perceptionProcess = {
  name: 'deterministic-multimodal-perception',
  version: '1.0.0',
} as const;

export const PERCEPTION_DISCOVERY_POLICY_ID = stableId(
  'hypothesis-discovery-policy',
  `${IDS.resources.project}:Atlas onboarding abandonment:${IDS.scopes.everyone}`,
);

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function scopeFor(visibility: SourceVisibility) {
  if (visibility === 'internal') return IDS.scopes.internal;
  if (visibility === 'alex-only') return IDS.scopes.alexOnly;
  if (visibility === 'jamie-only') return IDS.scopes.jamieOnly;
  return IDS.scopes.everyone;
}

function semanticTypeFor(artifact: ExternalArtifact) {
  if (artifact.modality === 'document') return 'ExternalDocument';
  if (artifact.modality === 'table') return 'ExternalTable';
  if (artifact.modality === 'transcript') return 'ExternalTranscript';
  return 'ExternalImage';
}

function serializeArtifact(artifact: ExternalArtifact) {
  if (artifact.modality === 'document') {
    return artifact.payload.pages
      .map((page) => `Page ${page.page}\n${page.text}`)
      .join('\n\n');
  }
  if (artifact.modality === 'table') {
    return [
      artifact.payload.columns.join(','),
      ...artifact.payload.rows.map((row) => JSON.stringify(row)),
    ].join('\n');
  }
  if (artifact.modality === 'transcript') {
    return artifact.payload.segments
      .map(
        (segment) =>
          `[${segment.startMs}-${segment.endMs}] ${segment.speaker}: ${segment.text}`,
      )
      .join('\n');
  }
  return artifact.payload.regions
    .map(
      (region) =>
        `[${region.id}:${region.x},${region.y},${region.width},${region.height}] ${region.text}`,
    )
    .join('\n');
}

async function ensureRelationship(
  client: PoolClient,
  input: {
    from: string;
    to: string;
    type: string;
    scopeId: string;
    sourceVersionId: string;
    confidence: number;
    excerpt: string;
    assertionKind: 'source-backed' | 'rule-derived';
  },
) {
  const relationshipId = stableId(
    'relationship',
    `${input.from}:${input.type}:${input.to}`,
  );
  const assertionId = stableId(
    'assertion',
    `${input.sourceVersionId}:${relationshipId}:${input.assertionKind}:${perceptionProcess.version}`,
  );
  await client.query(
    `INSERT INTO relationships
      (id, workspace_id, from_resource_id, to_resource_id, relationship_type)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, from_resource_id, to_resource_id, relationship_type)
       DO NOTHING`,
    [relationshipId, IDS.workspace, input.from, input.to, input.type],
  );
  await client.query(
    `INSERT INTO assertions
      (id, workspace_id, access_scope_id, subject_resource_id, predicate,
       object_resource_id, relationship_id, assertion_kind,
       source_object_version_id, process_name, process_version, confidence,
       valid_from)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
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
      perceptionProcess.name,
      perceptionProcess.version,
      input.confidence,
    ],
  );
  await client.query(
    `INSERT INTO provenance_spans
      (id, workspace_id, assertion_id, source_object_version_id,
       start_offset, end_offset, excerpt)
     VALUES ($1, $2, $3, $4, 0, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [
      stableId('provenance-span', `${assertionId}:external-perception`),
      IDS.workspace,
      assertionId,
      input.sourceVersionId,
      input.excerpt.length,
      input.excerpt,
    ],
  );
}

async function ensurePerceptionDiscoveryPolicy(
  client: PoolClient,
  sourceIds: string[],
) {
  const routePolicyId = stableId(
    'model-route-policy',
    PERCEPTION_DISCOVERY_POLICY_ID,
  );
  const scheduleId = stableId(
    'hypothesis-discovery-schedule',
    PERCEPTION_DISCOVERY_POLICY_ID,
  );
  const conceptRules = [
    {
      id: 'onboarding-status-ambiguity',
      label: 'Status ambiguity and reassurance',
      keywords: [
        'uncertain',
        'uncertainty',
        'status',
        'processing',
        'retry',
        'reassurance',
      ],
      hypothesisFragment:
        'status ambiguity and weak reassurance during document checking rather than elapsed verification time alone',
      prediction:
        'Making processing, failure and resolved states visibly distinct should improve self-serve completion.',
      falsificationCondition:
        'A controlled clarity intervention produces no material completion change while the affected cohort and metric definition remain stable.',
    },
  ];
  await client.query(
    `INSERT INTO model_route_policies
      (id, workspace_id, access_scope_id, name, mode, routing_rules,
       budget_limits, allowed_providers, enabled)
     VALUES ($1, $2, $3, 'Atlas perception synthesis routing',
       'deterministic-only', '{}',
       '{"dailyInputTokens":0,"monthlyCostMicros":0,"maximumOutputTokens":0}',
       '[]', true)
     ON CONFLICT (id) DO NOTHING`,
    [routePolicyId, IDS.workspace, IDS.scopes.everyone],
  );
  await client.query(
    `INSERT INTO hypothesis_discovery_policies
      (id, workspace_id, access_scope_id, owner_actor_id, service_actor_id,
       name, subject, project_resource_id, source_ids, concept_rules,
       minimum_source_diversity, status, model_route_policy_id,
       ontology_version_id)
     VALUES ($1, $2, $3, $4, $5, 'Atlas source-perception synthesis',
       'Atlas onboarding abandonment', $6, $7, $8, 2, 'active', $9,
       (SELECT id FROM ontology_versions
        WHERE workspace_id = $2 AND status = 'current'
        ORDER BY created_at DESC LIMIT 1))
     ON CONFLICT (id) DO UPDATE SET
       source_ids = EXCLUDED.source_ids,
       concept_rules = EXCLUDED.concept_rules,
       minimum_source_diversity = EXCLUDED.minimum_source_diversity,
       status = 'active', updated_at = now()`,
    [
      PERCEPTION_DISCOVERY_POLICY_ID,
      IDS.workspace,
      IDS.scopes.everyone,
      IDS.users.alex,
      IDS.users.memoryAgent,
      IDS.resources.project,
      JSON.stringify(sourceIds),
      JSON.stringify(conceptRules),
      routePolicyId,
    ],
  );
  await client.query(
    `INSERT INTO hypothesis_discovery_schedules
      (id, workspace_id, access_scope_id, discovery_policy_id,
       interval_seconds, enabled, next_due_at)
     VALUES ($1, $2, $3, $4, 21600, true, now() + interval '6 hours')
     ON CONFLICT (discovery_policy_id) DO UPDATE SET
       enabled = true, interval_seconds = 21600, updated_at = now()`,
    [
      scheduleId,
      IDS.workspace,
      IDS.scopes.everyone,
      PERCEPTION_DISCOVERY_POLICY_ID,
    ],
  );
  return { routePolicyId, scheduleId };
}

async function persistArtifact(
  client: PoolClient,
  connectionId: string,
  sourceId: string,
  artifact: ExternalArtifact,
  now: Date,
) {
  const accessScopeId = scopeFor(artifact.visibility);
  const contentHash = digest(artifact);
  const sourceObjectId = stableId(
    'external-source-object',
    `${sourceId}:${artifact.externalId}`,
  );
  const sourceVersionId = stableId(
    'external-source-version',
    `${sourceObjectId}:${contentHash}`,
  );
  const artifactResourceId = stableId(
    'external-artifact-resource',
    `${sourceId}:${artifact.externalId}`,
  );
  const contentVersionId = stableId(
    'external-artifact-content-version',
    sourceVersionId,
  );
  const body = serializeArtifact(artifact);

  await client.query(
    `INSERT INTO source_objects
      (id, workspace_id, source_id, access_scope_id, external_id, source_uri,
       source_created_at, source_updated_at, current_content_hash, deleted)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (source_id, external_id) DO UPDATE SET
       access_scope_id = EXCLUDED.access_scope_id,
       source_uri = EXCLUDED.source_uri,
       source_updated_at = EXCLUDED.source_updated_at,
       current_content_hash = EXCLUDED.current_content_hash,
       deleted = EXCLUDED.deleted, updated_at = now()`,
    [
      sourceObjectId,
      IDS.workspace,
      sourceId,
      accessScopeId,
      artifact.externalId,
      artifact.uri,
      artifact.createdAt,
      artifact.updatedAt,
      contentHash,
      artifact.deleted,
    ],
  );
  await client.query(
    `INSERT INTO source_object_versions
      (id, workspace_id, source_object_id, access_scope_id, content_hash,
       raw_payload, source_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (source_object_id, content_hash) DO NOTHING`,
    [
      sourceVersionId,
      IDS.workspace,
      sourceObjectId,
      accessScopeId,
      contentHash,
      artifact,
      artifact.updatedAt,
    ],
  );
  await client.query(
    `INSERT INTO resources
      (id, workspace_id, access_scope_id, resource_kind, semantic_type,
       canonical_name, summary, properties, status)
     VALUES ($1, $2, $3, 'content', $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       access_scope_id = EXCLUDED.access_scope_id,
       semantic_type = EXCLUDED.semantic_type,
       canonical_name = EXCLUDED.canonical_name,
       summary = EXCLUDED.summary,
       properties = EXCLUDED.properties,
       status = EXCLUDED.status, updated_at = now()`,
    [
      artifactResourceId,
      IDS.workspace,
      accessScopeId,
      semanticTypeFor(artifact),
      artifact.title,
      body.slice(0, 500),
      {
        connectionId,
        externalId: artifact.externalId,
        sourceUri: artifact.uri,
        mediaType: artifact.mediaType,
        modality: artifact.modality,
        simulated: true,
      },
      artifact.deleted ? 'retired' : 'active',
    ],
  );
  await client.query(
    `INSERT INTO content_objects (resource_id, content_type, current_version_id)
     VALUES ($1, $2, NULL)
     ON CONFLICT (resource_id) DO UPDATE SET content_type = EXCLUDED.content_type`,
    [artifactResourceId, semanticTypeFor(artifact)],
  );
  await client.query(
    `UPDATE content_versions SET is_current = false
     WHERE content_resource_id = $1 AND id <> $2`,
    [artifactResourceId, contentVersionId],
  );
  await client.query(
    `INSERT INTO content_versions
      (id, workspace_id, content_resource_id, source_object_version_id,
       access_scope_id, body, content_hash, version_number, is_current)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
       COALESCE((SELECT max(version_number) + 1 FROM content_versions
         WHERE content_resource_id = $3), 1), true)
     ON CONFLICT (id) DO UPDATE SET is_current = true`,
    [
      contentVersionId,
      IDS.workspace,
      artifactResourceId,
      sourceVersionId,
      accessScopeId,
      body,
      contentHash,
    ],
  );
  await client.query(
    `UPDATE content_objects SET current_version_id = $2 WHERE resource_id = $1`,
    [artifactResourceId, contentVersionId],
  );
  await ensureRelationship(client, {
    from: artifactResourceId,
    to: IDS.resources.project,
    type: 'BELONGS_TO',
    scopeId: accessScopeId,
    sourceVersionId,
    confidence: 1,
    excerpt: artifact.title,
    assertionKind: 'source-backed',
  });

  if (artifact.deleted) {
    await client.query(
      `UPDATE resources SET status = 'retired', updated_at = $2
       WHERE id IN (
         SELECT observation_resource_id FROM perception_observations
         WHERE artifact_resource_id = $1
       )`,
      [artifactResourceId, now],
    );
  }

  const observations = perceiveExternalArtifact(artifact);
  const runDigest = digest({ contentHash, process: perceptionProcess });
  const runId = stableId(
    'perception-run',
    `${sourceVersionId}:${perceptionProcess.name}:${perceptionProcess.version}:${runDigest}`,
  );
  await client.query(
    `INSERT INTO perception_runs
      (id, workspace_id, connection_id, source_object_version_id,
       artifact_resource_id, access_scope_id, modality, process_name,
       process_version, model_route, status, observation_count, input_digest,
       started_at, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'no-model', $10, $11,
       $12, $13, $13)
     ON CONFLICT (source_object_version_id, process_name, process_version, input_digest)
       DO UPDATE SET status = EXCLUDED.status,
         observation_count = EXCLUDED.observation_count,
         finished_at = EXCLUDED.finished_at`,
    [
      runId,
      IDS.workspace,
      connectionId,
      sourceVersionId,
      artifactResourceId,
      accessScopeId,
      artifact.modality,
      perceptionProcess.name,
      perceptionProcess.version,
      observations.length ? 'completed' : 'no-signal',
      observations.length,
      runDigest,
      now,
    ],
  );

  for (const [index, observation] of observations.entries()) {
    const observationDigest = digest(observation);
    const observationResourceId = stableId(
      'perception-observation-resource',
      `${runId}:${index}:${observationDigest}`,
    );
    await client.query(
      `INSERT INTO resources
        (id, workspace_id, access_scope_id, resource_kind, semantic_type,
         canonical_name, summary, properties, status)
       VALUES ($1, $2, $3, 'entity', 'PerceivedObservation', $4, $5, $6, 'active')
       ON CONFLICT (id) DO UPDATE SET
         access_scope_id = EXCLUDED.access_scope_id,
         canonical_name = EXCLUDED.canonical_name,
         summary = EXCLUDED.summary,
         properties = EXCLUDED.properties,
         status = 'active', updated_at = now()`,
      [
        observationResourceId,
        IDS.workspace,
        accessScopeId,
        `${artifact.title}: ${observation.observationType}`,
        observation.statement,
        {
          locator: observation.locator,
          governedTerms: observation.governedTerms,
          simulated: true,
        },
      ],
    );
    await client.query(
      `INSERT INTO entities (resource_id, normalized_name)
       VALUES ($1, $2)
       ON CONFLICT (resource_id) DO UPDATE SET normalized_name = EXCLUDED.normalized_name`,
      [observationResourceId, normalizeName(observation.statement)],
    );
    await client.query(
      `INSERT INTO perception_observations
        (id, workspace_id, perception_run_id, observation_resource_id,
         artifact_resource_id, access_scope_id, observation_type, statement,
         excerpt, confidence, locator, governed_term_keys, relationship_type,
         process_name, process_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15)
       ON CONFLICT (perception_run_id, observation_resource_id) DO UPDATE SET
         statement = EXCLUDED.statement, excerpt = EXCLUDED.excerpt,
         confidence = EXCLUDED.confidence, locator = EXCLUDED.locator,
         governed_term_keys = EXCLUDED.governed_term_keys,
         relationship_type = EXCLUDED.relationship_type`,
      [
        stableId('perception-observation', observationResourceId),
        IDS.workspace,
        runId,
        observationResourceId,
        artifactResourceId,
        accessScopeId,
        observation.observationType,
        observation.statement,
        observation.excerpt,
        observation.confidence,
        observation.locator,
        JSON.stringify(observation.governedTerms),
        observation.relationship?.predicate ?? null,
        perceptionProcess.name,
        perceptionProcess.version,
      ],
    );
    await ensureRelationship(client, {
      from: observationResourceId,
      to: artifactResourceId,
      type: 'DERIVED_FROM',
      scopeId: accessScopeId,
      sourceVersionId,
      confidence: observation.confidence,
      excerpt: observation.excerpt,
      assertionKind: 'rule-derived',
    });
    if (observation.relationship) {
      await ensureRelationship(client, {
        from: observationResourceId,
        to: CONTEXT_FOUNDATION_IDS.abandonmentTerm,
        type: observation.relationship.predicate,
        scopeId: accessScopeId,
        sourceVersionId,
        confidence: observation.confidence,
        excerpt: observation.excerpt,
        assertionKind: 'rule-derived',
      });
    }
  }
  return {
    observationCount: observations.length,
    sourceObjectVersionId: sourceVersionId,
    artifactResourceId,
    accessScopeId,
    deleted: artifact.deleted,
  };
}

export async function syncSimulatedExternalSources(now = new Date()) {
  const client = await getIngestionPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_id', $1, true)", [
      IDS.users.ingestion,
    ]);
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      IDS.workspace,
    ]);
    const bindingResult = await client.query<{
      id: string;
      external_project_id: string;
      access_scope_id: string;
    }>(
      `SELECT id, external_project_id, access_scope_id
       FROM host_project_bindings WHERE id = $1 AND status = 'active'`,
      [IDS.organisationalMemory.projectBinding],
    );
    const binding = bindingResult.rows[0];
    if (!binding) {
      throw new Error(
        'Initialise the project-memory demo before simulated source integration.',
      );
    }

    let artifactCount = 0;
    let observationCount = 0;
    const adapters = simulatedExternalSourceAdapters();
    const changeBatches: Array<{
      sourceId: string;
      connectorType: string;
      syncRunId: string;
      changes: Array<{
        accessScopeId: string;
        sourceObjectVersionId: string;
        affectedResourceIds: string[];
        changeKind: 'created' | 'deleted';
      }>;
    }> = [];
    const policySourceIds: string[] = [];
    for (const adapter of adapters) {
      const sourceId = stableId('external-source', adapter.descriptor.id);
      if (adapter.descriptor.transport !== 'cli')
        policySourceIds.push(sourceId);
      const existing = await client.query<{ cursor: string | null }>(
        `SELECT cursor FROM external_source_connections WHERE id = $1`,
        [adapter.descriptor.id],
      );
      const cursorBefore = existing.rows[0]?.cursor ?? null;
      const page = await adapter.listProjectChanges(
        binding.external_project_id,
        cursorBefore,
      );
      const receiptDigest = digest({
        connectionId: adapter.descriptor.id,
        cursorBefore,
        cursorAfter: page.nextCursor,
        entitlementRevision: page.entitlementRevision,
        artifacts: page.artifacts.map((artifact) => digest(artifact)),
      });
      const syncRunId = stableId('sync-run', receiptDigest);
      await client.query(
        `INSERT INTO sources
          (id, workspace_id, source_type, name, cursor, status,
           last_successful_sync_at)
         VALUES ($1, $2, $3, $4, $5, 'healthy', $6)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
           cursor = EXCLUDED.cursor, status = 'healthy',
           last_successful_sync_at = EXCLUDED.last_successful_sync_at,
           updated_at = now()`,
        [
          sourceId,
          IDS.workspace,
          `simulated-${adapter.descriptor.transport}`,
          adapter.descriptor.name,
          page.nextCursor,
          now,
        ],
      );
      await client.query(
        `INSERT INTO sync_runs
          (id, workspace_id, source_id, status, cursor_before, cursor_after,
           objects_seen, objects_changed, started_at, finished_at)
         VALUES ($1, $2, $3, 'running', $4, NULL, $5, 0, $6, NULL)
         ON CONFLICT (id) DO NOTHING`,
        [
          syncRunId,
          IDS.workspace,
          sourceId,
          cursorBefore,
          page.artifacts.length,
          now,
        ],
      );
      await client.query(
        `INSERT INTO external_source_connections
          (id, workspace_id, project_binding_id, source_id, access_scope_id,
           provider, name, transport, strategy, endpoint_label,
           entitlement_revision, freshness_sla_seconds, deletion_mode,
           capabilities, status, cursor, last_successful_sync_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
           $14, 'active', $15, $16)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, strategy = EXCLUDED.strategy,
           endpoint_label = EXCLUDED.endpoint_label,
           entitlement_revision = EXCLUDED.entitlement_revision,
           freshness_sla_seconds = EXCLUDED.freshness_sla_seconds,
           deletion_mode = EXCLUDED.deletion_mode,
           capabilities = EXCLUDED.capabilities, status = 'active',
           cursor = EXCLUDED.cursor,
           last_successful_sync_at = EXCLUDED.last_successful_sync_at,
           updated_at = now()`,
        [
          adapter.descriptor.id,
          IDS.workspace,
          binding.id,
          sourceId,
          binding.access_scope_id,
          adapter.descriptor.provider,
          adapter.descriptor.name,
          adapter.descriptor.transport,
          adapter.descriptor.strategy,
          adapter.descriptor.endpointLabel,
          page.entitlementRevision,
          adapter.descriptor.freshnessSlaSeconds,
          adapter.descriptor.deletionMode,
          JSON.stringify(adapter.descriptor.capabilities),
          page.nextCursor,
          now,
        ],
      );
      const changes: (typeof changeBatches)[number]['changes'] = [];
      for (const artifact of page.artifacts) {
        artifactCount += 1;
        const persisted = await persistArtifact(
          client,
          adapter.descriptor.id,
          sourceId,
          artifact,
          now,
        );
        observationCount += persisted.observationCount;
        changes.push({
          accessScopeId: persisted.accessScopeId,
          sourceObjectVersionId: persisted.sourceObjectVersionId,
          affectedResourceIds: [
            persisted.artifactResourceId,
            IDS.resources.project,
          ],
          changeKind: persisted.deleted ? 'deleted' : 'created',
        });
      }
      await client.query(
        `UPDATE sync_runs SET status = 'success', cursor_after = $2,
           objects_changed = $3, finished_at = $4 WHERE id = $1`,
        [syncRunId, page.nextCursor, page.artifacts.length, now],
      );
      await client.query(
        `INSERT INTO external_source_sync_receipts
          (id, workspace_id, connection_id, access_scope_id, operation_kind,
           cursor_before, cursor_after, entitlement_revision, simulated,
           command_summary, response_shape, artifact_count, status,
           input_digest, started_at, finished_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $11,
           'completed', $12, $13, $13)
         ON CONFLICT (connection_id, input_digest) DO UPDATE SET
           finished_at = EXCLUDED.finished_at,
           response_shape = EXCLUDED.response_shape`,
        [
          stableId('external-sync-receipt', receiptDigest),
          IDS.workspace,
          adapter.descriptor.id,
          binding.access_scope_id,
          adapter.descriptor.strategy === 'authoritative-snapshot'
            ? 'snapshot'
            : adapter.descriptor.strategy === 'federated-query'
              ? 'federated-query'
              : 'incremental-sync',
          cursorBefore,
          page.nextCursor,
          page.entitlementRevision,
          page.simulatedOperation.command,
          page.simulatedOperation.responseShape,
          page.artifacts.length,
          receiptDigest,
          now,
        ],
      );
      changeBatches.push({
        sourceId,
        connectorType: `simulated-${adapter.descriptor.transport}`,
        syncRunId,
        changes,
      });
    }
    await ensurePerceptionDiscoveryPolicy(client, policySourceIds);
    const synthesisInput = await client.query<{ content_hash: string }>(
      `SELECT version.content_hash
       FROM content_versions version
       JOIN source_object_versions source_version
         ON source_version.id = version.source_object_version_id
       JOIN source_objects source_object
         ON source_object.id = source_version.source_object_id
       WHERE source_object.source_id = ANY($1::uuid[])
         AND version.access_scope_id = $2 AND version.is_current
         AND source_object.deleted = false
       ORDER BY version.content_hash`,
      [policySourceIds, IDS.scopes.everyone],
    );
    const synthesisDigest = digest(
      synthesisInput.rows.map((row) => row.content_hash),
    );
    const synthesis = await executeDiscoveryPolicy(client, {
      policyId: PERCEPTION_DISCOVERY_POLICY_ID,
      triggerRef: `perception-sync:${DISCOVERY_PROCESS.version}:${synthesisDigest}`,
    });
    for (const batch of changeBatches) {
      if (batch.changes.length)
        await recordKnowledgeChangeEvents(client, batch);
    }
    await client.query('COMMIT');
    return {
      simulated: true as const,
      connections: 3,
      artifacts: artifactCount,
      observations: observationCount,
      hypothesesFormed: synthesis.candidatesFormed,
      externalCallsMade: 0 as const,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function iso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export async function readSourceIntegrationState(
  client: PoolClient,
  now = new Date(),
): Promise<SourceIntegrationState> {
  const projectResult = await client.query<{ id: string; name: string }>(
    `SELECT project.id, project.canonical_name AS name
     FROM host_project_bindings binding
     JOIN resources project ON project.id = binding.project_resource_id
     WHERE binding.id = $1 AND binding.status = 'active'`,
    [IDS.organisationalMemory.projectBinding],
  );
  const project = projectResult.rows[0];
  if (!project) {
    return {
      configured: false,
      simulated: true,
      project: { id: IDS.resources.project, name: 'Atlas Onboarding' },
      connections: [],
      artifacts: [],
      summary: {
        connectionCount: 0,
        artifactCount: 0,
        observationCount: 0,
        modalities: 0,
        externalCallsMade: 0,
      },
    };
  }
  const connectionResult = await client.query<{
    id: string;
    name: string;
    provider: string;
    transport: SourceIntegrationState['connections'][number]['transport'];
    strategy: SourceIntegrationState['connections'][number]['strategy'];
    entitlement_revision: string;
    deletion_mode: SourceIntegrationState['connections'][number]['deletionMode'];
    freshness_sla_seconds: number;
    last_successful_sync_at: Date | string | null;
  }>(
    `SELECT id, name, provider, transport, strategy, entitlement_revision,
       deletion_mode, freshness_sla_seconds, last_successful_sync_at
     FROM external_source_connections
     WHERE project_binding_id = $1 AND status = 'active'
     ORDER BY CASE transport WHEN 'api' THEN 1 WHEN 'cli' THEN 2 ELSE 3 END`,
    [IDS.organisationalMemory.projectBinding],
  );
  const artifactResult = await client.query<{
    id: string;
    connection_id: string;
    source_object_version_id: string;
    title: string;
    modality: SourceIntegrationState['artifacts'][number]['modality'];
    media_type: string;
    updated_at: Date | string;
  }>(
    `SELECT DISTINCT artifact.id, run.connection_id, run.source_object_version_id,
       artifact.canonical_name AS title,
       run.modality, artifact.properties->>'mediaType' AS media_type,
       source_version.source_updated_at AS updated_at
     FROM perception_runs run
     JOIN resources artifact ON artifact.id = run.artifact_resource_id
     JOIN source_object_versions source_version
       ON source_version.id = run.source_object_version_id
     WHERE artifact.status = 'active'
     ORDER BY source_version.source_updated_at DESC, artifact.canonical_name`,
  );
  const observationResult = await client.query<{
    id: string;
    artifact_resource_id: string;
    observation_type: SourceIntegrationState['artifacts'][number]['observations'][number]['type'];
    statement: string;
    confidence: number;
    locator: ObservationLocator;
    process_name: string;
    process_version: string;
  }>(
    `SELECT observation_resource_id AS id, artifact_resource_id,
       observation_type, statement, confidence, locator, process_name,
       process_version
     FROM perception_observations
     ORDER BY created_at, observation_resource_id`,
  );
  const observationAssertionResult = observationResult.rows.length
    ? await client.query<{
        id: string;
        observation_resource_id: string;
        relationship_id: string;
        predicate: 'DERIVED_FROM' | 'INDICATES' | 'CHALLENGES' | 'MEASURES';
        object_resource_id: string;
        object_name: string;
        object_type: string;
        assertion_kind: 'source-backed' | 'rule-derived' | 'AI-inferred';
        confidence: number;
      }>(
        `SELECT assertion_row.id,
           assertion_row.subject_resource_id AS observation_resource_id,
           assertion_row.relationship_id, assertion_row.predicate,
           assertion_row.object_resource_id,
           object_resource.canonical_name AS object_name,
           object_resource.semantic_type AS object_type,
           assertion_row.assertion_kind, assertion_row.confidence
         FROM assertions assertion_row
         JOIN resources object_resource
           ON object_resource.id = assertion_row.object_resource_id
         WHERE assertion_row.subject_resource_id = ANY($1::uuid[])
           AND assertion_row.valid_to IS NULL
         ORDER BY assertion_row.subject_resource_id, assertion_row.predicate,
           assertion_row.id`,
        [observationResult.rows.map((item) => item.id)],
      )
    : { rows: [] };
  const [
    synthesisPolicyResult,
    synthesisCandidateResult,
    synthesisJobsResult,
    synthesisEvidenceLinkResult,
  ] = await Promise.all([
    client.query<{
      id: string;
      enabled: boolean;
      next_due_at: Date | string | null;
    }>(
      `SELECT policy.id, COALESCE(schedule.enabled, false) AS enabled,
           schedule.next_due_at
         FROM hypothesis_discovery_policies policy
         LEFT JOIN hypothesis_discovery_schedules schedule
           ON schedule.discovery_policy_id = policy.id
         WHERE policy.id = $1`,
      [PERCEPTION_DISCOVERY_POLICY_ID],
    ),
    client.query<{
      id: string;
      status: 'proposed' | 'accepted' | 'dismissed' | 'superseded';
      statement: string;
      rationale: string;
      confidence: number;
      source_diversity: number;
      evidence_resource_ids: string[];
      predictions: string[];
      falsification_conditions: string[];
      process_name: string;
      process_version: string;
      last_observed_at: Date | string;
    }>(
      `SELECT id, status, statement, rationale, confidence, source_diversity,
           evidence_resource_ids, predictions, falsification_conditions,
           process_name, process_version, last_observed_at
         FROM hypothesis_discovery_candidates
         WHERE discovery_policy_id = $1
         ORDER BY last_observed_at DESC, updated_at DESC LIMIT 1`,
      [PERCEPTION_DISCOVERY_POLICY_ID],
    ),
    client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM hypothesis_discovery_jobs
         WHERE discovery_policy_id = $1
           AND status IN ('pending', 'retrying', 'leased')`,
      [PERCEPTION_DISCOVERY_POLICY_ID],
    ),
    client.query<{
      id: string;
      evidence_role: 'supports' | 'challenges';
      rationale: string;
      evidence_resource_id: string;
      artifact_title: string;
      observation_resource_id: string;
      observation_statement: string;
      locator: ObservationLocator;
      assertion_id: string;
      predicate: string;
      object_resource_id: string;
      object_name: string;
    }>(
      `SELECT evidence_link.id, evidence_link.evidence_role,
           evidence_link.rationale, evidence_link.evidence_resource_id,
           artifact.canonical_name AS artifact_title,
           evidence_link.observation_resource_id,
           observation.statement AS observation_statement,
           observation.locator, evidence_link.assertion_id,
           assertion_row.predicate, assertion_row.object_resource_id,
           object_resource.canonical_name AS object_name
         FROM hypothesis_discovery_evidence_links evidence_link
         JOIN hypothesis_discovery_candidates candidate
           ON candidate.id = evidence_link.candidate_id
         JOIN resources artifact
           ON artifact.id = evidence_link.evidence_resource_id
         JOIN perception_observations observation
           ON observation.observation_resource_id = evidence_link.observation_resource_id
         JOIN assertions assertion_row ON assertion_row.id = evidence_link.assertion_id
         JOIN resources object_resource
           ON object_resource.id = assertion_row.object_resource_id
         WHERE candidate.discovery_policy_id = $1
           AND candidate.id = (
             SELECT latest_candidate.id
             FROM hypothesis_discovery_candidates latest_candidate
             WHERE latest_candidate.discovery_policy_id = $1
             ORDER BY latest_candidate.last_observed_at DESC,
               latest_candidate.updated_at DESC
             LIMIT 1
           )
         ORDER BY evidence_link.evidence_role, artifact.canonical_name,
           evidence_link.observation_resource_id`,
      [PERCEPTION_DISCOVERY_POLICY_ID],
    ),
  ]);
  const observationsByArtifact = new Map<
    string,
    typeof observationResult.rows
  >();
  for (const observation of observationResult.rows) {
    const group =
      observationsByArtifact.get(observation.artifact_resource_id) ?? [];
    group.push(observation);
    observationsByArtifact.set(observation.artifact_resource_id, group);
  }
  const assertionsByObservation = new Map<
    string,
    typeof observationAssertionResult.rows
  >();
  for (const assertion of observationAssertionResult.rows) {
    const group =
      assertionsByObservation.get(assertion.observation_resource_id) ?? [];
    group.push(assertion);
    assertionsByObservation.set(assertion.observation_resource_id, group);
  }
  const artifacts = artifactResult.rows.map((artifact) => {
    const observations = observationsByArtifact.get(artifact.id) ?? [];
    return {
      id: artifact.id,
      connectionId: artifact.connection_id,
      sourceObjectVersionId: artifact.source_object_version_id,
      title: artifact.title,
      modality: artifact.modality,
      mediaType: artifact.media_type,
      updatedAt: iso(artifact.updated_at) ?? now.toISOString(),
      observationCount: observations.length,
      observations: observations.map((observation) => ({
        id: observation.id,
        type: observation.observation_type,
        statement: observation.statement,
        confidence: observation.confidence,
        locator: observation.locator,
        process: `${observation.process_name}@${observation.process_version}`,
        assertions: (assertionsByObservation.get(observation.id) ?? []).map(
          (assertion) => ({
            id: assertion.id,
            relationshipId: assertion.relationship_id,
            predicate: assertion.predicate,
            objectResourceId: assertion.object_resource_id,
            objectName: assertion.object_name,
            objectType: assertion.object_type,
            assertionKind: assertion.assertion_kind,
            confidence: assertion.confidence,
          }),
        ),
      })),
    };
  });
  const synthesisPolicy = synthesisPolicyResult.rows[0];
  const synthesisCandidate = synthesisCandidateResult.rows[0];
  return {
    configured: connectionResult.rows.length > 0,
    simulated: true,
    project,
    connections: connectionResult.rows.map((connection) => {
      const lastSync = iso(connection.last_successful_sync_at);
      const freshness =
        lastSync &&
        now.getTime() - new Date(lastSync).getTime() <=
          connection.freshness_sla_seconds * 1_000
          ? 'current'
          : 'stale';
      return {
        id: connection.id,
        name: connection.name,
        provider: connection.provider,
        transport: connection.transport,
        strategy: connection.strategy,
        freshness,
        entitlementRevision: connection.entitlement_revision,
        deletionMode: connection.deletion_mode,
        lastSuccessfulSyncAt: lastSync,
      };
    }),
    artifacts,
    summary: {
      connectionCount: connectionResult.rows.length,
      artifactCount: artifacts.length,
      observationCount: artifacts.reduce(
        (total, artifact) => total + artifact.observationCount,
        0,
      ),
      modalities: new Set(artifacts.map((artifact) => artifact.modality)).size,
      externalCallsMade: 0,
    },
    ...(synthesisPolicy
      ? {
          compounding: {
            policyId: synthesisPolicy.id,
            schedule: synthesisPolicy.enabled
              ? ('active' as const)
              : ('paused' as const),
            nextEvaluationAt: iso(synthesisPolicy.next_due_at),
            pendingJobs: Number(synthesisJobsResult.rows[0]?.count ?? 0),
            hypothesis: synthesisCandidate
              ? {
                  id: synthesisCandidate.id,
                  status: synthesisCandidate.status,
                  statement: synthesisCandidate.statement,
                  rationale: synthesisCandidate.rationale,
                  confidence: synthesisCandidate.confidence,
                  sourceDiversity: synthesisCandidate.source_diversity,
                  evidenceCount:
                    synthesisCandidate.evidence_resource_ids.length,
                  evidenceResourceIds: synthesisCandidate.evidence_resource_ids,
                  evidence: synthesisCandidate.evidence_resource_ids.flatMap(
                    (evidenceResourceId) => {
                      const evidenceArtifact = artifacts.find(
                        (artifact) => artifact.id === evidenceResourceId,
                      );
                      return evidenceArtifact
                        ? [
                            {
                              artifactId: evidenceArtifact.id,
                              sourceObjectVersionId:
                                evidenceArtifact.sourceObjectVersionId,
                              connectionId: evidenceArtifact.connectionId,
                              artifactTitle: evidenceArtifact.title,
                              modality: evidenceArtifact.modality,
                              observationIds: evidenceArtifact.observations.map(
                                (observation) => observation.id,
                              ),
                            },
                          ]
                        : [];
                    },
                  ),
                  observationEvidence: synthesisEvidenceLinkResult.rows.map(
                    (link) => ({
                      id: link.id,
                      role: link.evidence_role,
                      rationale: link.rationale,
                      artifactId: link.evidence_resource_id,
                      artifactTitle: link.artifact_title,
                      observationId: link.observation_resource_id,
                      observationStatement: link.observation_statement,
                      locator: link.locator,
                      assertionId: link.assertion_id,
                      predicate: link.predicate,
                      objectResourceId: link.object_resource_id,
                      objectName: link.object_name,
                    }),
                  ),
                  predictions: synthesisCandidate.predictions,
                  falsificationConditions:
                    synthesisCandidate.falsification_conditions,
                  process: `${synthesisCandidate.process_name}@${synthesisCandidate.process_version}`,
                  lastObservedAt:
                    iso(synthesisCandidate.last_observed_at) ??
                    now.toISOString(),
                }
              : null,
          },
        }
      : {}),
  };
}
