import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { stableId } from '@/src/modules/canonical/stable-id';
import { recordDeterministicRouteDecision } from '@/src/modules/model-routing/model-router';
import { DISCOVERY_PROCESS } from './discovery-demo';
import { discoverHypotheses } from './hypothesis-discovery';
import type { DiscoveryConceptRule, DiscoveryDocument } from './types';

interface DiscoveryPolicyRow {
  id: string;
  workspace_id: string;
  access_scope_id: string;
  owner_actor_id: string;
  subject: string;
  project_resource_id: string;
  source_ids: string[];
  concept_rules: DiscoveryConceptRule[];
  minimum_source_diversity: number;
  model_route_policy_id: string;
  ontology_version_id: string;
}

interface PersistedDiscoveryDocument extends DiscoveryDocument {
  contentHash: string;
}

export interface DiscoveryRunResult {
  runId: string;
  documentsScanned: number;
  sourceSystemsScanned: number;
  candidatesFormed: number;
  candidatesReobserved: number;
  candidatesSuperseded: number;
  duplicateRun: boolean;
}

async function loadPolicyDocuments(
  client: PoolClient,
  policy: DiscoveryPolicyRow,
) {
  const result = await client.query<{
    resource_id: string;
    source_uri: string;
    source_id: string;
    source_system: string;
    title: string;
    body: string;
    content_hash: string;
  }>(
    `SELECT resource.id AS resource_id, source_object.source_uri,
       source.id AS source_id, source.source_type AS source_system,
       resource.canonical_name AS title, version.body, version.content_hash
     FROM resources resource
     JOIN content_objects content ON content.resource_id = resource.id
     JOIN content_versions version ON version.id = content.current_version_id
     JOIN source_object_versions source_version
       ON source_version.id = version.source_object_version_id
     JOIN source_objects source_object ON source_object.id = source_version.source_object_id
     JOIN sources source ON source.id = source_object.source_id
     WHERE resource.workspace_id = $1
       AND resource.access_scope_id = $2
       AND version.access_scope_id = $2
       AND source_object.access_scope_id = $2
       AND source_object.deleted = false
       AND source.id = ANY($3::uuid[])
       AND EXISTS (
         SELECT 1 FROM relationships relationship
         WHERE relationship.workspace_id = resource.workspace_id
           AND relationship.from_resource_id = resource.id
           AND relationship.to_resource_id = $4
           AND relationship.relationship_type = 'BELONGS_TO'
       )
     ORDER BY source.id, resource.id`,
    [
      policy.workspace_id,
      policy.access_scope_id,
      policy.source_ids,
      policy.project_resource_id,
    ],
  );
  return result.rows.map(
    (row): PersistedDiscoveryDocument => ({
      resourceId: row.resource_id,
      sourceUri: row.source_uri,
      sourceId: row.source_id,
      sourceSystem: row.source_system,
      title: row.title,
      body: row.body,
      contentHash: row.content_hash,
    }),
  );
}

