import { stableId } from '@/src/modules/canonical/stable-id';
import { discoverHypotheses } from '@/src/modules/discovery/hypothesis-discovery';
import type { DiscoveryDocument } from '@/src/modules/discovery/types';
import {
  DISCOVERY_BENCHMARK_RULES,
  DISCOVERY_BENCHMARK_SOURCE_SYSTEMS,
} from './hypothesis-discovery-benchmark';

export type ExpectedDiscoveryBehavior =
  | 'candidate'
  | 'contested-candidate'
  | 'no-candidate';

export interface HypothesisQualityCase {
  id: string;
  subject: string;
  documents: DiscoveryDocument[];
  expectedBehavior: ExpectedDiscoveryBehavior;
  expectedConceptIds: string[];
}

export interface IndependentHypothesisCasePacket {
  schemaVersion: 1;
  instructions: string[];
  authorship: {
    author: string;
    authoredAt: string;
    independentlyAuthored: boolean;
    didNotInspectImplementation: boolean;
  };
  cases: Array<{
    id: string;
    subject: string;
    documents: DiscoveryDocument[];
    expectedBehavior: ExpectedDiscoveryBehavior | null;
    expectedConceptIds: string[];
    adjudicationNotes: string;
  }>;
}

export interface BlindHypothesisReviewPacket {
  schemaVersion: 1;
  rubricScale: string;
  instructions: string[];
  cases: Array<{
    blindCaseId: string;
    subject: string;
    sourceRecords: DiscoveryDocument[];
    candidate: ReturnType<typeof discoverHypotheses>[number] | null;
  }>;
}

export interface HypothesisReviewerScores {
  schemaVersion: 1;
  reviewer: {
    name: string;
    reviewedAt: string;
    independentReview: boolean;
    didNotSeeExpectedLabels: boolean;
  };
  reviews: Array<{
    blindCaseId: string;
    grounding: number | null;
    novelty: number | null;
    usefulness: number | null;
    falsifiability: number | null;
    contradictionHandling: number | null;
    actionability: number | null;
    unsupportedCandidate: boolean;
    missedMaterialPattern: boolean;
    notes: string;
  }>;
}

const contradictionSentences = [
  'A controlled follow-up removed that condition, but the delay did not improve.',
  'A comparable team avoided that condition and still experienced the same outcome.',
  'The newest measurement explicitly disputes this as a complete explanation.',
];

function benchmarkDocument(
  caseIndex: number,
  sourceSystem: string,
  body: string,
): DiscoveryDocument {
  return {
    resourceId: `quality-${caseIndex + 1}-${sourceSystem}`,
    sourceUri: `${sourceSystem}://quality/case-${caseIndex + 1}`,
    sourceId: `quality-source-${sourceSystem}`,
    sourceSystem,
    title: `Operational case ${String(caseIndex + 1).padStart(3, '0')} ${sourceSystem} record`,
    body,
  };
}

