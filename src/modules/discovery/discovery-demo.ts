import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  SUPPLIER_DISCOVERY_DOCUMENTS,
  SUPPLIER_DISCOVERY_RULES,
} from '@/data/sources/discovery/supplier-onboarding';
import { withActorTransaction } from '@/src/db/actor-transaction';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import { registerPromotedHypothesis } from '@/src/modules/hypotheses/lifecycle';
import {
  ensureBackgroundRoutePolicy,
  recordDeterministicRouteDecision,
} from '@/src/modules/model-routing/model-router';
import {
  createHypothesisMonitor,
  inMonitorTransaction,
} from '@/src/modules/memory/hypothesis-monitor';
import { discoverHypotheses } from './hypothesis-discovery';
import type { DiscoveryDocument, DiscoveryState } from './types';

export const DISCOVERY_PROCESS = {
  name: 'governed-concept-discovery',
  version: '1.0.0',
} as const;

const sourceConfiguration = {
  research: {
    id: IDS.sources.discoveryResearch,
    type: 'research',
    name: 'Verdant supplier research',
    contentType: 'ResearchNote',
  },
  meetings: {
    id: IDS.sources.discoveryMeetings,
    type: 'meetings',
    name: 'Verdant supplier meetings',
    contentType: 'MeetingNote',
  },
  crm: {
    id: IDS.sources.discoveryCrm,
    type: 'crm',
    name: 'Verdant supplier CRM',
    contentType: 'Document',
  },
  documents: {
    id: IDS.sources.discoveryDocuments,
    type: 'documents',
    name: 'Verdant supplier documents',
    contentType: 'Document',
  },
  messages: {
    id: IDS.sources.discoveryMessages,
    type: 'messages',
    name: 'Verdant supplier messages',
    contentType: 'MessageThread',
  },
} as const;

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sourceFor(document: DiscoveryDocument) {
  const source =
    sourceConfiguration[
      document.sourceSystem as keyof typeof sourceConfiguration
    ];
  if (!source)
    throw new Error(`Unsupported discovery source ${document.sourceSystem}`);
  return source;
}