async function replaceObservationEvidenceLinks(
  client: PoolClient,
  input: {
    candidateId: string;
    workspaceId: string;
    accessScopeId: string;
    evidenceResourceIds: string[];
  },
) {
  await client.query(
    `DELETE FROM hypothesis_discovery_evidence_links WHERE candidate_id = $1`,
    [input.candidateId],
  );
  if (!input.evidenceResourceIds.length) return;
  const links = await client.query<{
    evidence_resource_id: string;
    observation_resource_id: string;
    assertion_id: string;
    statement: string;
    predicate: string;
    object_name: string;
  }>(
    `SELECT observation.artifact_resource_id AS evidence_resource_id,
       observation.observation_resource_id, assertion_row.id AS assertion_id,
       observation.statement, assertion_row.predicate,
       object_resource.canonical_name AS object_name
     FROM perception_observations observation
     JOIN LATERAL (
       SELECT assertion_candidate.id, assertion_candidate.predicate,
         assertion_candidate.object_resource_id
       FROM assertions assertion_candidate
       WHERE assertion_candidate.subject_resource_id = observation.observation_resource_id
         AND assertion_candidate.access_scope_id = $2
         AND assertion_candidate.predicate <> 'DERIVED_FROM'
         AND assertion_candidate.valid_to IS NULL
       ORDER BY assertion_candidate.confidence DESC, assertion_candidate.id
       LIMIT 1
     ) assertion_row ON true
     JOIN resources object_resource
       ON object_resource.id = assertion_row.object_resource_id
     WHERE observation.artifact_resource_id = ANY($1::uuid[])
       AND observation.access_scope_id = $2
     ORDER BY observation.artifact_resource_id,
       observation.observation_resource_id`,
    [input.evidenceResourceIds, input.accessScopeId],
  );
  for (const link of links.rows) {
    await client.query(
      `INSERT INTO hypothesis_discovery_evidence_links
        (id, workspace_id, access_scope_id, candidate_id,
         evidence_resource_id, observation_resource_id, assertion_id,
         evidence_role, rationale)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'supports', $8)
       ON CONFLICT (candidate_id, observation_resource_id, assertion_id,
         evidence_role) DO UPDATE SET rationale = EXCLUDED.rationale,
         updated_at = now()`,
      [
        stableId(
          'hypothesis-discovery-evidence-link',
          `${input.candidateId}:${link.observation_resource_id}:${link.assertion_id}:supports`,
        ),
        input.workspaceId,
        input.accessScopeId,
        input.candidateId,
        link.evidence_resource_id,
        link.observation_resource_id,
        link.assertion_id,
        `${link.statement} This observation establishes ${link.predicate} → ${link.object_name} and contributed to the candidate's governed concept match.`,
      ],
    );
  }
}