export function generateHypothesisQualityCases(
  count = 100,
): HypothesisQualityCase[] {
  return Array.from({ length: count }, (_, index) => {
    const mode = index % 5;
    const primary =
      DISCOVERY_BENCHMARK_RULES[index % DISCOVERY_BENCHMARK_RULES.length]!;
    const secondary =
      DISCOVERY_BENCHMARK_RULES[
        (index + 2) % DISCOVERY_BENCHMARK_RULES.length
      ]!;
    const subject = `Operational outcome ${String(index + 1).padStart(3, '0')}`;
    if (mode === 0) {
      return {
        id: `quality-case-${String(index + 1).padStart(3, '0')}`,
        subject,
        expectedBehavior: 'no-candidate' as const,
        expectedConceptIds: [],
        documents: DISCOVERY_BENCHMARK_SOURCE_SYSTEMS.map(
          (sourceSystem, sourceIndex) => {
            const isolated =
              DISCOVERY_BENCHMARK_RULES[
                (index + sourceIndex) % DISCOVERY_BENCHMARK_RULES.length
              ]!;
            return benchmarkDocument(
              index,
              sourceSystem,
              `This source alone mentions ${isolated.keywords[0]}. Other systems describe unrelated operational details.`,
            );
          },
        ),
      };
    }
    const contested = mode === 1;
    return {
      id: `quality-case-${String(index + 1).padStart(3, '0')}`,
      subject,
      expectedBehavior: contested
        ? ('contested-candidate' as const)
        : ('candidate' as const),
      expectedConceptIds: [primary.id, secondary.id],
      documents: DISCOVERY_BENCHMARK_SOURCE_SYSTEMS.map(
        (sourceSystem, sourceIndex) => {
          const secondarySignal =
            sourceIndex < 3
              ? ` A separate observation mentions ${secondary.keywords[sourceIndex % secondary.keywords.length]}.`
              : '';
          const contradiction =
            contested && sourceIndex < contradictionSentences.length
              ? ` ${contradictionSentences[sourceIndex]}`
              : '';
          return benchmarkDocument(
            index,
            sourceSystem,
            `The record describes ${primary.keywords[sourceIndex % primary.keywords.length]}.${secondarySignal}${contradiction}`,
          );
        },
      ),
    };
  });
}

function blindCaseId(caseId: string) {
  return stableId('blind-hypothesis-quality-case', caseId);
}

function candidateSurfacesContradiction(
  candidate: ReturnType<typeof discoverHypotheses>[number],
) {
  const text = `${candidate.statement} ${candidate.rationale}`.toLowerCase();
  return ['contested', 'conflicting evidence', 'challenge', 'dispute'].some(
    (marker) => text.includes(marker),
  );
}

export function evaluateHypothesisQualityMachineContract(
  cases: HypothesisQualityCase[],
) {
  let truePositives = 0;
  let trueNegatives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let groundedCandidates = 0;
  let expectedConceptMatches = 0;
  let contradictionCases = 0;
  let contradictionsSurfaced = 0;
  for (const qualityCase of cases) {
    const candidate = discoverHypotheses(qualityCase.documents, {
      subject: qualityCase.subject,
      minimumSourceDiversity: 3,
      conceptRules: DISCOVERY_BENCHMARK_RULES,
    })[0];
    const expectsCandidate = qualityCase.expectedBehavior !== 'no-candidate';
    if (candidate && expectsCandidate) truePositives += 1;
    else if (!candidate && !expectsCandidate) trueNegatives += 1;
    else if (candidate) falsePositives += 1;
    else falseNegatives += 1;
    if (candidate) {
      const inputIds = new Set(
        qualityCase.documents.map((document) => document.resourceId),
      );
      if (
        candidate.evidence.every((evidence) =>
          inputIds.has(evidence.resourceId),
        )
      ) {
        groundedCandidates += 1;
      }
      if (
        qualityCase.expectedConceptIds.length > 0 &&
        candidate.concepts[0]?.id === qualityCase.expectedConceptIds[0]
      ) {
        expectedConceptMatches += 1;
      }
      if (qualityCase.expectedBehavior === 'contested-candidate') {
        contradictionCases += 1;
        if (candidateSurfacesContradiction(candidate)) {
          contradictionsSurfaced += 1;
        }
      }
    }
  }
  const expectedCandidateCount = cases.filter(
    (item) => item.expectedBehavior !== 'no-candidate',
  ).length;
  const candidatesFormed = truePositives + falsePositives;
  return {
    casesEvaluated: cases.length,
    expectedCandidateCount,
    negativeControlCount: cases.length - expectedCandidateCount,
    truePositives,
    trueNegatives,
    falsePositives,
    falseNegatives,
    precision:
      truePositives + falsePositives === 0
        ? 1
        : truePositives / (truePositives + falsePositives),
    recall:
      truePositives + falseNegatives === 0
        ? 1
        : truePositives / (truePositives + falseNegatives),
    groundedCandidates,
    expectedConceptMatches,
    contradictionCases,
    contradictionsSurfaced,
    contradictionSurfacingRate:
      contradictionCases === 0 ? 1 : contradictionsSurfaced / contradictionCases,
    safetyContractPassed:
      falsePositives === 0 &&
      falseNegatives === 0 &&
      groundedCandidates === candidatesFormed,
    qualityGateStatus: 'pending-independent-review' as const,
    externalTokens: 0,
    externalCostMicros: 0,
  };
}