async function materializeAcceptedEvidence(
  client: PoolClient,
  input: {
    candidateId: string;
    hypothesisResourceId: string;
    contentResourceIds: string[];
    confidence: number;
  },
) {
  const documents = await client.query<{
    resource_id: string;
    title: string;
    body: string;
    content_version_id: string;
    source_object_version_id: string;
    source_updated_at: Date;
  }>(
    `SELECT resource.id AS resource_id, resource.canonical_name AS title,
     version.body, version.id AS content_version_id,
     version.source_object_version_id, source_object.source_updated_at
     FROM resources resource
     JOIN content_objects content ON content.resource_id = resource.id
     JOIN content_versions version ON version.id = content.current_version_id
     JOIN source_object_versions source_version
       ON source_version.id = version.source_object_version_id
     JOIN source_objects source_object
       ON source_object.id = source_version.source_object_id
     WHERE resource.id = ANY($1::uuid[])
     ORDER BY resource.id`,
    [input.contentResourceIds],
  );
  if (documents.rows.length !== input.contentResourceIds.length) {
    throw new Error(
      'One or more discovery evidence records could not be resolved',
    );
  }
  for (const document of documents.rows) {
    const evidenceId = stableId(
      'discovery-evidence',
      `${input.candidateId}:${document.resource_id}`,
    );
    await client.query(
      `INSERT INTO resources
        (id, workspace_id, access_scope_id, resource_kind, semantic_type,
         canonical_name, summary, properties)
       VALUES ($1, $2, $3, 'entity', 'Evidence', $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        evidenceId,
        IDS.workspace,
        IDS.scopes.everyone,
        document.title,
        document.body,
        {
          discoveryCandidateId: input.candidateId,
          sourceContentResourceId: document.resource_id,
          humanReviewed: true,
        },
      ],
    );
    await client.query(
      `INSERT INTO entities (resource_id, normalized_name) VALUES ($1, $2)
       ON CONFLICT (resource_id) DO NOTHING`,
      [evidenceId, normalize(document.title)],
    );
    for (const relation of [
      {
        predicate: 'SUPPORTS',
        target: input.hypothesisResourceId,
      },
      {
        predicate: 'BELONGS_TO',
        target: IDS.resources.supplierOnboarding,
      },
    ]) {
      const relationshipId = stableId(
        'relationship',
        `${evidenceId}:${relation.predicate}:${relation.target}`,
      );
      const assertionId = stableId(
        'assertion',
        `${input.candidateId}:${relationshipId}:human-review`,
      );
      await client.query(
        `INSERT INTO relationships
          (id, workspace_id, from_resource_id, to_resource_id, relationship_type)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (workspace_id, from_resource_id, to_resource_id, relationship_type)
         DO NOTHING`,
        [
          relationshipId,
          IDS.workspace,
          evidenceId,
          relation.target,
          relation.predicate,
        ],
      );
      await client.query(
        `INSERT INTO assertions
          (id, workspace_id, access_scope_id, subject_resource_id, predicate,
           object_resource_id, relationship_id, assertion_kind,
           source_object_version_id, process_name, process_version, confidence,
           valid_from)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'rule-derived', $8,
           'hypothesis-discovery-human-review', '1.0.0', $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [
          assertionId,
          IDS.workspace,
          IDS.scopes.everyone,
          evidenceId,
          relation.predicate,
          relation.target,
          relationshipId,
          document.source_object_version_id,
          input.confidence,
          document.source_updated_at,
        ],
      );
      await client.query(
        `INSERT INTO provenance_spans
          (id, workspace_id, assertion_id, source_object_version_id,
           start_offset, end_offset, excerpt)
         VALUES ($1, $2, $3, $4, 0, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          stableId('provenance', assertionId),
          IDS.workspace,
          assertionId,
          document.source_object_version_id,
          document.body.length,
          document.body,
        ],
      );
      if (relation.predicate === 'SUPPORTS') {
        await client.query(
          `INSERT INTO search_documents
            (id, workspace_id, access_scope_id, resource_id, assertion_id,
             content_version_id, body, chunk_index, chunk_start_offset,
             chunk_end_offset, authority, confidence, source_updated_at, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, $8, 0.7, $9, $10, true)
           ON CONFLICT (id) DO NOTHING`,
          [
            stableId(
              'search-document',
              `${evidenceId}:${document.content_version_id}:0`,
            ),
            IDS.workspace,
            IDS.scopes.everyone,
            evidenceId,
            assertionId,
            document.content_version_id,
            document.body,
            document.body.length,
            input.confidence,
            document.source_updated_at,
          ],
        );
      }
    }
  }
}

async function reconcileAcceptedDiscoveryEvidence(client: PoolClient) {
  const accepted = await client.query<{
    id: string;
    promoted_resource_id: string;
    evidence_resource_ids: string[];
    confidence: number;
  }>(
    `SELECT id, promoted_resource_id, evidence_resource_ids, confidence
     FROM hypothesis_discovery_candidates
     WHERE discovery_policy_id = $1 AND status = 'accepted'
       AND promoted_resource_id IS NOT NULL`,
    [IDS.discoveryPolicies.supplierOnboarding],
  );
  for (const candidate of accepted.rows) {
    await materializeAcceptedEvidence(client, {
      candidateId: candidate.id,
      hypothesisResourceId: candidate.promoted_resource_id,
      contentResourceIds: candidate.evidence_resource_ids,
      confidence: candidate.confidence,
    });
  }
}

async function upsertDiscoveryScenario(client: PoolClient) {
  for (const resource of [
    {
      id: IDS.resources.verdant,
      type: 'Client',
      name: 'Verdant Foods',
      summary:
        'A fictional food-services client used for unlabeled discovery evaluation.',
    },
    {
      id: IDS.resources.supplierOnboarding,
      type: 'Project',
      name: 'Verdant Supplier Onboarding',
      summary:
        'A supplier enrollment programme with fragmented operational context.',
    },
  ]) {
    await client.query(
      `INSERT INTO resources
        (id, workspace_id, access_scope_id, resource_kind, semantic_type,
         canonical_name, summary, properties)
       VALUES ($1, $2, $3, 'entity', $4, $5, $6, '{"discoveryDemo":true}')
       ON CONFLICT (id) DO NOTHING`,
      [
        resource.id,
        IDS.workspace,
        IDS.scopes.everyone,
        resource.type,
        resource.name,
        resource.summary,
      ],
    );
    await client.query(
      `INSERT INTO entities (resource_id, normalized_name) VALUES ($1, $2)
       ON CONFLICT (resource_id) DO NOTHING`,
      [resource.id, normalize(resource.name)],
    );
  }

  const projectClientRelationshipId = stableId(
    'relationship',
    `${IDS.resources.supplierOnboarding}:IS_FOR:${IDS.resources.verdant}`,
  );
  await client.query(
    `INSERT INTO relationships
      (id, workspace_id, from_resource_id, to_resource_id, relationship_type)
     VALUES ($1, $2, $3, $4, 'IS_FOR')
     ON CONFLICT (workspace_id, from_resource_id, to_resource_id, relationship_type) DO NOTHING`,
    [
      projectClientRelationshipId,
      IDS.workspace,
      IDS.resources.supplierOnboarding,
      IDS.resources.verdant,
    ],
  );
  await client.query(
    `INSERT INTO assertions
      (id, workspace_id, access_scope_id, subject_resource_id, predicate,
       object_resource_id, relationship_id, assertion_kind, process_name,
       process_version, confidence, valid_from)
     VALUES ($1, $2, $3, $4, 'IS_FOR', $5, $6, 'rule-derived',
       'discovery-demo-mapper', '1.0.0', 1, '2026-09-10T09:00:00Z')
     ON CONFLICT (id) DO NOTHING`,
    [
      stableId('assertion', `${projectClientRelationshipId}:discovery-demo`),
      IDS.workspace,
      IDS.scopes.everyone,
      IDS.resources.supplierOnboarding,
      IDS.resources.verdant,
      projectClientRelationshipId,
    ],
  );

  const persisted: DiscoveryDocument[] = [];
  for (const document of SUPPLIER_DISCOVERY_DOCUMENTS) {
    const source = sourceFor(document);
    const bodyHash = createHash('sha256').update(document.body).digest('hex');
    const externalId = document.resourceId;
    const sourceObjectId = stableId(
      'source-object',
      `${source.id}:${externalId}`,
    );
    const sourceVersionId = stableId(
      'source-version',
      `${source.id}:${externalId}:${bodyHash}`,
    );
    const resourceId = stableId(
      'content-resource',
      `${source.id}:${externalId}`,
    );
    const contentVersionId = stableId('content-version', sourceVersionId);
    await client.query(
      `INSERT INTO sources (id, workspace_id, source_type, name, cursor, status, last_successful_sync_at)
       VALUES ($1, $2, $3, $4, 'fixture-v1', 'healthy', now())
       ON CONFLICT (id) DO NOTHING`,
      [source.id, IDS.workspace, source.type, source.name],
    );
    await client.query(
      `INSERT INTO sync_runs
        (id, workspace_id, source_id, status, cursor_before, cursor_after,
         objects_seen, objects_changed, finished_at)
       VALUES ($1, $2, $3, 'completed', NULL, 'fixture-v1', 1, 1, now())
       ON CONFLICT (id) DO NOTHING`,
      [
        stableId('sync-run', `${source.id}:fixture-v1`),
        IDS.workspace,
        source.id,
      ],
    );
    await client.query(
      `INSERT INTO source_objects
        (id, workspace_id, source_id, access_scope_id, external_id, source_uri,
         source_created_at, source_updated_at, current_content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, '2026-09-01T09:00:00Z',
         '2026-09-10T09:00:00Z', $7)
       ON CONFLICT (source_id, external_id) DO UPDATE SET current_content_hash = EXCLUDED.current_content_hash`,
      [
        sourceObjectId,
        IDS.workspace,
        source.id,
        IDS.scopes.everyone,
        externalId,
        document.sourceUri,
        bodyHash,
      ],
    );
    await client.query(
      `INSERT INTO source_object_versions
        (id, workspace_id, source_object_id, access_scope_id, content_hash, raw_payload, source_updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, '2026-09-10T09:00:00Z')
       ON CONFLICT (source_object_id, content_hash) DO NOTHING`,
      [
        sourceVersionId,
        IDS.workspace,
        sourceObjectId,
        IDS.scopes.everyone,
        bodyHash,
        document,
      ],
    );
    await client.query(
      `INSERT INTO resources
        (id, workspace_id, access_scope_id, resource_kind, semantic_type,
         canonical_name, summary, properties)
       VALUES ($1, $2, $3, 'content', $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        resourceId,
        IDS.workspace,
        IDS.scopes.everyone,
        source.contentType,
        document.title,
        document.body,
        { sourceUri: document.sourceUri, unlabeledDiscoveryInput: true },
      ],
    );
    await client.query(
      `INSERT INTO content_objects (resource_id, content_type) VALUES ($1, $2)
       ON CONFLICT (resource_id) DO NOTHING`,
      [resourceId, source.contentType],
    );
    await client.query(
      `INSERT INTO content_versions
        (id, workspace_id, content_resource_id, source_object_version_id, access_scope_id,
         body, content_hash, version_number, is_current)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, true)
       ON CONFLICT (id) DO NOTHING`,
      [
        contentVersionId,
        IDS.workspace,
        resourceId,
        sourceVersionId,
        IDS.scopes.everyone,
        document.body,
        bodyHash,
      ],
    );
    await client.query(
      `UPDATE content_objects SET current_version_id = $2 WHERE resource_id = $1`,
      [resourceId, contentVersionId],
    );
    const relationshipId = stableId(
      'relationship',
      `${resourceId}:BELONGS_TO:${IDS.resources.supplierOnboarding}`,
    );
    const assertionId = stableId(
      'assertion',
      `${sourceVersionId}:${relationshipId}:discovery-demo`,
    );
    await client.query(
      `INSERT INTO relationships
        (id, workspace_id, from_resource_id, to_resource_id, relationship_type)
       VALUES ($1, $2, $3, $4, 'BELONGS_TO')
       ON CONFLICT (workspace_id, from_resource_id, to_resource_id, relationship_type) DO NOTHING`,
      [
        relationshipId,
        IDS.workspace,
        resourceId,
        IDS.resources.supplierOnboarding,
      ],
    );
    await client.query(
      `INSERT INTO assertions
        (id, workspace_id, access_scope_id, subject_resource_id, predicate,
         object_resource_id, relationship_id, assertion_kind, source_object_version_id,
         process_name, process_version, confidence, valid_from)
       VALUES ($1, $2, $3, $4, 'BELONGS_TO', $5, $6, 'rule-derived', $7,
         'discovery-demo-mapper', '1.0.0', 1, '2026-09-10T09:00:00Z')
       ON CONFLICT (id) DO NOTHING`,
      [
        assertionId,
        IDS.workspace,
        IDS.scopes.everyone,
        resourceId,
        IDS.resources.supplierOnboarding,
        relationshipId,
        sourceVersionId,
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
        sourceVersionId,
        document.body.length,
        document.body,
      ],
    );
    persisted.push({ ...document, resourceId });
  }
  return persisted;
}

