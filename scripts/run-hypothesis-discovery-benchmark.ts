import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  evaluateHypothesisDiscoveryBenchmark,
  generateHypothesisDiscoveryCases,
} from '@/src/modules/benchmarks/hypothesis-discovery-benchmark';

const result = evaluateHypothesisDiscoveryBenchmark(
  generateHypothesisDiscoveryCases(50),
);
const outputDirectory = path.join(process.cwd(), '.benchmark');
const reviewPath = path.join(
  outputDirectory,
  'hypothesis-discovery-review.json',
);
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  reviewPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      rubricScale: '1 (poor) to 5 (excellent)',
      instructions:
        'Score each candidate without changing the source records. Empty scores mean human review has not yet happened.',
      cases: result.reviewPacket,
    },
    null,
    2,
  )}\n`,
  'utf8',
);
console.log(
  JSON.stringify(
    {
      passed: result.passed,
      casesEvaluated: result.casesEvaluated,
      candidatesFormed: result.candidatesFormed,
      primaryConceptsCorrect: result.primaryConceptsCorrect,
      groundedCandidates: result.groundedCandidates,
      crossSourceCandidates: result.crossSourceCandidates,
      falsifiableCandidates: result.falsifiableCandidates,
      modelRoute: result.modelRoute,
      externalTokens: result.externalTokens,
      externalCostMicros: result.externalCostMicros,
      humanReviewPacket: reviewPath,
    },
    null,
    2,
  ),
);
if (!result.passed) process.exitCode = 1;