export function createBlindHypothesisReviewPacket(
  cases: HypothesisQualityCase[],
): BlindHypothesisReviewPacket {
  return {
    schemaVersion: 1,
    rubricScale: '1 (poor) to 5 (excellent)',
    instructions: [
      'Review each case without asking for or inspecting its expected labels.',
      'Judge whether the candidate is grounded only in the supplied records and whether it is useful, novel, falsifiable and actionable.',
      'For conflicting records, contradictionHandling should score highly only when the candidate explicitly preserves the tension.',
      'If no candidate exists, set missedMaterialPattern when the records still contain a material cross-source pattern.',
      'Set unsupportedCandidate when a proposed candidate is not justified by the records.',
    ],
    cases: cases.map((qualityCase) => ({
      blindCaseId: blindCaseId(qualityCase.id),
      subject: qualityCase.subject,
      sourceRecords: qualityCase.documents,
      candidate:
        discoverHypotheses(qualityCase.documents, {
          subject: qualityCase.subject,
          minimumSourceDiversity: 3,
          conceptRules: DISCOVERY_BENCHMARK_RULES,
        })[0] ?? null,
    })),
  };
}

export function createIndependentHypothesisCaseTemplate(
  count = 100,
): IndependentHypothesisCasePacket {
  return {
    schemaVersion: 1,
    instructions: [
      'Author natural, messy organisational records without inspecting the implementation or generated benchmark cases.',
      'Use all five source systems and do not label text as SUPPORTS, CONTRADICTS or a hypothesis.',
      'Include positive, genuinely ambiguous or contradictory, and no-pattern cases.',
      'Expected labels are used only by the evaluator and are removed from reviewer packets.',
    ],
    authorship: {
      author: '',
      authoredAt: '',
      independentlyAuthored: false,
      didNotInspectImplementation: false,
    },
    cases: Array.from({ length: count }, (_, index) => ({
      id: `independent-case-${String(index + 1).padStart(3, '0')}`,
      subject: '',
      expectedBehavior: null,
      expectedConceptIds: [],
      adjudicationNotes: '',
      documents: DISCOVERY_BENCHMARK_SOURCE_SYSTEMS.map((sourceSystem) => ({
        resourceId: `independent-${index + 1}-${sourceSystem}`,
        sourceUri: `${sourceSystem}://independent/case-${index + 1}`,
        sourceId: `independent-source-${sourceSystem}`,
        sourceSystem,
        title: '',
        body: '',
      })),
    })),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateIndependentHypothesisCasePacket(packet: unknown) {
  const errors: string[] = [];
  if (!isObject(packet)) return ['Case packet must be a JSON object'];
  if (packet.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  const authorship = packet.authorship;
  if (!isObject(authorship)) {
    errors.push('authorship must be an object');
  } else {
    if (typeof authorship.author !== 'string' || !authorship.author.trim()) {
      errors.push('authorship.author is required');
    }
    if (
      typeof authorship.authoredAt !== 'string' ||
      Number.isNaN(Date.parse(authorship.authoredAt))
    ) {
      errors.push('authorship.authoredAt must be a valid date');
    }
    if (authorship.independentlyAuthored !== true) {
      errors.push('authorship.independentlyAuthored must be true');
    }
    if (authorship.didNotInspectImplementation !== true) {
      errors.push('authorship.didNotInspectImplementation must be true');
    }
  }
  if (!Array.isArray(packet.cases) || packet.cases.length < 20) {
    return [...errors, 'cases must contain at least 20 entries'];
  }
  const seenIds = new Set<string>();
  const allowedConcepts = new Set(
    DISCOVERY_BENCHMARK_RULES.map((rule) => rule.id),
  );
  const allowedBehaviors = new Set<ExpectedDiscoveryBehavior>([
    'candidate',
    'contested-candidate',
    'no-candidate',
  ]);
  const behaviorCounts = new Map<ExpectedDiscoveryBehavior, number>();
  for (const [index, candidateCase] of packet.cases.entries()) {
    if (!isObject(candidateCase)) {
      errors.push(`cases[${index}] must be an object`);
      continue;
    }
    const id = typeof candidateCase.id === 'string' ? candidateCase.id : '';
    if (!id || seenIds.has(id)) errors.push(`cases[${index}].id must be unique`);
    seenIds.add(id);
    if (
      typeof candidateCase.subject !== 'string' ||
      candidateCase.subject.trim().length < 8
    ) {
      errors.push(`cases[${index}].subject must contain at least 8 characters`);
    }
    if (
      typeof candidateCase.expectedBehavior !== 'string' ||
      !allowedBehaviors.has(
        candidateCase.expectedBehavior as ExpectedDiscoveryBehavior,
      )
    ) {
      errors.push(`cases[${index}].expectedBehavior is invalid`);
    } else {
      const behavior = candidateCase.expectedBehavior as ExpectedDiscoveryBehavior;
      behaviorCounts.set(behavior, (behaviorCounts.get(behavior) ?? 0) + 1);
    }
    if (!Array.isArray(candidateCase.expectedConceptIds)) {
      errors.push(`cases[${index}].expectedConceptIds must be an array`);
    } else {
      for (const concept of candidateCase.expectedConceptIds) {
        if (typeof concept !== 'string' || !allowedConcepts.has(concept)) {
          errors.push(`cases[${index}] contains an unknown expected concept`);
        }
      }
      if (
        candidateCase.expectedBehavior === 'no-candidate' &&
        candidateCase.expectedConceptIds.length > 0
      ) {
        errors.push(
          `cases[${index}].expectedConceptIds must be empty for a no-candidate case`,
        );
      }
      if (
        candidateCase.expectedBehavior !== 'no-candidate' &&
        candidateCase.expectedConceptIds.length === 0
      ) {
        errors.push(
          `cases[${index}].expectedConceptIds needs at least one concept for a candidate case`,
        );
      }
    }
    if (!Array.isArray(candidateCase.documents)) {
      errors.push(`cases[${index}].documents must be an array`);
      continue;
    }
    if (candidateCase.documents.length !== DISCOVERY_BENCHMARK_SOURCE_SYSTEMS.length) {
      errors.push(`cases[${index}].documents must contain exactly five records`);
    }
    const systems = new Set<string>();
    for (const [documentIndex, document] of candidateCase.documents.entries()) {
      if (!isObject(document)) {
        errors.push(`cases[${index}].documents[${documentIndex}] is invalid`);
        continue;
      }
      if (typeof document.sourceSystem === 'string') {
        systems.add(document.sourceSystem);
      }
      const title = typeof document.title === 'string' ? document.title : '';
      const body = typeof document.body === 'string' ? document.body : '';
      if (title.trim().length < 5 || body.trim().length < 20) {
        errors.push(
          `cases[${index}].documents[${documentIndex}] needs a title and substantive body`,
        );
      }
      if (/\b(?:supports|contradicts|hypothesis)\b/i.test(`${title} ${body}`)) {
        errors.push(
          `cases[${index}].documents[${documentIndex}] contains a prohibited stance label`,
        );
      }
    }
    if (
      systems.size !== DISCOVERY_BENCHMARK_SOURCE_SYSTEMS.length ||
      DISCOVERY_BENCHMARK_SOURCE_SYSTEMS.some(
        (sourceSystem) => !systems.has(sourceSystem),
      )
    ) {
      errors.push(`cases[${index}] must contain every source system exactly once`);
    }
  }
  const minimumControlCases = Math.max(2, Math.ceil(packet.cases.length * 0.1));
  if ((behaviorCounts.get('no-candidate') ?? 0) < minimumControlCases) {
    errors.push(`cases need at least ${minimumControlCases} no-candidate controls`);
  }
  if ((behaviorCounts.get('contested-candidate') ?? 0) < minimumControlCases) {
    errors.push(`cases need at least ${minimumControlCases} contested candidates`);
  }
  return errors;
}

export function validateHypothesisReviewerScores(
  reviewPacket: BlindHypothesisReviewPacket,
  scores: unknown,
) {
  const errors: string[] = [];
  if (!isObject(scores)) return ['Reviewer scores must be a JSON object'];
  if (scores.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  const reviewer = scores.reviewer;
  if (!isObject(reviewer)) {
    errors.push('reviewer must be an object');
  } else {
    if (typeof reviewer.name !== 'string' || !reviewer.name.trim()) {
      errors.push('reviewer.name is required');
    }
    if (
      typeof reviewer.reviewedAt !== 'string' ||
      Number.isNaN(Date.parse(reviewer.reviewedAt))
    ) {
      errors.push('reviewer.reviewedAt must be a valid date');
    }
    if (reviewer.independentReview !== true) {
      errors.push('reviewer.independentReview must be true');
    }
    if (reviewer.didNotSeeExpectedLabels !== true) {
      errors.push('reviewer.didNotSeeExpectedLabels must be true');
    }
  }
  if (!Array.isArray(scores.reviews)) {
    return [...errors, 'reviews must be an array'];
  }
  const expectedIds = new Set(
    reviewPacket.cases.map((item) => item.blindCaseId),
  );
  const seenIds = new Set<string>();
  const packetCaseById = new Map(
    reviewPacket.cases.map((item) => [item.blindCaseId, item]),
  );
  const dimensions = [
    'grounding',
    'novelty',
    'usefulness',
    'falsifiability',
    'contradictionHandling',
    'actionability',
  ];
  for (const [index, review] of scores.reviews.entries()) {
    if (!isObject(review)) {
      errors.push(`reviews[${index}] must be an object`);
      continue;
    }
    const caseId = typeof review.blindCaseId === 'string' ? review.blindCaseId : '';
    if (!expectedIds.has(caseId) || seenIds.has(caseId)) {
      errors.push(`reviews[${index}].blindCaseId is unknown or duplicated`);
    }
    seenIds.add(caseId);
    const candidatePresent = Boolean(packetCaseById.get(caseId)?.candidate);
    for (const dimension of dimensions) {
      const value = review[dimension];
      if (candidatePresent) {
        if (
          typeof value !== 'number' ||
          !Number.isInteger(value) ||
          value < 1 ||
          value > 5
        ) {
          errors.push(
            `reviews[${index}].${dimension} must be an integer from 1 to 5 when a candidate exists`,
          );
        }
      } else if (value !== null) {
        errors.push(
          `reviews[${index}].${dimension} must be null when no candidate exists`,
        );
      }
    }
    for (const flag of ['unsupportedCandidate', 'missedMaterialPattern']) {
      if (typeof review[flag] !== 'boolean') {
        errors.push(`reviews[${index}].${flag} must be boolean`);
      }
    }
    if (candidatePresent && review.missedMaterialPattern !== false) {
      errors.push(
        `reviews[${index}].missedMaterialPattern must be false when a candidate exists`,
      );
    }
    if (!candidatePresent && review.unsupportedCandidate !== false) {
      errors.push(
        `reviews[${index}].unsupportedCandidate must be false when no candidate exists`,
      );
    }
  }
  if (seenIds.size !== expectedIds.size) {
    errors.push(`reviews must contain exactly ${expectedIds.size} unique cases`);
  }
  return errors;
}

const scoreDimensions = [
  'grounding',
  'novelty',
  'usefulness',
  'falsifiability',
  'contradictionHandling',
  'actionability',
] as const;

export function aggregateHypothesisReviewerScores(
  reviewPacket: BlindHypothesisReviewPacket,
  reviewerScores: HypothesisReviewerScores[],
) {
  if (reviewerScores.length < 2) {
    throw new Error('At least two independent reviewer files are required');
  }
  if (
    new Set(reviewerScores.map((scores) => scores.reviewer.name.trim().toLowerCase()))
      .size !== reviewerScores.length
  ) {
    throw new Error('Reviewer files must identify distinct people');
  }
  for (const scores of reviewerScores) {
    const errors = validateHypothesisReviewerScores(reviewPacket, scores);
    if (errors.length) throw new Error(errors.join('\n'));
  }
  const scoreValues = Object.fromEntries(
    scoreDimensions.map((dimension) => [dimension, [] as number[]]),
  ) as Record<(typeof scoreDimensions)[number], number[]>;
  let unsupported = 0;
  let missed = 0;
  let candidateAssessments = 0;
  let emptyAssessments = 0;
  let calibrationDifference = 0;
  let calibrationCases = 0;
  for (const packetCase of reviewPacket.cases) {
    const caseReviews = reviewerScores.map(
      (scores) =>
        scores.reviews.find(
          (review) => review.blindCaseId === packetCase.blindCaseId,
        )!,
    );
    if (packetCase.candidate) {
      for (const review of caseReviews) {
        for (const dimension of scoreDimensions) {
          scoreValues[dimension].push(review[dimension]!);
        }
        unsupported += Number(review.unsupportedCandidate);
        candidateAssessments += 1;
      }
      const meanGrounding =
        caseReviews.reduce((sum, review) => sum + review.grounding!, 0) /
        caseReviews.length /
        5;
      calibrationDifference += Math.abs(
        packetCase.candidate.confidence - meanGrounding,
      );
      calibrationCases += 1;
    } else {
      for (const review of caseReviews) {
        missed += Number(review.missedMaterialPattern);
        emptyAssessments += 1;
      }
    }
  }
  let withinOnePairs = 0;
  let totalPairs = 0;
  for (let left = 0; left < reviewerScores.length; left += 1) {
    for (let right = left + 1; right < reviewerScores.length; right += 1) {
      for (const packetCase of reviewPacket.cases) {
        if (!packetCase.candidate) continue;
        const leftReview = reviewerScores[left]!.reviews.find(
          (item) => item.blindCaseId === packetCase.blindCaseId,
        )!;
        const rightReview = reviewerScores[right]!.reviews.find(
          (item) => item.blindCaseId === packetCase.blindCaseId,
        )!;
        for (const dimension of scoreDimensions) {
          totalPairs += 1;
          if (
            Math.abs(
              leftReview[dimension]! - rightReview[dimension]!,
            ) <= 1
          ) {
            withinOnePairs += 1;
          }
        }
      }
    }
  }
  const means = Object.fromEntries(
    scoreDimensions.map((dimension) => [
      dimension,
      scoreValues[dimension].reduce((sum, value) => sum + value, 0) /
        scoreValues[dimension].length,
    ]),
  ) as Record<(typeof scoreDimensions)[number], number>;
  const unsupportedCandidateRate =
    candidateAssessments === 0 ? 0 : unsupported / candidateAssessments;
  const missedMaterialPatternRate =
    emptyAssessments === 0 ? 0 : missed / emptyAssessments;
  const confidenceCalibrationMae =
    calibrationCases === 0 ? 0 : calibrationDifference / calibrationCases;
  const reviewerAgreementWithinOne =
    totalPairs === 0 ? 0 : withinOnePairs / totalPairs;
  const provisionalGate =
    means.grounding >= 4 &&
    means.usefulness >= 3.5 &&
    means.falsifiability >= 4 &&
    means.contradictionHandling >= 3.5 &&
    unsupportedCandidateRate <= 0.05 &&
    missedMaterialPatternRate <= 0.1 &&
    confidenceCalibrationMae <= 0.2 &&
    reviewerAgreementWithinOne >= 0.75;
  return {
    reviewers: reviewerScores.length,
    cases: reviewPacket.cases.length,
    means,
    unsupportedCandidateRate,
    missedMaterialPatternRate,
    confidenceCalibrationMae,
    reviewerAgreementWithinOne,
    provisionalGate,
  };
}
