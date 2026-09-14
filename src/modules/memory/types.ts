import type { ContextResponse } from '@/src/modules/context/types';

export type MemoryCandidateKind =
  | 'counter-hypothesis'
  | 'supporting-memory'
  | 'qualifying-memory';

export interface SnapshotEvidence {
  id: string;
  title: string;
  summary: string;
  stance: 'SUPPORTS' | 'CONTRADICTS';
  confidence: number;
  assertionId: string;
  sourceTitle: string;
  sourceUri: string;
  sourceUpdatedAt: string;
}

export interface ContextSnapshotProjection {
  traceId: string | null;
  summary: string;
  epistemicStatus: ContextResponse['epistemicState']['status'];
  supportingEvidence: number;
  contradictingEvidence: number;
  evidence: SnapshotEvidence[];
}

export interface EvidenceDelta {
  type: 'added' | 'removed' | 'stance-changed';
  evidence: SnapshotEvidence;
  previousStance: SnapshotEvidence['stance'] | null;
  currentStance: SnapshotEvidence['stance'] | null;
}

export interface DerivedMemoryCandidate {
  kind: MemoryCandidateKind;
  statement: string;
  rationale: string;
  confidence: number;
  evidence: SnapshotEvidence;
  proposedScope: Record<string, unknown>;
  predictions: string[];
  falsificationConditions: string[];
}

export interface MemoryState {
  configured: boolean;
  policy: null | {
    id: string;
    name: string;
    status: 'active' | 'paused' | 'stopped';
    hypothesisId: string;
    hypothesis: string;
    ownerActorId: string;
    serviceActorId: string;
    query: string;
    trigger: string;
    reviewRequired: boolean;
  };
  checkpoint: null | {
    id: string;
    epistemicStatus: 'supported' | 'contested' | 'insufficient';
    supportingEvidence: number;
    contradictingEvidence: number;
    evidenceCount: number;
    capturedAt: string;
  };
  hypothesis: null | {
    lifecycleStatus: 'proposed' | 'active' | 'superseded' | 'retired';
    epistemicStatus: 'untested' | 'insufficient' | 'supported' | 'contested' | 'refuted' | 'stale';
    revision: number;
    statement: string;
    predictions: string[];
    falsificationConditions: string[];
    lastEvaluatedAt: string | null;
    recentTransitions: Array<{
      from: string;
      to: string;
      reason: string;
      at: string;
    }>;
  };
  operations: null | {
    pendingJobs: number;
    retryingJobs: number;
    deadLetterJobs: number;
    completedJobs: number;
    scheduleEnabled: boolean;
    nextDueAt: string | null;
    intervalSeconds: number | null;
  };
  modelRouting: null | {
    mode: 'deterministic-only' | 'economy' | 'balanced' | 'high-assurance';
    latestRoute: 'no-model' | 'economy' | 'high-assurance' | 'deferred' | null;
    latestReason: string | null;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostMicros: number;
  };
  notifications: Array<{
    id: string;
    type: 'material-change' | 'review-required' | 'monitor-failed' | 'lifecycle-change';
    severity: 'info' | 'attention' | 'critical';
    status: 'pending' | 'delivered' | 'read' | 'suppressed';
    title: string;
    createdAt: string;
  }>;
  latestRun: null | {
    id: string;
    status: 'running' | 'completed' | 'no-change' | 'failed';
    material: boolean;
    triggerRef: string;
    rationale: string | null;
    startedAt: string;
    finishedAt: string | null;
    before: null | {
      epistemicStatus: 'supported' | 'contested' | 'insufficient';
      supportingEvidence: number;
      contradictingEvidence: number;
    };
    after: null | {
      epistemicStatus: 'supported' | 'contested' | 'insufficient';
      supportingEvidence: number;
      contradictingEvidence: number;
    };
    deltas: Array<{
      id: string;
      type: EvidenceDelta['type'];
      title: string;
      stance: SnapshotEvidence['stance'] | null;
      sourceUri: string;
    }>;
  };
  candidates: Array<{
    id: string;
    kind: MemoryCandidateKind;
    statement: string;
    rationale: string;
    confidence: number;
    status: 'proposed' | 'accepted' | 'dismissed' | 'superseded';
    evidenceTitle: string;
    sourceUri: string;
    process: string;
    predictions: string[];
    falsificationConditions: string[];
    promotedResourceId: string | null;
    createdAt: string;
  }>;
}
