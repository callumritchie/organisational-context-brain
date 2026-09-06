import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withActorTransaction } from '@/src/db/actor-transaction';
import { IDS } from '@/src/modules/canonical/ids';
import { understandQuery } from '@/src/modules/search/query-understanding';
import { DEMO_RANKING_V1, scoreCandidate } from '@/src/modules/ranking/demo-ranking-v1';
import type { ContextEvidence, ContextRequest, ContextResponse } from './types';

interface CandidateRow {
  evidence_id: string;
  evidence_title: string;
  evidence_summary: string;
  stance: 'SUPPORTS' | 'CONTRADICTS';
  assertion_id: string;
  assertion_kind: 'source-backed' | 'rule-derived' | 'AI-inferred';
  process_name: string;
  process_version: string;
  confidence: number;
  source_title: string;
  source_uri: string;
  source_type: string;
  source_updated_at: Date;
  excerpt: string;
  lexical_score: number;
  authority: number;
  freshness: number;
}

async function retrieve(client: PoolClient, tsQuery: string, maxEvidence: number) {
  const result = await client.query<CandidateRow>(
    `WITH query AS (SELECT to_tsquery('english', $1) AS value), candidates AS (
      SELECT evidence.id AS evidence_id,
        evidence.canonical_name AS evidence_title,
        evidence.summary AS evidence_summary,
        assertion_row.predicate AS stance,
        assertion_row.id AS assertion_id,
        assertion_row.assertion_kind,
        assertion_row.process_name,
        assertion_row.process_version,
        assertion_row.confidence,
        source_content.canonical_name AS source_title,
        source_object.source_uri,
        source_system.source_type,
        source_object.source_updated_at,
        provenance.excerpt,
        ts_rank_cd(document.search_vector, query.value, 32) AS lexical_score,
        document.authority,
        greatest(0, 1 - extract(epoch FROM (now() - document.source_updated_at)) / 15552000) AS freshness
      FROM search_documents document
      CROSS JOIN query
      JOIN resources evidence ON evidence.id = document.resource_id
      JOIN assertions assertion_row ON assertion_row.id = document.assertion_id
      JOIN provenance_spans provenance ON provenance.assertion_id = assertion_row.id
      JOIN source_object_versions source_version ON source_version.id = provenance.source_object_version_id
      JOIN source_objects source_object ON source_object.id = source_version.source_object_id
      JOIN sources source_system ON source_system.id = source_object.source_id
      JOIN content_versions content_version ON content_version.id = document.content_version_id
      JOIN resources source_content ON source_content.id = content_version.content_resource_id
      WHERE document.search_vector @@ query.value
        AND assertion_row.predicate IN ('SUPPORTS', 'CONTRADICTS')
    )
    SELECT * FROM candidates ORDER BY lexical_score DESC, authority DESC LIMIT $2`,
    [tsQuery, maxEvidence],
  );
  return result.rows;
}

interface AliasRow {
  id: string;
  name: string;
  type: string;
  alias: string;
  alias_type: string;
}

async function resolveAliases(client: PoolClient, query: string) {
  const rows = await client.query<AliasRow>(
    `SELECT resource.id, resource.canonical_name AS name, resource.semantic_type AS type,
      alias.alias, alias.alias_type
     FROM entity_aliases alias
     JOIN resources resource ON resource.id = alias.resource_id
     ORDER BY length(alias.alias) DESC`,
  );
  const lowerQuery = query.toLowerCase();
  const normalisedQuery = lowerQuery.replace(/[^a-z0-9]+/g, ' ').trim();
  const candidates = rows.rows
    .filter((row) => normalisedQuery.includes(row.alias.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()))
    .sort((left, right) => {
      const exactDifference = Number(lowerQuery.includes(right.alias.toLowerCase()))
        - Number(lowerQuery.includes(left.alias.toLowerCase()));
      return exactDifference || right.alias.length - left.alias.length;
    });
  const matched = new Set<string>();
  return candidates.flatMap((row) => {
    if (matched.has(row.id)) return [];
    matched.add(row.id);
    return [{
      id: row.id,
      name: row.name,
      type: row.type,
      matchedAlias: row.alias,
      aliasType: row.alias_type,
    }];
  });
}