export async function initializeDiscoveryDemo() {
  return inMonitorTransaction(async (client) => {
    const documents = await upsertDiscoveryScenario(client);
    await ensureBackgroundRoutePolicy(client);
    await client.query(
      `INSERT INTO hypothesis_discovery_policies
        (id, workspace_id, access_scope_id, owner_actor_id, service_actor_id, name, subject,
         project_resource_id, source_ids, concept_rules, minimum_source_diversity,
         status, model_route_policy_id, ontology_version_id)
       VALUES ($1, $2, $3, $4, $5, 'Cross-source supplier friction discovery',
         'Supplier onboarding abandonment', $6, $7, $8, 3, 'active', $9,
         (SELECT id FROM ontology_versions WHERE workspace_id = $2 AND status = 'current'))
       ON CONFLICT (id) DO UPDATE SET subject = EXCLUDED.subject,
         concept_rules = EXCLUDED.concept_rules, updated_at = now()`,
      [
        IDS.discoveryPolicies.supplierOnboarding,
        IDS.workspace,
        IDS.scopes.everyone,
        IDS.users.alex,
        IDS.users.memoryAgent,
        IDS.resources.supplierOnboarding,
        JSON.stringify(
          Object.values(sourceConfiguration).map((source) => source.id),
        ),
        JSON.stringify(SUPPLIER_DISCOVERY_RULES),
        IDS.modelPolicies.background,
      ],
    );
    await client.query(
      `INSERT INTO hypothesis_discovery_schedules
        (id, workspace_id, access_scope_id, discovery_policy_id,
         interval_seconds, enabled, next_due_at)
       VALUES ($1, $2, $3, $4, 21600, true, now() + interval '6 hours')
       ON CONFLICT (discovery_policy_id) DO NOTHING`,
      [
        IDS.discoverySchedules.supplierOnboarding,
        IDS.workspace,
        IDS.scopes.everyone,
        IDS.discoveryPolicies.supplierOnboarding,
      ],
    );
    const existingHypotheses = await client.query<{ canonical_name: string }>(
      `SELECT canonical_name FROM resources WHERE semantic_type = 'Hypothesis'`,
    );
    const candidates = discoverHypotheses(documents, {
      subject: 'Supplier onboarding abandonment',
      minimumSourceDiversity: 3,
      conceptRules: SUPPLIER_DISCOVERY_RULES,
      existingHypotheses: existingHypotheses.rows.map(
        (item) => item.canonical_name,
      ),
    });
    const inputHash = createHash('sha256')
      .update(JSON.stringify(documents))
      .digest('hex');
    const triggerRef = `fixture-sweep:${inputHash}`;
    const runId = stableId(
      'hypothesis-discovery-run',
      `${IDS.discoveryPolicies.supplierOnboarding}:${triggerRef}`,
    );
    await client.query(
      `INSERT INTO hypothesis_discovery_runs
        (id, workspace_id, access_scope_id, discovery_policy_id, trigger_ref, status,
         documents_scanned, source_systems_scanned, candidates_formed, selected_route,
         rationale, ontology_version_id)
       VALUES ($1, $2, $3, $4, $5, 'running', $6, $7, $8, 'no-model', $9,
         (SELECT ontology_version_id FROM hypothesis_discovery_policies WHERE id = $4))
       ON CONFLICT (workspace_id, discovery_policy_id, trigger_ref) DO NOTHING`,
      [
        runId,
        IDS.workspace,
        IDS.scopes.everyone,
        IDS.discoveryPolicies.supplierOnboarding,
        triggerRef,
        documents.length,
        new Set(documents.map((item) => item.sourceSystem)).size,
        candidates.length,
        candidates.length
          ? 'Governed concepts crossed the source-diversity threshold.'
          : 'No concept crossed the source-diversity threshold.',
      ],
    );
    await recordDeterministicRouteDecision(client, {
      discoveryRunId: runId,
      taskFingerprint: `${IDS.discoveryPolicies.supplierOnboarding}:${inputHash}`,
      inputCharacters: documents.reduce(
        (sum, item) => sum + item.body.length,
        0,
      ),
      purpose: 'open-ended-hypothesis-discovery',
    });
    for (const candidate of candidates) {
      const statementHash = createHash('sha256')
        .update(candidate.statement)
        .digest('hex');
      const candidateId = stableId(
        'hypothesis-discovery-candidate',
        statementHash,
      );
      await client.query(
        `INSERT INTO hypothesis_discovery_candidates
          (id, workspace_id, access_scope_id, discovery_policy_id, discovery_run_id,
           statement_hash, statement, rationale, concepts, evidence_resource_ids,
           source_uris, source_systems, predictions, falsification_conditions,
           confidence, novelty_score, source_diversity, process_name, process_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
           $13, $14, $15, $16, $17, $18, $19)
         ON CONFLICT (workspace_id, discovery_policy_id, statement_hash) DO NOTHING`,
        [
          candidateId,
          IDS.workspace,
          IDS.scopes.everyone,
          IDS.discoveryPolicies.supplierOnboarding,
          runId,
          statementHash,
          candidate.statement,
          candidate.rationale,
          JSON.stringify(candidate.concepts),
          JSON.stringify(candidate.evidence.map((item) => item.resourceId)),
          JSON.stringify(candidate.evidence.map((item) => item.sourceUri)),
          JSON.stringify([
            ...new Set(candidate.evidence.map((item) => item.sourceSystem)),
          ]),
          JSON.stringify(candidate.predictions),
          JSON.stringify(candidate.falsificationConditions),
          candidate.confidence,
          candidate.noveltyScore,
          candidate.sourceDiversity,
          DISCOVERY_PROCESS.name,
          DISCOVERY_PROCESS.version,
        ],
      );
      await client.query(
        `INSERT INTO notification_outbox
          (id, workspace_id, access_scope_id, monitor_policy_id, discovery_policy_id,
           recipient_actor_id, notification_type, severity, deduplication_key, payload)
         VALUES ($1, $2, $3, NULL, $4, $5, 'review-required', 'attention', $6, $7)
         ON CONFLICT (workspace_id, deduplication_key) DO NOTHING`,
        [
          stableId('notification', `discovery-review:${candidateId}`),
          IDS.workspace,
          IDS.scopes.everyone,
          IDS.discoveryPolicies.supplierOnboarding,
          IDS.users.alex,
          `discovery-review:${candidateId}`,
          {
            title: 'A cross-source hypothesis is ready for review',
            candidateId,
          },
        ],
      );
    }
    await reconcileAcceptedDiscoveryEvidence(client);
    await client.query(
      `UPDATE hypothesis_discovery_runs SET status = $2, finished_at = now()
       WHERE id = $1`,
      [runId, candidates.length ? 'completed' : 'no-candidate'],
    );
    await client.query(
      `UPDATE hypothesis_discovery_policies SET last_successful_run_at = now(),
       updated_at = now() WHERE id = $1`,
      [IDS.discoveryPolicies.supplierOnboarding],
    );
    return {
      runId,
      documents: documents.length,
      candidates: candidates.length,
    };
  });
}