export async function executeDiscoveryPolicy(
  client: PoolClient,
  input: {
    policyId: string;
    triggerRef: string;
    jobId?: string;
  },
): Promise<DiscoveryRunResult> {
  const policyResult = await client.query<DiscoveryPolicyRow>(
    `SELECT id, workspace_id, access_scope_id, owner_actor_id, subject,
       project_resource_id, source_ids, concept_rules, minimum_source_diversity,
       model_route_policy_id, ontology_version_id
     FROM hypothesis_discovery_policies
     WHERE id = $1 AND status = 'active'
     FOR UPDATE`,
    [input.policyId],
  );
  const policy = policyResult.rows[0];
  if (!policy)
    throw new Error('The discovery policy is not active or could not be read');

  const runId = stableId(
    'hypothesis-discovery-run',
    `${policy.id}:${input.triggerRef}`,
  );
  const existingRun = await client.query<{
    documents_scanned: number;
    source_systems_scanned: number;
    candidates_formed: number;
    candidates_reobserved: number;
  }>(
    `SELECT documents_scanned, source_systems_scanned, candidates_formed,
       candidates_reobserved
     FROM hypothesis_discovery_runs
     WHERE workspace_id = $1 AND discovery_policy_id = $2 AND trigger_ref = $3`,
    [policy.workspace_id, policy.id, input.triggerRef],
  );
  if (existingRun.rows[0]) {
    return {
      runId,
      documentsScanned: existingRun.rows[0].documents_scanned,
      sourceSystemsScanned: existingRun.rows[0].source_systems_scanned,
      candidatesFormed: existingRun.rows[0].candidates_formed,
      candidatesReobserved: existingRun.rows[0].candidates_reobserved,
      candidatesSuperseded: 0,
      duplicateRun: true,
    };
  }

  await client.query(
    `INSERT INTO hypothesis_discovery_runs
      (id, workspace_id, access_scope_id, discovery_policy_id, trigger_ref, status,
       selected_route, ontology_version_id)
     VALUES ($1, $2, $3, $4, $5, 'running', 'no-model', $6)`,
    [
      runId,
      policy.workspace_id,
      policy.access_scope_id,
      policy.id,
      input.triggerRef,
      policy.ontology_version_id,
    ],
  );

  const documents = await loadPolicyDocuments(client, policy);
  const existingHypotheses = await client.query<{ canonical_name: string }>(
    `SELECT canonical_name FROM resources
     WHERE workspace_id = $1 AND access_scope_id = $2 AND semantic_type = 'Hypothesis'
       AND status = 'active'`,
    [policy.workspace_id, policy.access_scope_id],
  );
  const candidates = discoverHypotheses(documents, {
    subject: policy.subject,
    minimumSourceDiversity: policy.minimum_source_diversity,
    conceptRules: policy.concept_rules,
    existingHypotheses: existingHypotheses.rows.map(
      (item) => item.canonical_name,
    ),
  });
  const inputHash = createHash('sha256')
    .update(
      JSON.stringify(
        documents.map((document) => [
          document.resourceId,
          document.contentHash,
        ]),
      ),
    )
    .digest('hex');
  await recordDeterministicRouteDecision(client, {
    discoveryRunId: runId,
    discoveryJobId: input.jobId,
    taskFingerprint: `${policy.id}:${inputHash}:${runId}`,
    inputCharacters: documents.reduce((sum, item) => sum + item.body.length, 0),
    routePolicyId: policy.model_route_policy_id,
    accessScopeId: policy.access_scope_id,
    purpose: 'continual-hypothesis-discovery',
  });

  let formed = 0;
  let reobserved = 0;
  const observedHashes: string[] = [];
  for (const candidate of candidates) {
    const statementHash = createHash('sha256')
      .update(candidate.statement)
      .digest('hex');
    observedHashes.push(statementHash);
    const prior = await client.query<{
      id: string;
      status: 'proposed' | 'accepted' | 'dismissed' | 'superseded';
    }>(
      `SELECT id, status FROM hypothesis_discovery_candidates
       WHERE workspace_id = $1 AND discovery_policy_id = $2 AND statement_hash = $3
       FOR UPDATE`,
      [policy.workspace_id, policy.id, statementHash],
    );
    const previous = prior.rows[0];
    const candidateId =
      previous?.id ??
      stableId(
        'hypothesis-discovery-candidate',
        `${policy.id}:${statementHash}`,
      );
    const evidenceResourceIds = candidate.evidence.map(
      (item) => item.resourceId,
    );
    const sourceSystems = [
      ...new Set(candidate.evidence.map((item) => item.sourceSystem)),
    ];
    const reactivated = previous?.status === 'superseded';
    const observationKind = !previous
      ? 'formed'
      : reactivated
        ? 'reactivated'
        : 'reobserved';

    if (!previous) {
      formed += 1;
      await client.query(
        `INSERT INTO hypothesis_discovery_candidates
          (id, workspace_id, access_scope_id, discovery_policy_id, discovery_run_id,
           statement_hash, statement, rationale, concepts, evidence_resource_ids,
           source_uris, source_systems, predictions, falsification_conditions,
           confidence, novelty_score, source_diversity, process_name, process_version,
           last_observed_at, missing_run_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
           $13, $14, $15, $16, $17, $18, $19, now(), 0)`,
        [
          candidateId,
          policy.workspace_id,
          policy.access_scope_id,
          policy.id,
          runId,
          statementHash,
          candidate.statement,
          candidate.rationale,
          JSON.stringify(candidate.concepts),
          JSON.stringify(evidenceResourceIds),
          JSON.stringify(candidate.evidence.map((item) => item.sourceUri)),
          JSON.stringify(sourceSystems),
          JSON.stringify(candidate.predictions),
          JSON.stringify(candidate.falsificationConditions),
          candidate.confidence,
          candidate.noveltyScore,
          candidate.sourceDiversity,
          DISCOVERY_PROCESS.name,
          DISCOVERY_PROCESS.version,
        ],
      );
    } else {
      reobserved += 1;
      if (previous.status === 'proposed' || reactivated) {
        await client.query(
          `UPDATE hypothesis_discovery_candidates SET discovery_run_id = $2,
             rationale = $3, concepts = $4, evidence_resource_ids = $5,
             source_uris = $6, source_systems = $7, predictions = $8,
             falsification_conditions = $9, confidence = $10, novelty_score = $11,
             source_diversity = $12, status = 'proposed', reviewed_by = NULL,
             reviewed_at = NULL, last_observed_at = now(), missing_run_count = 0,
             updated_at = now()
           WHERE id = $1`,
          [
            candidateId,
            runId,
            candidate.rationale,
            JSON.stringify(candidate.concepts),
            JSON.stringify(evidenceResourceIds),
            JSON.stringify(candidate.evidence.map((item) => item.sourceUri)),
            JSON.stringify(sourceSystems),
            JSON.stringify(candidate.predictions),
            JSON.stringify(candidate.falsificationConditions),
            candidate.confidence,
            candidate.noveltyScore,
            candidate.sourceDiversity,
          ],
        );
      }
    }

    await client.query(
      `INSERT INTO hypothesis_discovery_candidate_observations
        (id, workspace_id, access_scope_id, candidate_id, discovery_run_id,
         observation_kind, evidence_resource_ids, source_systems, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (candidate_id, discovery_run_id) DO NOTHING`,
      [
        stableId('discovery-candidate-observation', `${candidateId}:${runId}`),
        policy.workspace_id,
        policy.access_scope_id,
        candidateId,
        runId,
        observationKind,
        JSON.stringify(evidenceResourceIds),
        JSON.stringify(sourceSystems),
        candidate.confidence,
      ],
    );
    await replaceObservationEvidenceLinks(client, {
      candidateId,
      workspaceId: policy.workspace_id,
      accessScopeId: policy.access_scope_id,
      evidenceResourceIds,
    });
    if (!previous || reactivated) {
      await client.query(
        `INSERT INTO notification_outbox
          (id, workspace_id, access_scope_id, monitor_policy_id, discovery_policy_id,
           recipient_actor_id, notification_type, severity, deduplication_key, payload)
         VALUES ($1, $2, $3, NULL, $4, $5, 'review-required', 'attention', $6, $7)
         ON CONFLICT (workspace_id, deduplication_key) DO NOTHING`,
        [
          stableId('notification', `discovery-review:${candidateId}:${runId}`),
          policy.workspace_id,
          policy.access_scope_id,
          policy.id,
          policy.owner_actor_id,
          `discovery-review:${candidateId}:${runId}`,
          {
            title: reactivated
              ? 'A previously stale pattern has returned'
              : 'A cross-source hypothesis is ready for review',
            candidateId,
            discoveryRunId: runId,
          },
        ],
      );
    }
  }

  const missing = await client.query<{ id: string }>(
    `UPDATE hypothesis_discovery_candidates SET
       missing_run_count = missing_run_count + 1,
       status = CASE WHEN missing_run_count + 1 >= 2 THEN 'superseded' ELSE status END,
       updated_at = now()
     WHERE discovery_policy_id = $1 AND status = 'proposed'
       AND NOT (statement_hash = ANY($2::text[]))
     RETURNING id`,
    [policy.id, observedHashes],
  );
  const candidatesSuperseded = missing.rows.length
    ? await client
        .query<{ count: string }>(
          `SELECT count(*)::text AS count FROM hypothesis_discovery_candidates
           WHERE id = ANY($1::uuid[]) AND status = 'superseded'`,
          [missing.rows.map((item) => item.id)],
        )
        .then((result) => Number(result.rows[0]?.count ?? 0))
    : 0;

  const sourceSystemsScanned = new Set(
    documents.map((document) => document.sourceId ?? document.sourceSystem),
  ).size;
  const rationale = candidates.length
    ? `${formed} new and ${reobserved} existing candidate observations crossed the governed source-diversity threshold.`
    : 'No candidate currently crosses the governed source-diversity threshold.';
  await client.query(
    `UPDATE hypothesis_discovery_runs SET status = $2, documents_scanned = $3,
       source_systems_scanned = $4, candidates_formed = $5,
       candidates_reobserved = $6, rationale = $7, finished_at = now()
     WHERE id = $1`,
    [
      runId,
      candidates.length ? 'completed' : 'no-candidate',
      documents.length,
      sourceSystemsScanned,
      formed,
      reobserved,
      rationale,
    ],
  );
  await client.query(
    `UPDATE hypothesis_discovery_policies SET last_successful_run_at = now(),
       updated_at = now() WHERE id = $1`,
    [policy.id],
  );
  return {
    runId,
    documentsScanned: documents.length,
    sourceSystemsScanned,
    candidatesFormed: formed,
    candidatesReobserved: reobserved,
    candidatesSuperseded,
    duplicateRun: false,
  };
}
