import { performance } from 'node:perf_hooks';
import dotenv from 'dotenv';
import {
  getAppPool,
  getIngestionPool,
  getOwnerPool,
} from '@/src/db/pool';
import {
  analyzeScaleBenchmarkTables,
  applyScaleUpdateBatch,
  ingestScaleCorpus,
  resetScaleBenchmarkWorkspace,
  SCALE_BENCHMARK_IDS,
} from '@/src/modules/benchmarks/scale-database';
import {
  addVocabularyMismatchQuestions,
  generateScaleCorpus,
  generateScaleUpdateBatch,
} from '@/src/modules/benchmarks/scale-corpus';
import {
  evaluateSemanticBenchmark,
  selectSemanticBenchmarkSample,
} from '@/src/modules/benchmarks/semantic-benchmark';
import {
  createOpenAIEmbeddingProvider,
  type EmbeddingUsage,
} from '@/src/modules/embeddings/embedding-provider';
import { syncSearchEmbeddings } from '@/src/modules/embeddings/embedding-indexer';

dotenv.config({ path: '.env.local', quiet: true });

if (!process.argv.includes('--confirm-synthetic-egress')) {
  throw new Error('Pass --confirm-synthetic-egress only after approving the synthetic benchmark transfer');
}
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY is required');
const maximumInputs = 2_000;
const usage: EmbeddingUsage & { requests: number } = {
  promptTokens: 0,
  totalTokens: 0,
  requests: 0,
};
const provider = createOpenAIEmbeddingProvider({
  apiKey,
  model: process.env.OPENAI_EMBEDDING_MODEL,
  onUsage: (item) => {
    usage.promptTokens += item.promptTokens;
    usage.totalTokens += item.totalTokens;
    usage.requests += 1;
  },
});
const corpus = addVocabularyMismatchQuestions(generateScaleCorpus());
const updateBatch = generateScaleUpdateBatch(corpus);
const ownerPool = getOwnerPool();
const ownerClient = await ownerPool.connect();
try {
  await resetScaleBenchmarkWorkspace(ownerClient);
} finally {
  ownerClient.release();
}

const ingestionPool = getIngestionPool();
const ingestionClient = await ingestionPool.connect();
try {
  await ingestScaleCorpus(ingestionClient, corpus);
  await applyScaleUpdateBatch(ingestionClient, updateBatch);
} finally {
  ingestionClient.release();
}

const preparationClient = await ownerPool.connect();
let sample;
try {
  await analyzeScaleBenchmarkTables(preparationClient);
  sample = await selectSemanticBenchmarkSample(
    preparationClient,
    updateBatch.corpus,
    maximumInputs,
  );
} finally {
  preparationClient.release();
}
if (sample.documents.length + sample.queryTexts.length > maximumInputs) {
  throw new Error('Semantic benchmark input cap exceeded');
}

const embeddingClient = await ingestionPool.connect();
const indexingStartedAt = performance.now();
let indexing;
try {
  await embeddingClient.query('BEGIN');
  await embeddingClient.query("SELECT set_config('app.actor_id', $1, true)", [
    SCALE_BENCHMARK_IDS.users.ingestion,
  ]);
  await embeddingClient.query("SELECT set_config('app.workspace_id', $1, true)", [
    SCALE_BENCHMARK_IDS.workspace,
  ]);
  indexing = await syncSearchEmbeddings(embeddingClient, provider, {
    documentIds: sample.documents.map((document) => document.id),
  });
  await embeddingClient.query('COMMIT');
} catch (error) {
  await embeddingClient.query('ROLLBACK');
  throw error;
} finally {
  embeddingClient.release();
  await ingestionPool.end();
}
const indexingDurationMs = performance.now() - indexingStartedAt;
const evaluation = await evaluateSemanticBenchmark(updateBatch.corpus, provider);

const storageClient = await ownerPool.connect();
let storage;
try {
  const result = await storageClient.query<{
    embeddings: string;
    vector_bytes: string;
  }>(
    `SELECT count(*)::text AS embeddings,
       coalesce(sum(pg_column_size(embedding)), 0)::text AS vector_bytes
     FROM search_embeddings
     WHERE workspace_id = $1 AND is_current AND provider = $2 AND model = $3`,
    [SCALE_BENCHMARK_IDS.workspace, provider.id, provider.model],
  );
  storage = {
    embeddings: Number(result.rows[0]!.embeddings),
    vectorBytes: Number(result.rows[0]!.vector_bytes),
  };
} finally {
  storageClient.release();
  await Promise.all([ownerPool.end(), getAppPool().end()]);
}

console.log(JSON.stringify({
  model: provider.model,
  dimensions: provider.dimensions,
  sample: {
    documentChunks: sample.documents.length,
    queryInputs: sample.queryTexts.length,
    totalExternalInputs: sample.documents.length + sample.queryTexts.length,
    requiredDocuments: sample.requiredDocuments,
    distractorDocuments: sample.distractorDocuments,
    longDocumentChunks: sample.longDocumentChunks,
    sourceSystems: sample.sourceSystems,
    visibilityScopes: sample.visibilityScopes,
  },
  indexing: { ...indexing, durationMs: indexingDurationMs },
  usage: {
    ...usage,
    pricePerMillionTokensUsd: 0.02,
    estimatedCostUsd: usage.promptTokens * 0.02 / 1_000_000,
  },
  storage,
  retrieval: evaluation,
}, null, 2));
