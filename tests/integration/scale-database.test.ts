import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  analyzeScaleBenchmarkTables,
  applyScaleUpdateBatch,
  evaluateScaleCorpus,
  ingestScaleCorpus,
  inspectScaleCorpusIntegrity,
  resetScaleBenchmarkWorkspace,
  SCALE_BENCHMARK_IDS,
} from '@/src/modules/benchmarks/scale-database';
import {
  addVocabularyMismatchQuestions,
  generateScaleCorpus,
  generateScaleUpdateBatch,
} from '@/src/modules/benchmarks/scale-corpus';
import { selectSemanticBenchmarkSample } from '@/src/modules/benchmarks/semantic-benchmark';

describe('scale benchmark database', () => {
  it('ingests isolated histories and retrieves without permission leakage', async () => {
    const corpus = addVocabularyMismatchQuestions(
      generateScaleCorpus({
        recordCount: 200,
        clientCount: 10,
        projectsPerClient: 2,
        questionProjectCount: 4,
        seed: 91,
      }),
    );
    const updateBatch = generateScaleUpdateBatch(corpus, {
      updateCount: 20,
      deletionEvery: 5,
    });
    const owner = new Pool({
      connectionString: process.env.DATABASE_URL_OWNER,
    });
    const ingestion = new Pool({
      connectionString: process.env.DATABASE_URL_INGEST,
    });
    const ownerClient = await owner.connect();
    const ingestionClient = await ingestion.connect();
    try {
      await resetScaleBenchmarkWorkspace(ownerClient);
      const loaded = await ingestScaleCorpus(ingestionClient, corpus);
      await analyzeScaleBenchmarkTables(ownerClient);
      const beforeUpdate = await inspectScaleCorpusIntegrity(ownerClient);
      const incremental = await applyScaleUpdateBatch(ingestionClient, updateBatch);
      await analyzeScaleBenchmarkTables(ownerClient);
      const integrity = await inspectScaleCorpusIntegrity(ownerClient);
      await applyScaleUpdateBatch(ingestionClient, updateBatch);
      const replayIntegrity = await inspectScaleCorpusIntegrity(ownerClient);
      const semanticSample = await selectSemanticBenchmarkSample(
        ownerClient,
        updateBatch.corpus,
        100,
      );
      const advancedSources = await ownerClient.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM sources
         WHERE workspace_id = $1 AND cursor LIKE '%-incremental-20'`,
        [SCALE_BENCHMARK_IDS.workspace],
      );
      const evaluation = await evaluateScaleCorpus(updateBatch.corpus, 10);
      expect(loaded.records).toBe(200);
      expect(incremental).toMatchObject({ records: 20, revisions: 16, deletions: 4, versions: 16 });
      expect(incremental.recordsPerSecond).toBeGreaterThan(0);
      expect(integrity.logical_records).toBe(200);
      expect(integrity.immutable_versions).toBe(beforeUpdate.immutable_versions + 16);
      expect(integrity.active_deleted_records).toBe(0);
      expect(integrity.stale_search_documents).toBe(0);
      expect(integrity.current_version_violations).toBe(0);
      expect(integrity.search_chunks).toBe(beforeUpdate.search_chunks + incremental.chunks);
      expect(integrity.inactive_search_chunks)
        .toBeGreaterThanOrEqual(beforeUpdate.inactive_search_chunks + updateBatch.records.length);
      expect(integrity.multi_chunk_resources).toBeGreaterThan(0);
      expect(replayIntegrity.immutable_versions).toBe(integrity.immutable_versions);
      expect(replayIntegrity.search_chunks).toBe(integrity.search_chunks);
      expect(replayIntegrity.stale_search_documents).toBe(0);
      expect(replayIntegrity.current_version_violations).toBe(0);
      expect(advancedSources.rows[0]?.count).toBe('5');
      expect(semanticSample.documents.length + semanticSample.queryTexts.length).toBe(100);
      expect(semanticSample.queryTexts).toHaveLength(8);
      expect(semanticSample.requiredDocuments).toBeGreaterThan(0);
      expect(semanticSample.distractorDocuments).toBeGreaterThan(0);
      expect(integrity.ambiguous_candidates).toBeGreaterThan(0);
      expect(evaluation.permissionLeakageCount).toBe(0);
      expect(evaluation.byCohort['exact-name'].precisionAtLimit).toBe(1);
      expect(evaluation.byCohort['exact-name'].meanReciprocalRank).toBe(1);
      expect(evaluation.byCohort['vocabulary-mismatch'].questions).toBe(12);
      expect(evaluation.byCohort['vocabulary-mismatch'].permissionLeakageCount).toBe(0);
    } finally {
      ingestionClient.release();
      ownerClient.release();
      await Promise.all([ingestion.end(), owner.end()]);
    }
  }, 30_000);
});
