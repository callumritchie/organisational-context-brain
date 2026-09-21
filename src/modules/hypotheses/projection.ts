import type { DiscoveryState } from '@/src/modules/discovery/types';
import type { MemoryState } from '@/src/modules/memory/types';
import type {
  HypothesisEvidenceState,
  HypothesisLifecycleState,
  HypothesisReviewState,
  HypothesisSystemState,
  UnifiedHypothesisRecord,
} from './types';

function monitorStatus(
  status: MemoryState['policy'] extends infer P
    ? P extends { status: infer S }
      ? S
      : never
    : never,
) {
  return status ?? 'not-configured';
}

function discoveryLifecycle(
  status: DiscoveryState['candidates'][number]['status'],
): HypothesisLifecycleState {
  if (status === 'accepted') return 'active';
  if (status === 'dismissed') return 'retired';
  return status;
}

function discoveryReview(
  status: DiscoveryState['candidates'][number]['status'],
): HypothesisReviewState {
  if (status === 'proposed') return 'required';
  if (status === 'accepted') return 'accepted';
  if (status === 'dismissed') return 'dismissed';
  return 'not-required';
}

function discoveryEvidence(
  status: DiscoveryState['candidates'][number]['status'],
): HypothesisEvidenceState {
  if (status === 'superseded') return 'stale';
  if (status === 'dismissed') return 'insufficient';
  return 'untested';
}

function discoveryMonitoring(
  candidateStatus: DiscoveryState['candidates'][number]['status'],
  policyStatus: DiscoveryState['policy']['status'],
) {
  if (candidateStatus === 'accepted') return policyStatus;
  if (candidateStatus === 'dismissed' || candidateStatus === 'superseded') {
    return 'stopped' as const;
  }
  return 'not-configured' as const;
}

export function projectHypothesisSystem(
  memory: MemoryState | null,
  discovery: DiscoveryState | null,
): HypothesisSystemState {
  const records: UnifiedHypothesisRecord[] = [];
  if (memory?.policy && memory.hypothesis) {
    records.push({
      id: memory.policy.hypothesisId,
      origin: 'monitored',
      statement: memory.hypothesis.statement,
      rationale: memory.latestRun?.rationale ?? null,
      lifecycleState: memory.hypothesis.lifecycleStatus,
      evidenceState: memory.hypothesis.epistemicStatus,
      reviewState: 'not-required',
      confidence: null,
      evidenceCount: memory.checkpoint?.evidenceCount ?? 0,
      sourceDiversity: null,
      predictions: memory.hypothesis.predictions,
      falsificationConditions: memory.hypothesis.falsificationConditions,
      monitoring: {
        status: monitorStatus(memory.policy.status),
        nextDueAt: memory.operations?.nextDueAt ?? null,
        lastEvaluatedAt: memory.hypothesis.lastEvaluatedAt,
      },
      provenance: {
        policyId: memory.policy.id,
        promotedResourceId: null,
      },
    });
  }
  if (discovery) {
    for (const candidate of discovery.candidates) {
      records.push({
        id: candidate.id,
        origin: 'discovered',
        statement: candidate.statement,
        rationale: candidate.rationale,
        lifecycleState: discoveryLifecycle(candidate.status),
        evidenceState: discoveryEvidence(candidate.status),
        reviewState: discoveryReview(candidate.status),
        confidence: candidate.confidence,
        evidenceCount: candidate.concepts.reduce(
          (total, concept) => total + concept.evidenceCount,
          0,
        ),
        sourceDiversity: candidate.sourceDiversity,
        predictions: candidate.predictions,
        falsificationConditions: candidate.falsificationConditions,
        monitoring: {
          status: discoveryMonitoring(
            candidate.status,
            discovery.policy.status,
          ),
          nextDueAt:
            candidate.status === 'accepted'
              ? discovery.operations.nextDueAt
              : null,
          lastEvaluatedAt:
            candidate.status === 'accepted'
              ? discovery.operations.lastSuccessfulRunAt
              : null,
        },
        provenance: {
          policyId: discovery.policy.id,
          promotedResourceId: candidate.promotedResourceId,
        },
      });
    }
  }
  return {
    engine: 'unified-hypothesis-read-model-v1',
    records,
    summary: {
      total: records.length,
      awaitingReview: records.filter(
        (record) => record.reviewState === 'required',
      ).length,
      activelyMonitored: records.filter(
        (record) => record.monitoring.status === 'active',
      ).length,
      contestedOrRefuted: records.filter((record) =>
        ['contested', 'refuted'].includes(record.evidenceState),
      ).length,
    },
  };
}
