import {
  addVocabularyMismatchQuestions,
  generateScaleCorpus,
} from '@/src/modules/benchmarks/scale-corpus';
import { evaluateHypothesisMonitorBenchmark } from '@/src/modules/benchmarks/hypothesis-monitor-benchmark';

const corpus = addVocabularyMismatchQuestions(
  generateScaleCorpus({ recordCount: 10_000, seed: 20_260_908 }),
);
const result = evaluateHypothesisMonitorBenchmark(corpus);
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