export async function getDiscoveryState(actor: {
  id: string;
  workspaceId: string;
}): Promise<DiscoveryState | null> {
  return withActorTransaction(
    { actorId: actor.id, workspaceId: actor.workspaceId },
    async (client) => {
      const policy = await client.query<{
        id: string;
        name: string;
        status: 'active' | 'paused' | 'stopped';
        minimum_source_diversity: number;
        ontology_version: string;
        last_successful_run_at: Date | null;
      }>(
        `SELECT policy.id, policy.name, policy.status, policy.minimum_source_diversity,
         policy.last_successful_run_at, ontology.version AS ontology_version
         FROM hypothesis_discovery_policies policy
         JOIN ontology_versions ontology ON ontology.id = policy.ontology_version_id
         WHERE policy.id = $1`,
        [IDS.discoveryPolicies.supplierOnboarding],
      );
      if (!policy.rows[0]) return null;
      const [run, candidates, schedule, jobs] = await Promise.all([
        client.query<{
          id: string;
          status: 'running' | 'completed' | 'no-candidate' | 'failed';
          documents_scanned: number;
          source_systems_scanned: number;
          candidates_formed: number;
          candidates_reobserved: number;
          selected_route:
            | 'no-model'
            | 'economy'
            | 'high-assurance'
            | 'deferred';
          rationale: string | null;
          finished_at: Date | null;
        }>(
          `SELECT * FROM hypothesis_discovery_runs WHERE discovery_policy_id = $1
           ORDER BY started_at DESC LIMIT 1`,
          [policy.rows[0].id],
        ),
        client.query<{
          id: string;
          statement: string;
          rationale: string;
          concepts: Array<{
            id: string;
            label: string;
            evidenceCount: number;
            sourceDiversity: number;
          }>;
          source_uris: string[];
          source_systems: string[];
          predictions: string[];
          falsification_conditions: string[];
          confidence: number;
          novelty_score: number;
          source_diversity: number;
          status: 'proposed' | 'accepted' | 'dismissed' | 'superseded';
          promoted_resource_id: string | null;
        }>(
          `SELECT * FROM hypothesis_discovery_candidates WHERE discovery_policy_id = $1
           ORDER BY created_at DESC LIMIT 10`,
          [policy.rows[0].id],
        ),
        client.query<{
          enabled: boolean;
          interval_seconds: number;
          next_due_at: Date;
        }>(
          `SELECT enabled, interval_seconds, next_due_at
           FROM hypothesis_discovery_schedules WHERE discovery_policy_id = $1`,
          [policy.rows[0].id],
        ),
        client.query<{
          pending: string;
          retrying: string;
          dead_letter: string;
        }>(
          `SELECT
             count(*) FILTER (WHERE status IN ('pending', 'leased'))::text AS pending,
             count(*) FILTER (WHERE status = 'retrying')::text AS retrying,
             count(*) FILTER (WHERE status = 'dead-letter')::text AS dead_letter
           FROM hypothesis_discovery_jobs WHERE discovery_policy_id = $1`,
          [policy.rows[0].id],
        ),
      ]);
      return {
        policy: {
          id: policy.rows[0].id,
          name: policy.rows[0].name,
          status: policy.rows[0].status,
          minimumSourceDiversity: policy.rows[0].minimum_source_diversity,
          ontologyVersion: policy.rows[0].ontology_version,
        },
        latestRun: run.rows[0]
          ? {
              id: run.rows[0].id,
              status: run.rows[0].status,
              documentsScanned: run.rows[0].documents_scanned,
              sourceSystemsScanned: run.rows[0].source_systems_scanned,
              candidatesFormed: run.rows[0].candidates_formed,
              candidatesReobserved: run.rows[0].candidates_reobserved,
              selectedRoute: run.rows[0].selected_route,
              rationale: run.rows[0].rationale,
              finishedAt: run.rows[0].finished_at?.toISOString() ?? null,
            }
          : null,
        operations: {
          scheduleEnabled: schedule.rows[0]?.enabled ?? false,
          intervalSeconds: schedule.rows[0]?.interval_seconds ?? 0,
          nextDueAt: schedule.rows[0]?.next_due_at.toISOString() ?? null,
          pendingJobs: Number(jobs.rows[0]?.pending ?? 0),
          retryingJobs: Number(jobs.rows[0]?.retrying ?? 0),
          deadLetterJobs: Number(jobs.rows[0]?.dead_letter ?? 0),
          lastSuccessfulRunAt:
            policy.rows[0].last_successful_run_at?.toISOString() ?? null,
        },
        candidates: candidates.rows.map((candidate) => ({
          id: candidate.id,
          statement: candidate.statement,
          rationale: candidate.rationale,
          concepts: candidate.concepts,
          sourceUris: candidate.source_uris,
          sourceSystems: candidate.source_systems,
          predictions: candidate.predictions,
          falsificationConditions: candidate.falsification_conditions,
          confidence: candidate.confidence,
          noveltyScore: candidate.novelty_score,
          sourceDiversity: candidate.source_diversity,
          status: candidate.status,
          promotedResourceId: candidate.promoted_resource_id,
        })),
      };
    },
  );
}

