import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { withActorTransaction } from '@/src/db/actor-transaction';
import { getIngestionPool } from '@/src/db/pool';
import { IDS, PERSONAS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import { ontologySchema, type OntologyDocument } from './ontology';

const semanticName = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Za-z0-9]{2,63}$/);
const relationshipName = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{2,63}$/);

export const ontologyChangeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('add-resource-type'),
      name: semanticName,
      resourceKind: z.enum(['entity', 'content']),
      description: z.string().trim().min(10).max(240),
    })
    .strict(),
  z
    .object({
      kind: z.literal('add-relationship'),
      name: relationshipName,
      from: z.array(semanticName).min(1).max(12),
      to: z.array(semanticName).min(1).max(12),
      description: z.string().trim().min(10).max(240),
    })
    .strict(),
  z
    .object({
      kind: z.literal('add-alias'),
      alias: z.string().trim().min(2).max(80),
      target: semanticName,
      description: z.string().trim().min(10).max(240),
    })
    .strict(),
]);

export const ontologyChangeSetSchema = z
  .array(ontologyChangeSchema)
  .min(1)
  .max(12);
export type OntologyChange = z.infer<typeof ontologyChangeSchema>;

export interface OntologyImpactAnalysis {
  affectedResourceIds: string[];
  affectedHypothesisIds: string[];
  evidenceCount: number;
  assertionCount: number;
  breakingChanges: number;
  replayAction: 're-evaluate-semantic-mappings';
}

export interface SemanticEvolutionState {
  currentOntology: { id: string; version: string; checksum: string };
  proposals: Array<{
    id: string;
    title: string;
    rationale: string;
    status: 'proposed' | 'approved' | 'rejected' | 'superseded';
    baseOntologyVersion: string;
    publishedOntologyVersion: string | null;
    proposedBy: string;
    reviewedBy: string | null;
    changeSet: OntologyChange[];
    impact: OntologyImpactAnalysis;
    evidenceResourceIds: string[];
    createdAt: string;
  }>;
  latestActivation: {
    proposalId: string;
    fromVersion: string;
    toVersion: string;
    status: string;
    replayContract: { action: string; result: string; ontologyVersion: string };
  } | null;
}

export class OntologyProposalPermissionError extends Error {}
export class OntologyProposalConflictError extends Error {}

export function applyOntologyChangeSet(
  rawDocument: OntologyDocument,
  rawChanges: OntologyChange[],
) {
  const changes = ontologyChangeSetSchema.parse(rawChanges);
  const document = ontologySchema.parse(rawDocument);
  const next: OntologyDocument = {
    resourceTypes: { ...document.resourceTypes },
    relationships: { ...document.relationships },
    aliases: { ...document.aliases },
  };
  for (const change of changes) {
    if (change.kind === 'add-resource-type') {
      if (next.resourceTypes[change.name]) {
        throw new OntologyProposalConflictError(
          `Resource type ${change.name} already exists`,
        );
      }
      next.resourceTypes[change.name] = {
        kind: change.resourceKind,
        description: change.description,
      };
    } else if (change.kind === 'add-relationship') {
      if (next.relationships[change.name]) {
        throw new OntologyProposalConflictError(
          `Relationship ${change.name} already exists`,
        );
      }
      for (const endpoint of [...change.from, ...change.to]) {
        if (!next.resourceTypes[endpoint]) {
          throw new OntologyProposalConflictError(
            `Relationship endpoint ${endpoint} is not a resource type`,
          );
        }
      }
      next.relationships[change.name] = {
        from: [...new Set(change.from)],
        to: [...new Set(change.to)],
        description: change.description,
      };
    } else {
      const alias = change.alias.toLowerCase();
      if (next.aliases[alias]) {
        throw new OntologyProposalConflictError(
          `Alias ${change.alias} already exists`,
        );
      }
      if (!next.resourceTypes[change.target]) {
        throw new OntologyProposalConflictError(
          `Alias target ${change.target} is not a resource type`,
        );
      }
      next.aliases[alias] = {
        target: change.target,
        description: change.description,
      };
    }
  }
  return ontologySchema.parse(next);
}

