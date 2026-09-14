import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  aggregateHypothesisReviewerScores,
  createBlindHypothesisReviewPacket,
  createIndependentHypothesisCaseTemplate,
  evaluateHypothesisQualityMachineContract,
  generateHypothesisQualityCases,
  validateHypothesisReviewerScores,
  validateIndependentHypothesisCasePacket,
  type HypothesisQualityCase,
  type HypothesisReviewerScores,
  type IndependentHypothesisCasePacket,
} from '@/src/modules/benchmarks/hypothesis-quality-evaluation';

function stringArgument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const outputDirectory = path.resolve('.benchmark');
await mkdir(outputDirectory, { recursive: true });
const independentTemplatePath = path.join(
  outputDirectory,
  'hypothesis-quality-independent-cases.json',
);
await writeFile(
  independentTemplatePath,
  `${JSON.stringify(createIndependentHypothesisCaseTemplate(100), null, 2)}\n`,
  'utf8',
);

let cases = generateHypothesisQualityCases(100);
let caseSource: 'generated-baseline' | 'independently-authored' =
  'generated-baseline';
const independentCasesPath = stringArgument('--independent-cases');
if (independentCasesPath) {
  const packet: unknown = JSON.parse(
    await readFile(path.resolve(independentCasesPath), 'utf8'),
  );
  const errors = validateIndependentHypothesisCasePacket(packet);
  if (errors.length) {
    throw new Error(`Independent case validation failed:\n${errors.join('\n')}`);
  }
  const validPacket = packet as IndependentHypothesisCasePacket;
  cases = validPacket.cases.map(
    (item): HypothesisQualityCase => ({
      id: item.id,
      subject: item.subject,
      documents: item.documents,
      expectedBehavior: item.expectedBehavior!,
      expectedConceptIds: item.expectedConceptIds,
    }),
  );
  caseSource = 'independently-authored';
}

const machine = evaluateHypothesisQualityMachineContract(cases);
const reviewPacket = createBlindHypothesisReviewPacket(cases);
const reviewPacketPath = path.join(
  outputDirectory,
  'hypothesis-quality-blind-review.json',
);
await writeFile(
  reviewPacketPath,
  `${JSON.stringify(reviewPacket, null, 2)}\n`,
  'utf8',
);
const reviewerTemplatePath = path.join(
  outputDirectory,
  'hypothesis-quality-reviewer-template.json',
);
await writeFile(
  reviewerTemplatePath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      reviewer: {
        name: '',
        reviewedAt: '',
        independentReview: false,
        didNotSeeExpectedLabels: false,
      },
      reviews: reviewPacket.cases.map((item) => ({
        blindCaseId: item.blindCaseId,
        grounding: null,
        novelty: null,
        usefulness: null,
        falsifiability: null,
        contradictionHandling: null,
        actionability: null,
        unsupportedCandidate: false,
        missedMaterialPattern: false,
        notes: '',
      })),
    },
    null,
    2,
  )}\n`,
  'utf8',
);

const scorePaths = (stringArgument('--scores') ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
let humanReview = null;
if (scorePaths.length) {
  const reviewerScores: HypothesisReviewerScores[] = [];
  for (const scorePath of scorePaths) {
    const scores: unknown = JSON.parse(
      await readFile(path.resolve(scorePath), 'utf8'),
    );
    const errors = validateHypothesisReviewerScores(reviewPacket, scores);
    if (errors.length) {
      throw new Error(
        `Reviewer score validation failed for ${scorePath}:\n${errors.join('\n')}`,
      );
    }
    reviewerScores.push(scores as HypothesisReviewerScores);
  }
  humanReview = aggregateHypothesisReviewerScores(
    reviewPacket,
    reviewerScores,
  );
}

console.log(
  JSON.stringify(
    {
      caseSource,
      machine,
      humanReview,
      independentCaseTemplate: independentTemplatePath,
      blindReviewPacket: reviewPacketPath,
      reviewerScoreTemplate: reviewerTemplatePath,
      warning:
        caseSource === 'generated-baseline'
          ? 'Generated cases test the evaluation contract, not independent human quality.'
          : undefined,
    },
    null,
    2,
  ),
);
if (!machine.safetyContractPassed) process.exitCode = 1;
