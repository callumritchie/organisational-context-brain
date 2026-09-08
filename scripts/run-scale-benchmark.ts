import dotenv from 'dotenv';
import { getAppPool, getIngestionPool, getOwnerPool } from '@/src/db/pool';
import {
  analyzeScaleBenchmarkTables,
  evaluateScaleCorpus,
  ingestScaleCorpus,
  inspectScaleCorpusIntegrity,
  resetScaleBenchmarkWorkspace,
} from '@/src/modules/benchmarks/scale-database';
import {
  generateScaleCorpus,
  summarizeScaleCorpus,
  validateScaleCorpus,
} from '@/src/modules/benchmarks/scale-corpus';

dotenv.config({ path: '.env.local', quiet: true });

function integerArgument(name: string, fallback: number) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value))
    throw new Error(`${name} must be followed by an integer`);
  return value;
}

const corpus = generateScaleCorpus({
  recordCount: integerArgument('--records', 10_000),
  seed: integerArgument('--seed', 20_260_908),
  questionProjectCount: integerArgument('--question-projects', 25),
});
const validationErrors = validateScaleCorpus(corpus);
if (validationErrors.length) throw new Error(validationErrors.join('\n'));

const ownerPool = getOwnerPool();
const ownerClient = await ownerPool.connect();
try {
  await resetScaleBenchmarkWorkspace(ownerClient);
} finally {
  ownerClient.release();
}

const ingestionPool = getIngestionPool();
const ingestionClient = await ingestionPool.connect();
let ingestion;
try {
  ingestion = await ingestScaleCorpus(ingestionClient, corpus);
} finally {
  ingestionClient.release();
  await ingestionPool.end();
}

const inspectionClient = await ownerPool.connect();
let integrity;
try {
  await analyzeScaleBenchmarkTables(inspectionClient);
  // Measure against fresh planner statistics rather than autovacuum timing.
  integrity = await inspectScaleCorpusIntegrity(inspectionClient);
} finally {
  inspectionClient.release();
}

const evaluation = await evaluateScaleCorpus(corpus);
await Promise.all([ownerPool.end(), getAppPool().end()]);

console.log(
  JSON.stringify(
    {
      corpus: summarizeScaleCorpus(corpus),
      ingestion,
      integrity,
      retrieval: evaluation,
    },
    null,
    2,
  ),
);
