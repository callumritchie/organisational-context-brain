import { performance } from 'node:perf_hooks';
import type { PoolClient } from 'pg';
import { withActorTransaction } from '@/src/db/actor-transaction';
import { stableId } from '@/src/modules/canonical/stable-id';
import { chunkText } from '@/src/modules/search/chunking';
import type {
  BenchmarkQuestion,
  BenchmarkRecord,
  BenchmarkVisibility,
  ScaleCorpus,
} from './scale-corpus';
import { BENCHMARK_SOURCE_SYSTEMS } from './scale-corpus';

export const SCALE_BENCHMARK_IDS = {
  workspace: stableId('benchmark-workspace', 'scale-v1'),
  users: {
    alex: stableId('benchmark-user', 'alex'),
    jamie: stableId('benchmark-user', 'jamie'),
    morgan: stableId('benchmark-user', 'morgan'),
    ingestion: stableId('benchmark-user', 'ingestion'),
  },
  group: stableId('benchmark-group', 'internal'),
  scopes: {
    everyone: stableId('benchmark-scope', 'everyone'),
    internal: stableId('benchmark-scope', 'internal'),
    'alex-only': stableId('benchmark-scope', 'alex-only'),
    'jamie-only': stableId('benchmark-scope', 'jamie-only'),
  },
} as const;

const BATCH_SIZE = 500;

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function scopeId(visibility: BenchmarkVisibility) {
  return SCALE_BENCHMARK_IDS.scopes[visibility];
}

function sourceId(sourceSystem: string) {
  return stableId('benchmark-source', sourceSystem);
}

function contentResourceId(record: BenchmarkRecord) {
  return stableId('benchmark-content-resource', record.id);
}

function evidenceResourceId(record: BenchmarkRecord) {
  return stableId('benchmark-evidence-resource', record.id);
}

function hypothesisResourceId(projectId: string) {
  return stableId('benchmark-hypothesis-resource', projectId);
}

function sourceObjectId(record: BenchmarkRecord) {
  return stableId('benchmark-source-object', record.id);
}

function sourceVersionId(record: BenchmarkRecord, version: number) {
  return stableId('benchmark-source-version', `${record.id}:${version}`);
}

function contentVersionId(record: BenchmarkRecord, version: number) {
  return stableId('benchmark-content-version', `${record.id}:${version}`);
}

async function insertBatches<T>(
  client: PoolClient,
  rows: T[],
  statement: string,
) {
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    await client.query(statement, [
      JSON.stringify(rows.slice(offset, offset + BATCH_SIZE)),
    ]);
  }
}