interface GraphRow {
  id: string;
  source: string;
  target: string;
  relationship_type: string;
  assertion_kind: 'source-backed' | 'rule-derived' | 'AI-inferred';
  confidence: number;
  source_label: string;
  source_type: string;
  target_label: string;
  target_type: string;
}

async function buildGraph(client: PoolClient, evidenceIds: string[]) {
  const result = await client.query<GraphRow>(
    `WITH focus(id) AS (
       SELECT unnest($1::uuid[])
       UNION SELECT unnest($2::uuid[])
     )
     SELECT relationship.id,
       relationship.from_resource_id AS source,
       relationship.to_resource_id AS target,
       relationship.relationship_type,
       visible_assertion.assertion_kind,
       visible_assertion.confidence,
       source_resource.canonical_name AS source_label,
       source_resource.semantic_type AS source_type,
       target_resource.canonical_name AS target_label,
       target_resource.semantic_type AS target_type
     FROM relationships relationship
     JOIN resources source_resource ON source_resource.id = relationship.from_resource_id
     JOIN resources target_resource ON target_resource.id = relationship.to_resource_id
     JOIN LATERAL (
       SELECT assertion_row.assertion_kind, assertion_row.confidence
       FROM assertions assertion_row
       WHERE assertion_row.relationship_id = relationship.id
       ORDER BY assertion_row.confidence DESC
       LIMIT 1
     ) visible_assertion ON true
     WHERE relationship.from_resource_id IN (SELECT id FROM focus)
        OR relationship.to_resource_id IN (SELECT id FROM focus)
     ORDER BY relationship.relationship_type, source_resource.canonical_name`,
    [evidenceIds, [IDS.resources.project, IDS.resources.atlas, IDS.resources.hypothesis]],
  );
  const nodes = new Map<string, { id: string; label: string; type: string }>();
  for (const row of result.rows) {
    nodes.set(row.source, { id: row.source, label: row.source_label, type: row.source_type });
    nodes.set(row.target, { id: row.target, label: row.target_label, type: row.target_type });
  }
  return {
    nodes: [...nodes.values()],
    edges: result.rows.map((row) => ({
      id: row.id,
      source: row.source,
      target: row.target,
      type: row.relationship_type,
      assertionKind: row.assertion_kind,
      confidence: row.confidence,
    })),
  };
}

function normaliseLexical(rows: CandidateRow[], value: number) {
  const maximum = Math.max(...rows.map((row) => row.lexical_score), 0.0001);
  return value / maximum;
}

function deterministicSummary(evidence: ContextEvidence[]) {
  const supporting = evidence.filter((item) => item.stance === 'SUPPORTS');
  const contradicting = evidence.filter((item) => item.stance === 'CONTRADICTS');
  const lead = supporting.length
    ? `Current evidence points most strongly to friction in identity verification: ${supporting[0].summary.toLowerCase()} [1]`
    : 'The accessible corpus does not yet contain direct supporting evidence for the current hypothesis.';
  if (!contradicting.length) {
    return `${lead} ${supporting.length > 1 ? `A second source reinforces this pattern: ${supporting[1].summary.toLowerCase()} [2]` : ''} No actor-visible research in this context directly contradicts the hypothesis.`.trim();
  }
  return `${lead} However, newer evidence disputes a single-cause explanation: ${contradicting[0].summary.toLowerCase()} [${evidence.indexOf(contradicting[0]) + 1}] The organisation should treat the current view as contested.`;
}

