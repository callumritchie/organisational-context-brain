import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  analyzeScaleBenchmarkTables,
  evaluateScaleCorpus,
  ingestScaleCorpus,
  inspectScaleCorpusIntegrity,
  resetScaleBenchmarkWorkspace,
} from '@/src/modules/benchmarks/scale-database';
import { generateScaleCorpus } from '@/src/modules/benchmarks/scale-corpus';

describe('scale benchmark database', () => {
  it('ingests isolated histories and retrieves without permission leakage', async () => {
    const corpus = generateScaleCorpus({
      recordCount: 200,
      clientCount: 10,
      projectsPerClient: 2,
      questionProjectCount: 4,
      seed: 91,
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
      const integrity = await inspectScaleCorpusIntegrity(ownerClient);
      const evaluation = await evaluateScaleCorpus(corpus, 10);
      expect(loaded.records).toBe(200);
      expect(integrity.logical_records).toBe(200);
      expect(integrity.immutable_versions).toBeGreaterThan(200);
      expect(integrity.active_deleted_records).toBe(0);
      expect(integrity.stale_search_documents).toBe(0);
      expect(integrity.search_chunks).toBeGreaterThan(200);
      expect(integrity.multi_chunk_resources).toBeGreaterThan(0);
      expect(integrity.ambiguous_candidates).toBeGreaterThan(0);
      expect(evaluation.permissionLeakageCount).toBe(0);
      expect(evaluation.precisionAtLimit).toBe(1);
      expect(evaluation.meanReciprocalRank).toBe(1);
    } finally {
      ingestionClient.release();
      ownerClient.release();
      await Promise.all([ingestion.end(), owner.end()]);
    }
  }, 30_000);
});
