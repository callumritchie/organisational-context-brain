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
    promotedResourceId: string | null;
    createdAt: string;
  }>;
}