export async function resetScaleBenchmarkWorkspace(client: PoolClient) {
  const workspaceId = SCALE_BENCHMARK_IDS.workspace;
  await client.query('BEGIN');
  try {
    await client.query(
      `UPDATE content_objects SET current_version_id = NULL
       WHERE resource_id IN (SELECT id FROM resources WHERE workspace_id = $1)`,
      [workspaceId],
    );
    for (const table of [
      'trace_stages',
      'query_traces',
      'search_embeddings',
      'signal_snapshots',
      'signal_observations',
      'search_documents',
      'provenance_spans',
      'assertions',
      'relationships',
      'identity_resolution_candidates',
      'resource_identity_keys',
      'ontology_versions',
      'entity_aliases',
      'content_versions',
      'source_object_versions',
      'source_objects',
      'sync_runs',
      'sources',
    ]) {
      await client.query(`DELETE FROM ${table} WHERE workspace_id = $1`, [
        workspaceId,
      ]);
    }
    await client.query(
      `DELETE FROM content_objects WHERE resource_id IN (SELECT id FROM resources WHERE workspace_id = $1)`,
      [workspaceId],
    );
    await client.query(
      `DELETE FROM entities WHERE resource_id IN (SELECT id FROM resources WHERE workspace_id = $1)`,
      [workspaceId],
    );
    await client.query('DELETE FROM resources WHERE workspace_id = $1', [
      workspaceId,
    ]);
    await client.query(
      `DELETE FROM access_scope_grants
       WHERE access_scope_id IN (SELECT id FROM access_scopes WHERE workspace_id = $1)`,
      [workspaceId],
    );
    await client.query(
      `DELETE FROM group_memberships
       WHERE group_id IN (SELECT id FROM groups WHERE workspace_id = $1)`,
      [workspaceId],
    );
    await client.query('DELETE FROM access_scopes WHERE workspace_id = $1', [
      workspaceId,
    ]);
    await client.query('DELETE FROM groups WHERE workspace_id = $1', [
      workspaceId,
    ]);
    await client.query('DELETE FROM users WHERE workspace_id = $1', [
      workspaceId,
    ]);
    await client.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);

    await client.query('INSERT INTO workspaces (id, name) VALUES ($1, $2)', [
      workspaceId,
      'Scale Benchmark',
    ]);
    await client.query(
      `INSERT INTO users (id, workspace_id, name, role_label) VALUES
       ($1, $5, 'Alex Benchmark', 'Project Lead'),
       ($2, $5, 'Jamie Benchmark', 'Consultant'),
       ($3, $5, 'Morgan Benchmark', 'External Contractor'),
       ($4, $5, 'Benchmark Ingestion', 'System')`,
      [
        SCALE_BENCHMARK_IDS.users.alex,
        SCALE_BENCHMARK_IDS.users.jamie,
        SCALE_BENCHMARK_IDS.users.morgan,
        SCALE_BENCHMARK_IDS.users.ingestion,
        workspaceId,
      ],
    );
    await client.query(
      'INSERT INTO groups (id, workspace_id, name) VALUES ($1, $2, $3)',
      [SCALE_BENCHMARK_IDS.group, workspaceId, 'Benchmark internal team'],
    );
    await client.query(
      'INSERT INTO group_memberships (group_id, user_id) VALUES ($1, $2), ($1, $3)',
      [
        SCALE_BENCHMARK_IDS.group,
        SCALE_BENCHMARK_IDS.users.alex,
        SCALE_BENCHMARK_IDS.users.jamie,
      ],
    );
    await client.query(
      `INSERT INTO access_scopes (id, workspace_id, name) VALUES
       ($1, $5, 'Everyone'), ($2, $5, 'Internal'), ($3, $5, 'Alex only'), ($4, $5, 'Jamie only')`,
      [
        SCALE_BENCHMARK_IDS.scopes.everyone,
        SCALE_BENCHMARK_IDS.scopes.internal,
        SCALE_BENCHMARK_IDS.scopes['alex-only'],
        SCALE_BENCHMARK_IDS.scopes['jamie-only'],
        workspaceId,
      ],
    );
    const grants = [
      {
        id: stableId('benchmark-grant', 'everyone'),
        scope: SCALE_BENCHMARK_IDS.scopes.everyone,
        type: 'everyone',
        principal: null,
        permission: 'read',
      },
      {
        id: stableId('benchmark-grant', 'internal'),
        scope: SCALE_BENCHMARK_IDS.scopes.internal,
        type: 'group',
        principal: SCALE_BENCHMARK_IDS.group,
        permission: 'read',
      },
      {
        id: stableId('benchmark-grant', 'alex'),
        scope: SCALE_BENCHMARK_IDS.scopes['alex-only'],
        type: 'user',
        principal: SCALE_BENCHMARK_IDS.users.alex,
        permission: 'read',
      },
      {
        id: stableId('benchmark-grant', 'jamie'),
        scope: SCALE_BENCHMARK_IDS.scopes['jamie-only'],
        type: 'user',
        principal: SCALE_BENCHMARK_IDS.users.jamie,
        permission: 'read',
      },
      ...Object.entries(SCALE_BENCHMARK_IDS.scopes).map(([name, scope]) => ({
        id: stableId('benchmark-grant', `ingestion:${name}`),
        scope,
        type: 'user',
        principal: SCALE_BENCHMARK_IDS.users.ingestion,
        permission: 'manage',
      })),
    ];
    await client.query(
      `INSERT INTO access_scope_grants (id, access_scope_id, principal_type, principal_id, permission)
       SELECT id, scope, type, principal, permission
       FROM jsonb_to_recordset($1::jsonb) AS row(id uuid, scope uuid, type text, principal uuid, permission text)`,
      [JSON.stringify(grants)],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function ingestScaleCorpus(
  client: PoolClient,
  corpus: ScaleCorpus,
) {
  const startedAt = performance.now();
  const workspaceId = SCALE_BENCHMARK_IDS.workspace;
  await client.query('BEGIN');
  try {
    await client.query("SELECT set_config('app.actor_id', $1, true)", [
      SCALE_BENCHMARK_IDS.users.ingestion,
    ]);
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      workspaceId,
    ]);

    const sources = BENCHMARK_SOURCE_SYSTEMS.map((system) => ({
      id: sourceId(system),
      workspaceId,
      sourceType: system,
      name: `Benchmark ${system}`,
      cursor: `benchmark-${corpus.seed}`,
    }));
    await client.query(
      `INSERT INTO sources (id, workspace_id, source_type, name, cursor, status, last_successful_sync_at)
       SELECT id, "workspaceId", "sourceType", name, cursor, 'healthy', now()
       FROM jsonb_to_recordset($1::jsonb)
       AS row(id uuid, "workspaceId" uuid, "sourceType" text, name text, cursor text)`,
      [JSON.stringify(sources)],
    );

    const clientMap = new Map(
      corpus.records.map((record) => [
        record.canonicalClientId,
        record.canonicalClientName,
      ]),
    );
    const projectMap = new Map(
      corpus.records.map((record) => [
        record.canonicalProjectId,
        {
          name: record.canonicalProjectName,
          clientId: record.canonicalClientId,
        },
      ]),
    );
    const entityResources = [
      ...[...clientMap].map(([id, name]) => ({
        id,
        workspaceId,
        scopeId: SCALE_BENCHMARK_IDS.scopes.everyone,
        type: 'Client',
        name,
        summary: `Synthetic benchmark client ${name}.`,
        properties: {},
      })),
      ...[...projectMap].map(([id, project]) => ({
        id,
        workspaceId,
        scopeId: SCALE_BENCHMARK_IDS.scopes.everyone,
        type: 'Project',
        name: project.name,
        summary: `Synthetic benchmark project ${project.name}.`,
        properties: { clientId: project.clientId },
      })),
      ...[...projectMap].map(([id, project]) => ({
        id: hypothesisResourceId(id),
        workspaceId,
        scopeId: SCALE_BENCHMARK_IDS.scopes.everyone,
        type: 'Hypothesis',
        name: `Completion barriers for ${project.name}`,
        summary: `Which issues prevent completion of ${project.name}?`,
        properties: { projectId: id },
      })),
      ...corpus.records.map((record) => ({
        id: evidenceResourceId(record),
        workspaceId,
        scopeId: scopeId(record.visibility),
        type: 'Evidence',
        name: record.versions.at(-1)!.title,
        summary: record.versions.at(-1)!.body,
        properties: { benchmarkRecordId: record.id, deleted: record.deleted },
        status: record.deleted ? 'deleted' : 'active',
      })),
    ];
    const contentResources = corpus.records.map((record) => ({
      id: contentResourceId(record),
      workspaceId,
      scopeId: scopeId(record.visibility),
      type: 'Document',
      name: record.versions.at(-1)!.title,
      summary: record.versions.at(-1)!.body,
      properties: {
        benchmarkRecordId: record.id,
        sourceSystem: record.sourceSystem,
      },
      status: record.deleted ? 'deleted' : 'active',
    }));
    await insertBatches(
      client,
      [...entityResources, ...contentResources],
      `INSERT INTO resources (id, workspace_id, access_scope_id, resource_kind, semantic_type, canonical_name, summary, properties, status)
       SELECT id, "workspaceId", "scopeId", CASE WHEN type = 'Document' THEN 'content' ELSE 'entity' END,
         type, name, summary, properties, COALESCE(status, 'active')
       FROM jsonb_to_recordset($1::jsonb)
       AS row(id uuid, "workspaceId" uuid, "scopeId" uuid, type text, name text, summary text, properties jsonb, status text)`,
    );
    await insertBatches(
      client,
      entityResources.map((resource) => ({
        id: resource.id,
        normalized: normalize(resource.name),
      })),
      `INSERT INTO entities (resource_id, normalized_name)
       SELECT id, normalized FROM jsonb_to_recordset($1::jsonb) AS row(id uuid, normalized text)`,
    );
    await insertBatches(
      client,
      contentResources.map((resource) => ({ id: resource.id })),
      `INSERT INTO content_objects (resource_id, content_type)
       SELECT id, 'Document' FROM jsonb_to_recordset($1::jsonb) AS row(id uuid)`,
    );

    await insertBatches(
      client,
      [...clientMap].map(([id, name]) => ({
        id: stableId('benchmark-alias', id),
        workspaceId,
        resourceId: id,
        alias: name,
        normalized: normalize(name),
        sourceSystem: 'canonical-benchmark',
      })),
      `INSERT INTO entity_aliases (id, workspace_id, resource_id, alias, normalized_alias, alias_type, source_system)
     SELECT id, "workspaceId", "resourceId", alias, normalized, 'name', "sourceSystem"
     FROM jsonb_to_recordset($1::jsonb)
     AS row(id uuid, "workspaceId" uuid, "resourceId" uuid, alias text, normalized text, "sourceSystem" text)`,
    );

    const sourceObjects = corpus.records.map((record) => {
      const latest = record.versions.at(-1)!;
      return {
        id: sourceObjectId(record),
        workspaceId,
        sourceId: sourceId(record.sourceSystem),
        scopeId: scopeId(record.visibility),
        externalId: record.externalId,
        uri: record.sourceUri,
        createdAt: record.versions[0]!.updatedAt,
        updatedAt: latest.updatedAt,
        hash: latest.contentHashKey,
        deleted: record.deleted,
      };
    });
    await insertBatches(
      client,
      sourceObjects,
      `INSERT INTO source_objects (id, workspace_id, source_id, access_scope_id, external_id, source_uri,
         source_created_at, source_updated_at, current_content_hash, deleted)
       SELECT id, "workspaceId", "sourceId", "scopeId", "externalId", uri, "createdAt", "updatedAt", hash, deleted
       FROM jsonb_to_recordset($1::jsonb)
       AS row(id uuid, "workspaceId" uuid, "sourceId" uuid, "scopeId" uuid, "externalId" text, uri text,
         "createdAt" timestamptz, "updatedAt" timestamptz, hash text, deleted boolean)`,
    );

    const sourceVersions = corpus.records.flatMap((record) =>
      record.versions.map((version) => ({
        id: sourceVersionId(record, version.version),
        workspaceId,
        sourceObjectId: sourceObjectId(record),
        scopeId: scopeId(record.visibility),
        hash: version.contentHashKey,
        payload: {
          ...version,
          sourceSystem: record.sourceSystem,
          externalId: record.externalId,
        },
        updatedAt: version.updatedAt,
      })),
    );
    await insertBatches(
      client,
      sourceVersions,
      `INSERT INTO source_object_versions (id, workspace_id, source_object_id, access_scope_id, content_hash, raw_payload, source_updated_at)
       SELECT id, "workspaceId", "sourceObjectId", "scopeId", hash, payload, "updatedAt"
       FROM jsonb_to_recordset($1::jsonb)
       AS row(id uuid, "workspaceId" uuid, "sourceObjectId" uuid, "scopeId" uuid, hash text, payload jsonb, "updatedAt" timestamptz)`,
    );

    const contentVersions = corpus.records.flatMap((record) =>
      record.versions.map((version) => ({
        id: contentVersionId(record, version.version),
        workspaceId,
        contentId: contentResourceId(record),
        sourceVersionId: sourceVersionId(record, version.version),
        scopeId: scopeId(record.visibility),
        body: version.body,
        hash: version.contentHashKey,
        version: version.version,
        current: version.version === record.versions.length,
      })),
    );
    await insertBatches(
      client,
      contentVersions,
      `INSERT INTO content_versions (id, workspace_id, content_resource_id, source_object_version_id,
         access_scope_id, body, content_hash, version_number, is_current)
       SELECT id, "workspaceId", "contentId", "sourceVersionId", "scopeId", body, hash, version, current
       FROM jsonb_to_recordset($1::jsonb)
       AS row(id uuid, "workspaceId" uuid, "contentId" uuid, "sourceVersionId" uuid, "scopeId" uuid,
         body text, hash text, version integer, current boolean)`,
    );
    await insertBatches(
      client,
      corpus.records.map((record) => ({
        resourceId: contentResourceId(record),
        versionId: contentVersionId(record, record.versions.length),
      })),
      `UPDATE content_objects target SET current_version_id = row."versionId"
     FROM jsonb_to_recordset($1::jsonb) AS row("resourceId" uuid, "versionId" uuid)
     WHERE target.resource_id = row."resourceId"`,
    );

    const relationships = corpus.records.map((record) => {
      const evidenceId = evidenceResourceId(record);
      const hypothesisId = hypothesisResourceId(record.canonicalProjectId);
      const stance = record.versions.at(-1)!.stance;
      return {
        id: stableId(
          'benchmark-relationship',
          `${evidenceId}:${stance}:${hypothesisId}`,
        ),
        workspaceId,
        fromId: evidenceId,
        toId: hypothesisId,
        type: stance,
      };
    });
    await insertBatches(
      client,
      relationships,
      `INSERT INTO relationships (id, workspace_id, from_resource_id, to_resource_id, relationship_type)
       SELECT id, "workspaceId", "fromId", "toId", type
       FROM jsonb_to_recordset($1::jsonb)
       AS row(id uuid, "workspaceId" uuid, "fromId" uuid, "toId" uuid, type text)`,
    );

    const assertions = corpus.records.map((record, index) => {
      const latest = record.versions.at(-1)!;
      return {
        id: stableId('benchmark-assertion', record.id),
        workspaceId,
        scopeId: scopeId(record.visibility),
        subjectId: evidenceResourceId(record),
        predicate: latest.stance,
        objectId: hypothesisResourceId(record.canonicalProjectId),
        relationshipId: relationships[index]!.id,
        sourceVersionId: sourceVersionId(record, latest.version),
        confidence: 0.55 + (index % 40) / 100,
        validFrom: latest.updatedAt,
      };
    });
    await insertBatches(
      client,
      assertions,
      `INSERT INTO assertions (id, workspace_id, access_scope_id, subject_resource_id, predicate,
         object_resource_id, relationship_id, assertion_kind, source_object_version_id,
         process_name, process_version, confidence, valid_from)
       SELECT id, "workspaceId", "scopeId", "subjectId", predicate, "objectId", "relationshipId",
         'source-backed', "sourceVersionId", 'benchmark-semantic-mapper', '1.0.0', confidence, "validFrom"
       FROM jsonb_to_recordset($1::jsonb)
       AS row(id uuid, "workspaceId" uuid, "scopeId" uuid, "subjectId" uuid, predicate text,
         "objectId" uuid, "relationshipId" uuid, "sourceVersionId" uuid, confidence real, "validFrom" timestamptz)`,
    );
    await insertBatches(
      client,
      corpus.records.map((record, index) => ({
        id: stableId('benchmark-provenance', record.id),
        workspaceId,
        assertionId: assertions[index]!.id,
        sourceVersionId: assertions[index]!.sourceVersionId,
        excerpt: record.versions.at(-1)!.body,
      })),
      `INSERT INTO provenance_spans (id, workspace_id, assertion_id, source_object_version_id, start_offset, end_offset, excerpt)
     SELECT id, "workspaceId", "assertionId", "sourceVersionId", 0, length(excerpt), excerpt
     FROM jsonb_to_recordset($1::jsonb)
     AS row(id uuid, "workspaceId" uuid, "assertionId" uuid, "sourceVersionId" uuid, excerpt text)`,
    );

    const searchChunks = corpus.records.flatMap((record, index) => {
        const latest = record.versions.at(-1)!;
        return chunkText(latest.body).map((chunk) => ({
          id: stableId('benchmark-search-document', `${record.id}:${chunk.index}`),
          workspaceId,
          scopeId: scopeId(record.visibility),
          resourceId: evidenceResourceId(record),
          assertionId: assertions[index]!.id,
          contentVersionId: contentVersionId(record, latest.version),
          body: `${latest.title}. Client: ${record.canonicalClientName}. Project: ${record.canonicalProjectName}. ${chunk.text} ${record.sourceClientReference} ${record.sourceProjectReference}`,
          chunkIndex: chunk.index,
          chunkStartOffset: chunk.startOffset,
          chunkEndOffset: chunk.endOffset,
          authority: 0.5 + (index % 45) / 100,
          confidence: assertions[index]!.confidence,
          updatedAt: latest.updatedAt,
          active: !record.deleted,
        }));
      });
    await insertBatches(
      client,
      searchChunks,
      `INSERT INTO search_documents (id, workspace_id, access_scope_id, resource_id, assertion_id, content_version_id,
       body, chunk_index, chunk_start_offset, chunk_end_offset, authority, confidence, source_updated_at, active)
     SELECT id, "workspaceId", "scopeId", "resourceId", "assertionId", "contentVersionId", body,
       "chunkIndex", "chunkStartOffset", "chunkEndOffset", authority, confidence, "updatedAt", active
     FROM jsonb_to_recordset($1::jsonb)
     AS row(id uuid, "workspaceId" uuid, "scopeId" uuid, "resourceId" uuid, "assertionId" uuid, "contentVersionId" uuid,
       body text, "chunkIndex" integer, "chunkStartOffset" integer, "chunkEndOffset" integer,
       authority real, confidence real, "updatedAt" timestamptz, active boolean)`,
    );

    const identityCandidates = corpus.records.flatMap((record) => {
      const latestVersionId = sourceVersionId(record, record.versions.length);
      const candidates = [
        {
          keyType: 'client-ref',
          key: record.sourceClientReference,
          resourceId: record.canonicalClientId,
        },
        {
          keyType: 'project-ref',
          key: record.sourceProjectReference,
          resourceId: record.canonicalProjectId,
        },
      ];
      return candidates.map((candidate) => ({
        id: stableId(
          'benchmark-resolution-candidate',
          `${record.id}:${candidate.keyType}:${candidate.resourceId}`,
        ),
        workspaceId,
        sourceSystem: record.sourceSystem,
        keyType: candidate.keyType,
        externalKey: candidate.key,
        resourceId: candidate.resourceId,
        sourceVersionId: latestVersionId,
        confidence: record.ambiguousAlias ? 0.5 : 1,
        status: record.ambiguousAlias ? 'ambiguous' : 'resolved',
        rationale: record.ambiguousAlias
          ? 'Shared source alias requires disambiguation'
          : 'Deterministic source identity match',
      }));
    });
    await insertBatches(
      client,
      identityCandidates,
      `INSERT INTO identity_resolution_candidates (id, workspace_id, source_system, key_type, external_key,
         candidate_resource_id, source_object_version_id, confidence, status, rationale)
       SELECT id, "workspaceId", "sourceSystem", "keyType", "externalKey", "resourceId",
         "sourceVersionId", confidence, status, rationale
       FROM jsonb_to_recordset($1::jsonb)
       AS row(id uuid, "workspaceId" uuid, "sourceSystem" text, "keyType" text, "externalKey" text,
         "resourceId" uuid, "sourceVersionId" uuid, confidence real, status text, rationale text)`,
    );

    const promotedKeys = new Map<string, (typeof identityCandidates)[number]>();
    for (const candidate of identityCandidates) {
      if (candidate.status !== 'resolved') continue;
      promotedKeys.set(
        `${candidate.sourceSystem}:${candidate.keyType}:${candidate.externalKey}`,
        candidate,
      );
    }
    await insertBatches(
      client,
      [...promotedKeys.values()].map((candidate) => ({
        ...candidate,
        id: stableId(
          'benchmark-identity-key',
          `${candidate.sourceSystem}:${candidate.keyType}:${candidate.externalKey}`,
        ),
      })),
      `INSERT INTO resource_identity_keys (id, workspace_id, resource_id, source_system, key_type,
       external_key, confidence, source_object_version_id)
     SELECT id, "workspaceId", "resourceId", "sourceSystem", "keyType", "externalKey", confidence, "sourceVersionId"
     FROM jsonb_to_recordset($1::jsonb)
     AS row(id uuid, "workspaceId" uuid, "resourceId" uuid, "sourceSystem" text, "keyType" text,
       "externalKey" text, confidence real, "sourceVersionId" uuid)`,
    );

    await insertBatches(
      client,
      sources.map((source) => ({
        id: stableId(
          'benchmark-sync-run',
          `${corpus.seed}:${source.sourceType}`,
        ),
        workspaceId,
        sourceId: source.id,
        cursor: source.cursor,
        seen: corpus.records.filter(
          (record) => record.sourceSystem === source.sourceType,
        ).length,
      })),
      `INSERT INTO sync_runs (id, workspace_id, source_id, status, cursor_after, objects_seen, objects_changed, finished_at)
     SELECT id, "workspaceId", "sourceId", 'succeeded', cursor, seen, seen, now()
     FROM jsonb_to_recordset($1::jsonb)
     AS row(id uuid, "workspaceId" uuid, "sourceId" uuid, cursor text, seen integer)`,
    );

    await client.query('COMMIT');
    return {
      durationMs: performance.now() - startedAt,
      records: corpus.records.length,
      versions: sourceVersions.length,
      chunks: searchChunks.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function analyzeScaleBenchmarkTables(client: PoolClient) {
  await client.query(
    `ANALYZE search_documents, resources, access_scopes, access_scope_grants, group_memberships`,
  );
}

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ??
    0
  );
}

function reciprocalRank(results: string[], expected: Set<string>) {
  const index = results.findIndex((id) => expected.has(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

export async function evaluateScaleCorpus(corpus: ScaleCorpus, limit = 20) {
  const actorIds: Record<BenchmarkQuestion['actor'], string> = {
    alex: SCALE_BENCHMARK_IDS.users.alex,
    jamie: SCALE_BENCHMARK_IDS.users.jamie,
    morgan: SCALE_BENCHMARK_IDS.users.morgan,
  };
  const projectNames = new Map(
    corpus.records.map((record) => [
      record.canonicalProjectId,
      record.canonicalProjectName,
    ]),
  );
  const latencies: number[] = [];
  let expectedReturned = 0;
  let totalReturned = 0;
  let totalExpected = 0;
  let forbiddenReturned = 0;
  let reciprocalRankTotal = 0;

  for (const actor of Object.keys(actorIds) as BenchmarkQuestion['actor'][]) {
    const questions = corpus.questions.filter(
      (question) => question.actor === actor,
    );
    await withActorTransaction(
      { actorId: actorIds[actor], workspaceId: SCALE_BENCHMARK_IDS.workspace },
      async (client) => {
        for (const question of questions) {
          const startedAt = performance.now();
          const result = await client.query<{ record_id: string }>(
            `SELECT resource.properties ->> 'benchmarkRecordId' AS record_id
             FROM permissioned_lexical_search(phraseto_tsquery('english', $1), $2) lexical
             JOIN search_documents document ON document.id = lexical.id
             JOIN resources resource ON resource.id = document.resource_id
             ORDER BY lexical.lexical_rank`,
            [projectNames.get(question.canonicalProjectId), limit],
          );
          latencies.push(performance.now() - startedAt);
          const returned = result.rows.map((row) => row.record_id);
          const expected = new Set(question.expectedRecordIds);
          const forbidden = new Set(question.forbiddenRecordIds);
          expectedReturned += returned.filter((id) => expected.has(id)).length;
          forbiddenReturned += returned.filter((id) =>
            forbidden.has(id),
          ).length;
          totalReturned += returned.length;
          totalExpected += expected.size;
          reciprocalRankTotal += reciprocalRank(returned, expected);
        }
      },
    );
  }

  return {
    questions: corpus.questions.length,
    limit,
    precisionAtLimit: totalReturned ? expectedReturned / totalReturned : 0,
    recallAtLimit: totalExpected ? expectedReturned / totalExpected : 0,
    meanReciprocalRank: corpus.questions.length
      ? reciprocalRankTotal / corpus.questions.length
      : 0,
    permissionLeakageCount: forbiddenReturned,
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      max: Math.max(...latencies),
    },
  };
}

export async function inspectScaleCorpusIntegrity(client: PoolClient) {
  const workspaceId = SCALE_BENCHMARK_IDS.workspace;
  const result = await client.query<{
    logical_records: string;
    immutable_versions: string;
    active_deleted_records: string;
    stale_search_documents: string;
    search_chunks: string;
    multi_chunk_resources: string;
    ambiguous_candidates: string;
    resolved_keys: string;
  }>(
    `SELECT
      (SELECT count(*) FROM source_objects WHERE workspace_id = $1) AS logical_records,
      (SELECT count(*) FROM source_object_versions WHERE workspace_id = $1) AS immutable_versions,
      (SELECT count(*) FROM search_documents document JOIN resources resource ON resource.id = document.resource_id
        WHERE document.workspace_id = $1 AND document.active AND resource.status = 'deleted') AS active_deleted_records,
      (SELECT count(*) FROM search_documents document JOIN content_versions version ON version.id = document.content_version_id
        WHERE document.workspace_id = $1 AND NOT version.is_current) AS stale_search_documents,
      (SELECT count(*) FROM search_documents WHERE workspace_id = $1) AS search_chunks,
      (SELECT count(*) FROM (
        SELECT resource_id FROM search_documents WHERE workspace_id = $1 GROUP BY resource_id HAVING count(*) > 1
      ) multi_chunk) AS multi_chunk_resources,
      (SELECT count(*) FROM identity_resolution_candidates WHERE workspace_id = $1 AND status = 'ambiguous') AS ambiguous_candidates,
      (SELECT count(*) FROM resource_identity_keys WHERE workspace_id = $1) AS resolved_keys`,
    [workspaceId],
  );
  const row = result.rows[0]!;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value)]),
  );
}
