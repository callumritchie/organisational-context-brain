import { discoverHypotheses } from '@/src/modules/discovery/hypothesis-discovery';
import type {
  DiscoveryConceptRule,
  DiscoveryDocument,
} from '@/src/modules/discovery/types';
import { chooseModelRoute } from '@/src/modules/model-routing/model-router';

const SOURCE_SYSTEMS = ['research', 'meetings', 'crm', 'documents', 'messages'];

const BENCHMARK_RULES: DiscoveryConceptRule[] = [
  {
    id: 'approval-bottleneck',
    label: 'Approval bottleneck',
    keywords: ['approval queue', 'waiting for sign-off'],
    hypothesisFragment: 'an approval bottleneck',
    prediction: 'Shorter approval queues should reduce cycle time.',
    falsificationCondition:
      'Cycle time remains unchanged after approval queues shrink.',
  },
  {
    id: 'identity-mismatch',
    label: 'Identity mismatch',
    keywords: ['identity mismatch', 'name reconciliation'],
    hypothesisFragment: 'identity mismatches',
    prediction: 'Canonical identity resolution should reduce manual rework.',
    falsificationCondition: 'Resolved identities experience the same rework.',
  },
  {
    id: 'duplicate-handoff',
    label: 'Duplicate handoff',
    keywords: ['duplicate handoff', 'entered twice'],
    hypothesisFragment: 'duplicate operational handoffs',
    prediction: 'Removing duplicate handoffs should reduce errors.',
    falsificationCondition:
      'Errors persist after duplicate handoffs are removed.',
  },
  {
    id: 'unclear-requirements',
    label: 'Unclear requirements',
    keywords: ['unclear requirements', 'conflicting instructions'],
    hypothesisFragment: 'unclear requirements',
    prediction: 'One authoritative instruction set should reduce resubmission.',
    falsificationCondition:
      'Resubmission remains unchanged with one instruction set.',
  },
  {
    id: 'ownership-gap',
    label: 'Ownership gap',
    keywords: ['no clear owner', 'ownership gap'],
    hypothesisFragment: 'an ownership gap',
    prediction: 'Named ownership should reduce stalled work.',
    falsificationCondition:
      'Work stalls at the same rate after ownership is assigned.',
  },
  {
    id: 'integration-drift',
    label: 'Integration drift',
    keywords: ['integration drift', 'schema out of sync'],
    hypothesisFragment: 'integration drift between systems',
    prediction:
      'Schema conformance checks should reduce reconciliation failures.',
    falsificationCondition: 'Failures persist after schemas remain aligned.',
  },
];

export interface DiscoveryBenchmarkCase {
  id: string;
  subject: string;
  documents: DiscoveryDocument[];
  expectedPrimaryConceptId: string;
  expectedSecondaryConceptId: string;
}

export function generateHypothesisDiscoveryCases(
  count = 50,
): DiscoveryBenchmarkCase[] {
  return Array.from({ length: count }, (_, index) => {
    const primary = BENCHMARK_RULES[index % BENCHMARK_RULES.length]!;
    const secondary = BENCHMARK_RULES[(index + 2) % BENCHMARK_RULES.length]!;
    const subject = `Workflow ${String(index + 1).padStart(2, '0')} delay`;
    const documents = SOURCE_SYSTEMS.map((sourceSystem, sourceIndex) => {
      const secondarySignal =
        sourceIndex < 3
          ? ` Teams also noted ${secondary.keywords[sourceIndex % secondary.keywords.length]}.`
          : '';
      const noise =
        sourceIndex % 2 === 0
          ? ' The record contains an old project alias and an unrelated budget comment.'
          : ' A copied status label calls the item complete although the narrative says it is open.';
      return {
        resourceId: `benchmark-${index + 1}-${sourceSystem}`,
        sourceUri: `${sourceSystem}://benchmark/workflow-${index + 1}`,
        sourceSystem,
        title: `${subject} ${sourceSystem} record`,
        body: `The operational narrative repeatedly describes ${primary.keywords[sourceIndex % primary.keywords.length]}.${secondarySignal}${noise}`,
      };
    });
    return {
      id: `discovery-case-${String(index + 1).padStart(2, '0')}`,
      subject,
      documents,
      expectedPrimaryConceptId: primary.id,
      expectedSecondaryConceptId: secondary.id,
    };
  });
}

export function evaluateHypothesisDiscoveryBenchmark(
  cases = generateHypothesisDiscoveryCases(),
) {
  let candidatesFormed = 0;
  let primaryConceptsCorrect = 0;
  let groundedCandidates = 0;
  let crossSourceCandidates = 0;
  let falsifiableCandidates = 0;
  const reviewPacket = cases.map((benchmarkCase) => {
    const candidate = discoverHypotheses(benchmarkCase.documents, {
      subject: benchmarkCase.subject,
      minimumSourceDiversity: 3,
      conceptRules: BENCHMARK_RULES,
    })[0];
    const inputIds = new Set(
      benchmarkCase.documents.map((document) => document.resourceId),
    );
    if (candidate) {
      candidatesFormed += 1;
      if (
        candidate.concepts[0]?.id === benchmarkCase.expectedPrimaryConceptId
      ) {
        primaryConceptsCorrect += 1;
      }
      if (
        candidate.evidence.every((evidence) =>
          inputIds.has(evidence.resourceId),
        )
      ) {
        groundedCandidates += 1;
      }
      if (candidate.sourceDiversity >= 3) crossSourceCandidates += 1;
      if (
        candidate.predictions.length &&
        candidate.falsificationConditions.length
      ) {
        falsifiableCandidates += 1;
      }
    }
    return {
      caseId: benchmarkCase.id,
      subject: benchmarkCase.subject,
      expectedPrimaryConceptId: benchmarkCase.expectedPrimaryConceptId,
      expectedSecondaryConceptId: benchmarkCase.expectedSecondaryConceptId,
      sourceRecords: benchmarkCase.documents,
      candidate: candidate ?? null,
      humanRubric: {
        grounding: null as number | null,
        novelty: null as number | null,
        usefulness: null as number | null,
        falsifiability: null as number | null,
        contradictionHandling: null as number | null,
        notes: '',
      },
    };
  });
  const route = chooseModelRoute(
    {
      id: 'benchmark-deterministic',
      mode: 'deterministic-only',
      enabled: true,
      routingRules: {},
      budgetLimits: { dailyInputTokens: 0, monthlyCostMicros: 0 },
      allowedProviders: [],
    },
    {
      deterministicSufficient: true,
      inputCharacters: cases.reduce(
        (sum, item) =>
          sum +
          item.documents.reduce(
            (documentSum, document) => documentSum + document.body.length,
            0,
          ),
        0,
      ),
      ambiguity: 0,
      materiality: 0,
    },
  );
  const passed =
    candidatesFormed === cases.length &&
    primaryConceptsCorrect === cases.length &&
    groundedCandidates === cases.length &&
    crossSourceCandidates === cases.length &&
    falsifiableCandidates === cases.length &&
    route.route === 'no-model';
  return {
    passed,
    casesEvaluated: cases.length,
    candidatesFormed,
    primaryConceptsCorrect,
    groundedCandidates,
    crossSourceCandidates,
    falsifiableCandidates,
    modelRoute: route.route,
    externalTokens: 0,
    externalCostMicros: 0,
    reviewPacket,
  };
}