export async function assembleContext(
  actor: { id: string; workspaceId: string; name: string; role: string },
  request: ContextRequest,
): Promise<ContextResponse> {
  const parsedQuery = understandQuery(request.query);
  return withActorTransaction({ actorId: actor.id, workspaceId: actor.workspaceId }, async (client) => {
    const aliases = await resolveAliases(client, request.query);
    const interpreted = understandQuery(request.query, aliases);
    const traceId = randomUUID();
    await client.query(
      `INSERT INTO query_traces (id, workspace_id, actor_id, query_text, ranking_version)
       VALUES ($1, $2, $3, $4, $5)`,
      [traceId, actor.workspaceId, actor.id, request.query, DEMO_RANKING_V1.id],
    );
    const eligible = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM resources WHERE workspace_id = $1`,
      [actor.workspaceId],
    );
    const rows = await retrieve(client, parsedQuery.tsQuery, request.maxEvidence);
    const evidence = rows
      .map((row): ContextEvidence => {
        const ranking = scoreCandidate({
          lexical: normaliseLexical(rows, row.lexical_score),
          authority: row.authority,
          confidence: row.confidence,
          freshness: Number(row.freshness),
        });
        return {
          id: row.evidence_id,
          title: row.evidence_title,
          summary: row.evidence_summary,
          stance: row.stance,
          confidence: row.confidence,
          source: {
            title: row.source_title,
            uri: row.source_uri,
            type: row.source_type,
            updatedAt: row.source_updated_at.toISOString(),
            excerpt: row.excerpt,
          },
          provenance: {
            assertionId: row.assertion_id,
            assertionKind: row.assertion_kind,
            process: row.process_name,
            processVersion: row.process_version,
          },
          ranking: { ...ranking.contributions, total: ranking.total },
        };
      })
      .sort((a, b) => b.ranking.total - a.ranking.total);
    const graph = await buildGraph(client, evidence.map((item) => item.id));
    const trace = [
      { stage: 'Query', detail: aliases.length
        ? `Resolved “${aliases[0].matchedAlias}” to Atlas Bank, plus Atlas Onboarding and the active hypothesis.`
        : 'Detected Atlas Bank, Atlas Onboarding and the active abandonment hypothesis.', count: interpreted.entities.length },
      { stage: 'Actor & security scope', detail: `Workspace verified; user and group ACLs applied. ${eligible.rows[0]?.count ?? 0} resources eligible.`, count: Number(eligible.rows[0]?.count ?? 0) },
      { stage: 'Retrieval', detail: `${rows.length} permitted lexical candidates. Inaccessible candidates never entered the pipeline.`, count: rows.length },
      { stage: 'Ranking', detail: `${DEMO_RANKING_V1.id} exposed lexical, authority, confidence and freshness contributions.`, count: evidence.length },
      { stage: 'Graph expansion', detail: `${graph.edges.length} actor-visible edges connect selected evidence across sources.`, count: graph.edges.length },
      { stage: 'Context selection', detail: `${evidence.length} evidence items selected within the requested budget.`, count: evidence.length },
    ];
    for (const [index, stage] of trace.entries()) {
      await client.query(
        `INSERT INTO trace_stages (id, trace_id, workspace_id, actor_id, stage, ordinal, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), traceId, actor.workspaceId, actor.id, stage.stage, index, stage],
      );
    }
    return {
      traceId,
      actor: { id: actor.id, name: actor.name, role: actor.role },
      interpretedQuery: { intent: interpreted.intent, entities: interpreted.entities },
      summary: deterministicSummary(evidence),
      evidence,
      relationships: evidence.map((item) => ({
        from: item.title,
        type: item.stance,
        to: 'Identity verification drives abandonment',
      })),
      graph,
      sources: evidence.map((item) => ({ title: item.source.title, uri: item.source.uri, updatedAt: item.source.updatedAt })),
      trace,
      rankingVersion: DEMO_RANKING_V1.id,
      generatedBy: 'deterministic-extractive',
    };
  });
}