async function analyseImpact(
  client: PoolClient,
  changes: OntologyChange[],
  explicitEvidenceIds: string[],
): Promise<OntologyImpactAnalysis> {
  const aliases = changes
    .filter(
      (change): change is Extract<OntologyChange, { kind: 'add-alias' }> =>
        change.kind === 'add-alias',
    )
    .map((change) => `%${change.alias.toLowerCase()}%`);
  const matched = aliases.length
    ? await client.query<{ resource_id: string }>(
        `SELECT DISTINCT document.resource_id
         FROM search_documents document
         WHERE document.active AND lower(document.body) LIKE ANY($1::text[])`,
        [aliases],
      )
    : { rows: [] };
  const affectedResourceIds = [
    ...new Set([
      ...explicitEvidenceIds,
      ...matched.rows.map((row) => row.resource_id),
    ]),
  ];
  const assertionResult = affectedResourceIds.length
    ? await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM assertions
         WHERE subject_resource_id = ANY($1::uuid[])
            OR object_resource_id = ANY($1::uuid[])`,
        [affectedResourceIds],
      )
    : { rows: [{ count: '0' }] };
  const hypotheses = affectedResourceIds.length
    ? await client.query<{ id: string }>(
        `SELECT DISTINCT candidate.id
         FROM hypothesis_discovery_candidates candidate,
           jsonb_array_elements_text(candidate.evidence_resource_ids) evidence_id
         WHERE evidence_id = ANY($1::text[])`,
        [affectedResourceIds],
      )
    : { rows: [] };
  return {
    affectedResourceIds,
    affectedHypothesisIds: hypotheses.rows.map((row) => row.id),
    evidenceCount: explicitEvidenceIds.length,
    assertionCount: Number(assertionResult.rows[0]?.count ?? 0),
    breakingChanges: 0,
    replayAction: 're-evaluate-semantic-mappings',
  };
}

export async function proposeOntologyChange(
  client: PoolClient,
  input: {
    proposalId: string;
    accessScopeId: string;
    sourceCandidateId?: string;
    proposedBy: string;
    title: string;
    rationale: string;
    changes: OntologyChange[];
    evidenceResourceIds: string[];
  },
) {
  const changes = ontologyChangeSetSchema.parse(input.changes);
  const current = await client.query<{ id: string; schema_document: unknown }>(
    `SELECT id, schema_document FROM ontology_versions
     WHERE workspace_id = $1 AND status = 'current'`,
    [IDS.workspace],
  );
  if (!current.rows[0])
    throw new OntologyProposalConflictError('No current ontology is available');
  applyOntologyChangeSet(
    ontologySchema.parse(current.rows[0].schema_document),
    changes,
  );
  const impact = await analyseImpact(
    client,
    changes,
    input.evidenceResourceIds,
  );
  await client.query(
    `INSERT INTO ontology_change_proposals
      (id, workspace_id, access_scope_id, base_ontology_version_id,
       source_candidate_id, proposed_by, title, rationale, change_set,
       evidence_resource_ids, impact_analysis)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO NOTHING`,
    [
      input.proposalId,
      IDS.workspace,
      input.accessScopeId,
      current.rows[0].id,
      input.sourceCandidateId ?? null,
      input.proposedBy,
      input.title,
      input.rationale,
      JSON.stringify(changes),
      JSON.stringify([...new Set(input.evidenceResourceIds)]),
      JSON.stringify(impact),
    ],
  );
  return input.proposalId;
}

async function readState(client: PoolClient): Promise<SemanticEvolutionState> {
  const ontology = await client.query<{
    id: string;
    version: string;
    checksum: string;
  }>(
    `SELECT id, version, checksum FROM ontology_versions
     WHERE workspace_id = $1 AND status = 'current'`,
    [IDS.workspace],
  );
  if (!ontology.rows[0]) throw new Error('No current ontology is available');
  const proposals = await client.query<{
    id: string;
    title: string;
    rationale: string;
    status: SemanticEvolutionState['proposals'][number]['status'];
    base_version: string;
    published_version: string | null;
    proposed_by: string;
    reviewed_by: string | null;
    change_set: OntologyChange[];
    impact_analysis: OntologyImpactAnalysis;
    evidence_resource_ids: string[];
    created_at: Date;
  }>(
    `SELECT proposal.id, proposal.title, proposal.rationale, proposal.status,
       base.version AS base_version, published.version AS published_version,
       proposal.proposed_by, proposal.reviewed_by,
       proposal.change_set, proposal.impact_analysis, proposal.evidence_resource_ids,
       proposal.created_at
     FROM ontology_change_proposals proposal
     JOIN ontology_versions base ON base.id = proposal.base_ontology_version_id
     LEFT JOIN ontology_versions published ON published.id = proposal.published_ontology_version_id
     ORDER BY proposal.created_at DESC`,
  );
  const activation = await client.query<{
    proposal_id: string;
    from_version: string;
    to_version: string;
    status: string;
    replay_contract: {
      action: string;
      result: string;
      ontologyVersion: string;
    };
  }>(
    `SELECT activation.proposal_id, before.version AS from_version,
       after.version AS to_version, activation.status, activation.replay_contract
     FROM ontology_activation_runs activation
     JOIN ontology_versions before ON before.id = activation.from_ontology_version_id
     JOIN ontology_versions after ON after.id = activation.to_ontology_version_id
     ORDER BY activation.created_at DESC LIMIT 1`,
  );
  return {
    currentOntology: ontology.rows[0],
    proposals: proposals.rows.map((proposal) => ({
      id: proposal.id,
      title: proposal.title,
      rationale: proposal.rationale,
      status: proposal.status,
      baseOntologyVersion: proposal.base_version,
      publishedOntologyVersion: proposal.published_version,
      proposedBy:
        proposal.proposed_by === IDS.users.memoryAgent
          ? 'Hypothesis Monitor'
          : (PERSONAS.find((persona) => persona.id === proposal.proposed_by)
              ?.name ?? 'Governed service'),
      reviewedBy: proposal.reviewed_by
        ? (PERSONAS.find((persona) => persona.id === proposal.reviewed_by)
            ?.name ?? 'Authorised steward')
        : null,
      changeSet: proposal.change_set,
      impact: proposal.impact_analysis,
      evidenceResourceIds: proposal.evidence_resource_ids,
      createdAt: proposal.created_at.toISOString(),
    })),
    latestActivation: activation.rows[0]
      ? {
          proposalId: activation.rows[0].proposal_id,
          fromVersion: activation.rows[0].from_version,
          toVersion: activation.rows[0].to_version,
          status: activation.rows[0].status,
          replayContract: activation.rows[0].replay_contract,
        }
      : null,
  };
}

export async function getSemanticEvolutionState(actor: {
  id: string;
  workspaceId: string;
}) {
  return withActorTransaction(
    { actorId: actor.id, workspaceId: actor.workspaceId },
    readState,
  );
}

function nextVersion(currentVersion: string) {
  const match = /^(.*)-v(\d+)$/.exec(currentVersion);
  if (!match)
    throw new OntologyProposalConflictError(
      'The ontology version cannot be incremented',
    );
  return `${match[1]}-v${Number(match[2]) + 1}`;
}

async function withStewardTransaction<T>(
  actorId: string,
  callback: (client: PoolClient) => Promise<T>,
) {
  const client = await getIngestionPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_id', $1, true)", [
      actorId,
    ]);
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      IDS.workspace,
    ]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function reviewOntologyProposal(
  actor: { id: string; role: string; workspaceId: string },
  proposalId: string,
  decision: 'approve' | 'reject',
  reviewNote?: string,
) {
  if (actor.id !== IDS.users.alex || actor.role !== 'Project Lead') {
    throw new OntologyProposalPermissionError(
      'Only the Project Lead can review semantic changes',
    );
  }
  await withStewardTransaction(actor.id, (client) =>
    reviewOntologyProposalInTransaction(
      client,
      actor,
      proposalId,
      decision,
      reviewNote,
    ),
  );
  return getSemanticEvolutionState(actor);
}

export async function reviewOntologyProposalInTransaction(
  client: PoolClient,
  actor: { id: string; role: string },
  proposalId: string,
  decision: 'approve' | 'reject',
  reviewNote?: string,
) {
  if (actor.id !== IDS.users.alex || actor.role !== 'Project Lead') {
    throw new OntologyProposalPermissionError(
      'Only the Project Lead can review semantic changes',
    );
  }
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `ontology:${IDS.workspace}`,
  ]);
  const proposalResult = await client.query<{
    id: string;
    access_scope_id: string;
    base_ontology_version_id: string;
    change_set: OntologyChange[];
    evidence_resource_ids: string[];
    status: string;
  }>(
    `SELECT id, access_scope_id, base_ontology_version_id, change_set,
         evidence_resource_ids, status
       FROM ontology_change_proposals WHERE id = $1 FOR UPDATE`,
    [proposalId],
  );
  const proposal = proposalResult.rows[0];
  if (!proposal || proposal.status !== 'proposed') {
    throw new OntologyProposalConflictError(
      'The semantic proposal is no longer reviewable',
    );
  }
  if (decision === 'reject') {
    await client.query(
      `UPDATE ontology_change_proposals SET status = 'rejected', reviewed_by = $2,
           reviewed_at = now(), review_note = $3, updated_at = now() WHERE id = $1`,
      [
        proposalId,
        actor.id,
        reviewNote ?? 'Steward rejected the proposed semantic change.',
      ],
    );
    return;
  }
  const currentResult = await client.query<{
    id: string;
    version: string;
    schema_document: unknown;
  }>(
    `SELECT id, version, schema_document FROM ontology_versions
       WHERE workspace_id = $1 AND status = 'current' FOR UPDATE`,
    [IDS.workspace],
  );
  const current = currentResult.rows[0];
  if (!current || current.id !== proposal.base_ontology_version_id) {
    await client.query(
      `UPDATE ontology_change_proposals SET status = 'superseded', reviewed_by = $2,
           reviewed_at = now(), review_note = 'Base ontology changed before review.',
           updated_at = now() WHERE id = $1`,
      [proposalId, actor.id],
    );
    return;
  }
  const document = applyOntologyChangeSet(
    ontologySchema.parse(current.schema_document),
    proposal.change_set,
  );
  const impact = await analyseImpact(
    client,
    proposal.change_set,
    proposal.evidence_resource_ids,
  );
  const version = nextVersion(current.version);
  const versionId = stableId('ontology-version', version);
  const checksum = createHash('sha256')
    .update(JSON.stringify(document))
    .digest('hex');
  await client.query(
    `UPDATE ontology_versions SET status = 'superseded' WHERE id = $1`,
    [current.id],
  );
  await client.query(
    `INSERT INTO ontology_versions
        (id, workspace_id, version, status, schema_document, checksum,
         process_name, process_version, created_by)
       VALUES ($1, $2, $3, 'current', $4, $5,
         'governed-semantic-evolution', '1.0.0', $6)`,
    [versionId, IDS.workspace, version, document, checksum, actor.id],
  );
  for (const change of proposal.change_set) {
    if (change.kind !== 'add-alias') continue;
    await client.query(
      `INSERT INTO ontology_mapping_rules
          (id, workspace_id, ontology_version_id, proposal_id, alias,
           canonical_target, description, process_name, process_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
           'governed-semantic-evolution', '1.0.0')`,
      [
        stableId(
          'ontology-mapping-rule',
          `${version}:${change.alias.toLowerCase()}`,
        ),
        IDS.workspace,
        versionId,
        proposalId,
        change.alias.toLowerCase(),
        change.target,
        change.description,
      ],
    );
  }
  await client.query(
    `UPDATE ontology_change_proposals SET status = 'approved', reviewed_by = $2,
         reviewed_at = now(), review_note = $3, impact_analysis = $4,
         published_ontology_version_id = $5, updated_at = now() WHERE id = $1`,
    [
      proposalId,
      actor.id,
      reviewNote ?? 'Impact reviewed and additive change approved.',
      impact,
      versionId,
    ],
  );
  await client.query(
    `UPDATE hypothesis_discovery_policies SET ontology_version_id = $1,
         updated_at = now() WHERE workspace_id = $2`,
    [versionId, IDS.workspace],
  );
  await client.query(
    `INSERT INTO ontology_activation_runs
        (id, workspace_id, access_scope_id, proposal_id,
         from_ontology_version_id, to_ontology_version_id, status,
         affected_resource_ids, affected_hypothesis_ids, replay_contract)
       VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8, $9)`,
    [
      stableId('ontology-activation', `${proposalId}:${version}`),
      IDS.workspace,
      proposal.access_scope_id,
      proposalId,
      current.id,
      versionId,
      impact.affectedResourceIds,
      impact.affectedHypothesisIds,
      {
        action: impact.replayAction,
        result:
          'affected context re-evaluated; no existing canonical resource mutated',
        ontologyVersion: version,
      },
    ],
  );
}

export async function initializeSemanticEvolutionDemo() {
  const client = await getIngestionPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_id', $1, true)", [
      IDS.users.memoryAgent,
    ]);
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      IDS.workspace,
    ]);
    const candidate = await client.query<{
      id: string;
      evidence_resource_ids: string[];
    }>(
      `SELECT id, evidence_resource_ids FROM hypothesis_discovery_candidates
       WHERE discovery_policy_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [IDS.discoveryPolicies.supplierOnboarding],
    );
    if (!candidate.rows[0])
      throw new Error('The semantic demo needs a discovery candidate');
    const proposalId = stableId(
      'ontology-change-proposal',
      candidate.rows[0].id,
    );
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM ontology_change_proposals WHERE id = $1`,
      [proposalId],
    );
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return proposalId;
    }
    await proposeOntologyChange(client, {
      proposalId,
      accessScopeId: IDS.scopes.everyone,
      sourceCandidateId: candidate.rows[0].id,
      proposedBy: IDS.users.memoryAgent,
      title: 'Represent suppliers as a governed concept',
      rationale:
        'Five cross-source records repeatedly describe supplier and vendor actors, but the current ontology can only represent the onboarding project and its documents.',
      evidenceResourceIds: candidate.rows[0].evidence_resource_ids,
      changes: [
        {
          kind: 'add-resource-type',
          name: 'Supplier',
          resourceKind: 'entity',
          description:
            'An external organisation or person supplying goods or services.',
        },
        {
          kind: 'add-relationship',
          name: 'IS_ONBOARDED_THROUGH',
          from: ['Supplier'],
          to: ['Project'],
          description:
            'A supplier is enrolled through a governed onboarding project.',
        },
        {
          kind: 'add-alias',
          alias: 'vendor',
          target: 'Supplier',
          description:
            'Source-system use of vendor maps to the canonical Supplier type.',
        },
      ],
    });
    await client.query('COMMIT');
    return proposalId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