export class DiscoveryReviewPermissionError extends Error {}

export async function reviewDiscoveryCandidate(
  actor: { id: string; workspaceId: string; name: string; role: string },
  candidateId: string,
  decision: 'accept' | 'dismiss',
) {
  if (actor.id !== IDS.users.alex || actor.role !== 'Project Lead') {
    throw new DiscoveryReviewPermissionError(
      'Only the demo Project Lead can review discovered hypotheses',
    );
  }
  let monitorDefinition: Parameters<typeof createHypothesisMonitor>[0] | null =
    null;
  await inMonitorTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      statement: string;
      rationale: string;
      predictions: string[];
      falsification_conditions: string[];
      evidence_resource_ids: string[];
      confidence: number;
      status: 'proposed' | 'accepted' | 'dismissed' | 'superseded';
    }>(
      `SELECT * FROM hypothesis_discovery_candidates WHERE id = $1 FOR UPDATE`,
      [candidateId],
    );
    const candidate = result.rows[0];
    if (!candidate) throw new Error('The discovery candidate was not found');
    if (candidate.status !== 'proposed') return;
    if (decision === 'dismiss') {
      await client.query(
        `UPDATE hypothesis_discovery_candidates SET status = 'dismissed',
         reviewed_by = $2, reviewed_at = now(), updated_at = now() WHERE id = $1`,
        [candidate.id, actor.id],
      );
    } else {
      const resourceId = stableId(
        'promoted-discovery-hypothesis',
        candidate.id,
      );
      await client.query(
        `INSERT INTO resources
          (id, workspace_id, access_scope_id, resource_kind, semantic_type,
           canonical_name, summary, properties)
         VALUES ($1, $2, $3, 'entity', 'Hypothesis', $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          resourceId,
          IDS.workspace,
          IDS.scopes.everyone,
          candidate.statement,
          candidate.rationale,
          {
            discoveryCandidateId: candidate.id,
            review: 'human-approved',
            evidenceResourceIds: candidate.evidence_resource_ids,
            predictions: candidate.predictions,
            falsificationConditions: candidate.falsification_conditions,
          },
        ],
      );
      await client.query(
        `INSERT INTO entities (resource_id, normalized_name) VALUES ($1, $2)
         ON CONFLICT (resource_id) DO NOTHING`,
        [resourceId, normalize(candidate.statement)],
      );
      await materializeAcceptedEvidence(client, {
        candidateId: candidate.id,
        hypothesisResourceId: resourceId,
        contentResourceIds: candidate.evidence_resource_ids,
        confidence: candidate.confidence,
      });
      await registerPromotedHypothesis(client, {
        resourceId,
        scopeId: IDS.scopes.everyone,
        ownerActorId: actor.id,
        statement: candidate.statement,
        predictions: candidate.predictions,
        falsificationConditions: candidate.falsification_conditions,
        sourceCandidateId: candidate.id,
      });
      await client.query(
        `UPDATE hypothesis_discovery_candidates SET status = 'accepted',
         reviewed_by = $2, reviewed_at = now(), promoted_resource_id = $3,
         updated_at = now() WHERE id = $1`,
        [candidate.id, actor.id, resourceId],
      );
      monitorDefinition = {
        hypothesisResourceId: resourceId,
        accessScopeId: IDS.scopes.everyone,
        ownerActorId: actor.id,
        serviceActorId: IDS.users.memoryAgent,
        name: 'Discovered supplier onboarding explanation',
        query: `What evidence supports or challenges this hypothesis: ${candidate.statement}`,
        sourceIds: Object.values(sourceConfiguration).map(
          (source) => source.id,
        ),
        statement: candidate.statement,
        predictions: candidate.predictions,
        falsificationConditions: candidate.falsification_conditions,
      };
    }
    await client.query(
      `UPDATE notification_outbox SET status = 'read', read_at = now()
       WHERE discovery_policy_id = $1 AND payload->>'candidateId' = $2`,
      [IDS.discoveryPolicies.supplierOnboarding, candidate.id],
    );
  });
  if (monitorDefinition) await createHypothesisMonitor(monitorDefinition);
  return getDiscoveryState(actor);
}
