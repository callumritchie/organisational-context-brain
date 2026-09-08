import { performance } from 'node:perf_hooks';
import type { PoolClient } from 'pg';
import { withActorTransaction } from '@/src/db/actor-transaction';
import { stableId } from '@/src/modules/canonical/stable-id';
import type { EmbeddingProvider } from '@/src/modules/embeddings/embedding-provider';
import { reciprocalRankFusion } from '@/src/modules/search/reciprocal-rank-fusion';
import type { BenchmarkQuestion, ScaleCorpus } from './scale-corpus';
import { SCALE_BENCHMARK_IDS } from './scale-database';

interface SampleRow {
  id: string;
  resource_id: string;
  record_id: string;
  body: string;
}

export interface SemanticBenchmarkSample {
  documents: SampleRow[];
  queryTexts: string[];
  requiredDocuments: number;
  distractorDocuments: number;
  sourceSystems: Record<string, number>;
  visibilityScopes: Record<string, number>;
  longDocumentChunks: number;
}

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function latencySummary(values: number[]) {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  };
}

export async function selectSemanticBenchmarkSample(
  client: PoolClient,
  corpus: ScaleCorpus,
  maximumInputs = 2_000,
): Promise<SemanticBenchmarkSample> {
  const queryTexts = [...new Set(corpus.questions.map((question) => question.query))].sort();
  const documentLimit = maximumInputs - queryTexts.length;
  if (documentLimit < 1) throw new Error('maximumInputs must leave room for at least one document');

  const result = await client.query<SampleRow>(
    `SELECT document.id, document.resource_id,
       resource.properties ->> 'benchmarkRecordId' AS record_id, document.body
     FROM search_documents document
     JOIN resources resource ON resource.id = document.resource_id
     WHERE document.workspace_id = $1 AND document.active
     ORDER BY document.id`,
    [SCALE_BENCHMARK_IDS.workspace],
  );
  const recordById = new Map(corpus.records.map((record) => [record.id, record]));
  const evaluatedProjects = new Set(corpus.questions.map((question) => question.canonicalProjectId));
  const required = result.rows.filter((row) => {
    const record = recordById.get(row.record_id);
    return record && evaluatedProjects.has(record.canonicalProjectId);
  });
  if (required.length > documentLimit) {
    throw new Error(`The ${required.length} required evaluation chunks exceed the ${documentLimit}-document cap`);
  }

  const selectedIds = new Set(required.map((row) => row.id));
  const strata = new Map<string, SampleRow[]>();
  for (const row of result.rows) {
    if (selectedIds.has(row.id)) continue;
    const record = recordById.get(row.record_id);
    if (!record) continue;
    const key = `${record.sourceSystem}:${record.visibility}:${record.versions.at(-1)!.body.length > 1_600}`;
    const rows = strata.get(key) ?? [];
    rows.push(row);
    strata.set(key, rows);
  }
  const distractors: SampleRow[] = [];
  const orderedStrata = [...strata.entries()].sort(([left], [right]) => left.localeCompare(right));
  while (required.length + distractors.length < documentLimit) {
    let added = false;
    for (const [, rows] of orderedStrata) {
      const row = rows.shift();
      if (!row) continue;
      distractors.push(row);
      added = true;
      if (required.length + distractors.length === documentLimit) break;
    }
    if (!added) break;
  }
  const documents = [...required, ...distractors];
  const counts = (selector: (recordId: string) => string) =>
    Object.fromEntries(
      documents.reduce((map, row) => {
        const key = selector(row.record_id);
        map.set(key, (map.get(key) ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
    );

  return {
    documents,
    queryTexts,
    requiredDocuments: required.length,
    distractorDocuments: distractors.length,
    sourceSystems: counts((recordId) => recordById.get(recordId)!.sourceSystem),
    visibilityScopes: counts((recordId) => recordById.get(recordId)!.visibility),
    longDocumentChunks: documents.filter(
      (row) => recordById.get(row.record_id)!.versions.at(-1)!.body.length > 1_600,
    ).length,
  };
}

interface ChannelResult {
  resource_id: string;
  rank: string;
}

interface EvaluationAccumulator {
  expectedReturned: number;
  totalReturned: number;
  totalExpected: number;
  forbiddenReturned: number;
  reciprocalRankTotal: number;
}

interface ChannelEvaluation {
  accumulator: EvaluationAccumulator;
  latencies: number[];
}

function addResult(
  accumulator: EvaluationAccumulator,
  returned: string[],
  question: BenchmarkQuestion,
) {
  const expected = new Set(question.expectedRecordIds);
  const forbidden = new Set(question.forbiddenRecordIds);
  accumulator.expectedReturned += returned.filter((id) => expected.has(id)).length;
  accumulator.forbiddenReturned += returned.filter((id) => forbidden.has(id)).length;
  accumulator.totalReturned += returned.length;
  accumulator.totalExpected += expected.size;
  const firstRelevant = returned.findIndex((id) => expected.has(id));
  accumulator.reciprocalRankTotal += firstRelevant === -1 ? 0 : 1 / (firstRelevant + 1);
}

function metrics(accumulator: EvaluationAccumulator, questionCount: number) {
  return {
    precisionAtLimit: accumulator.totalReturned
      ? accumulator.expectedReturned / accumulator.totalReturned
      : 0,
    recallAtLimit: accumulator.totalExpected
      ? accumulator.expectedReturned / accumulator.totalExpected
      : 0,
    meanReciprocalRank: questionCount
      ? accumulator.reciprocalRankTotal / questionCount
      : 0,
    permissionLeakageCount: accumulator.forbiddenReturned,
  };
}

function emptyAccumulator(): EvaluationAccumulator {
  return {
    expectedReturned: 0,
    totalReturned: 0,
    totalExpected: 0,
    forbiddenReturned: 0,
    reciprocalRankTotal: 0,
  };
}

function emptyChannelEvaluation(): ChannelEvaluation {
  return { accumulator: emptyAccumulator(), latencies: [] };
}

function channelMetrics(evaluation: ChannelEvaluation, questionCount: number) {
  return {
    ...metrics(evaluation.accumulator, questionCount),
    latencyMs: latencySummary(evaluation.latencies),
  };
}

function vectorLiteral(values: number[]) {
  return `[${values.join(',')}]`;
}

export async function evaluateSemanticBenchmark(
  corpus: ScaleCorpus,
  provider: EmbeddingProvider,
  limit = 20,
) {
  const uniqueQueries = [...new Set(corpus.questions.map((question) => question.query))].sort();
  const queryEmbeddingStartedAt = performance.now();
  const queryVectors = await provider.embed(uniqueQueries);
  const queryEmbeddingDurationMs = performance.now() - queryEmbeddingStartedAt;
  const vectorByQuery = new Map(
    uniqueQueries.map((query, index) => [query, vectorLiteral(queryVectors[index]!)]),
  );
  const recordIdByResourceId = new Map(
    corpus.records.map((record) => [
      stableId('benchmark-evidence-resource', record.id),
      record.id,
    ]),
  );
  const actorIds: Record<BenchmarkQuestion['actor'], string> = {
    alex: SCALE_BENCHMARK_IDS.users.alex,
    jamie: SCALE_BENCHMARK_IDS.users.jamie,
    morgan: SCALE_BENCHMARK_IDS.users.morgan,
  };
  const lexical = emptyAccumulator();
  const semantic = emptyAccumulator();
  const hybrid = emptyAccumulator();
  const lexicalLatencies: number[] = [];
  const semanticLatencies: number[] = [];
  const hybridLatencies: number[] = [];
  const cohorts = new Map<
    BenchmarkQuestion['cohort'],
    {
      questions: number;
      lexical: ChannelEvaluation;
      semantic: ChannelEvaluation;
      hybrid: ChannelEvaluation;
    }
  >();

  for (const actor of Object.keys(actorIds) as BenchmarkQuestion['actor'][]) {
    await withActorTransaction(
      { actorId: actorIds[actor], workspaceId: SCALE_BENCHMARK_IDS.workspace },
      async (client) => {
        for (const question of corpus.questions.filter((item) => item.actor === actor)) {
          const lexicalStartedAt = performance.now();
          const lexicalResult = await client.query<ChannelResult>(
            `SELECT resource_id, lexical_rank::text AS rank
             FROM permissioned_lexical_resource_search(phraseto_tsquery('english', $1), $2)
             ORDER BY lexical_rank`,
            [question.lexicalQuery, limit],
          );
          const lexicalDuration = performance.now() - lexicalStartedAt;
          lexicalLatencies.push(lexicalDuration);

          const semanticStartedAt = performance.now();
          const semanticResult = await client.query<ChannelResult>(
            `SELECT resource_id, semantic_rank::text AS rank
             FROM permissioned_semantic_resource_search($1::vector, $2, $3, $4)
             ORDER BY semantic_rank`,
            [vectorByQuery.get(question.query), provider.id, provider.model, limit],
          );
          const semanticDuration = performance.now() - semanticStartedAt;
          semanticLatencies.push(semanticDuration);
          hybridLatencies.push(lexicalDuration + semanticDuration);

          const lexicalRecords = lexicalResult.rows.flatMap((row) =>
            recordIdByResourceId.get(row.resource_id) ?? [],
          );
          const semanticRecords = semanticResult.rows.flatMap((row) =>
            recordIdByResourceId.get(row.resource_id) ?? [],
          );
          const lexicalRanks = new Map(lexicalRecords.map((id, index) => [id, index + 1]));
          const semanticRanks = new Map(semanticRecords.map((id, index) => [id, index + 1]));
          const hybridRecords = [...new Set([...lexicalRecords, ...semanticRecords])]
            .map((id) => ({
              id,
              score: reciprocalRankFusion(
                {
                  lexical: lexicalRanks.get(id) ?? null,
                  semantic: semanticRanks.get(id) ?? null,
                },
                true,
              ).score,
            }))
            .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
            .slice(0, limit)
            .map((item) => item.id);

          addResult(lexical, lexicalRecords, question);
          addResult(semantic, semanticRecords, question);
          addResult(hybrid, hybridRecords, question);
          const cohort = cohorts.get(question.cohort) ?? {
            questions: 0,
            lexical: emptyChannelEvaluation(),
            semantic: emptyChannelEvaluation(),
            hybrid: emptyChannelEvaluation(),
          };
          cohort.questions += 1;
          addResult(cohort.lexical.accumulator, lexicalRecords, question);
          addResult(cohort.semantic.accumulator, semanticRecords, question);
          addResult(cohort.hybrid.accumulator, hybridRecords, question);
          cohort.lexical.latencies.push(lexicalDuration);
          cohort.semantic.latencies.push(semanticDuration);
          cohort.hybrid.latencies.push(lexicalDuration + semanticDuration);
          cohorts.set(question.cohort, cohort);
        }
      },
    );
  }

  return {
    questions: corpus.questions.length,
    limit,
    queryEmbedding: {
      inputs: uniqueQueries.length,
      durationMs: queryEmbeddingDurationMs,
    },
    lexical: { ...metrics(lexical, corpus.questions.length), latencyMs: latencySummary(lexicalLatencies) },
    semantic: { ...metrics(semantic, corpus.questions.length), latencyMs: latencySummary(semanticLatencies) },
    hybrid: { ...metrics(hybrid, corpus.questions.length), latencyMs: latencySummary(hybridLatencies) },
    byCohort: Object.fromEntries(
      [...cohorts.entries()].map(([cohort, result]) => [
        cohort,
        {
          questions: result.questions,
          lexical: channelMetrics(result.lexical, result.questions),
          semantic: channelMetrics(result.semantic, result.questions),
          hybrid: channelMetrics(result.hybrid, result.questions),
        },
      ]),
    ),
  };
}
