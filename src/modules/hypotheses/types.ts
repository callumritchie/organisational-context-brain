export type HypothesisOrigin = 'monitored' | 'discovered';
export type HypothesisLifecycleState =
  | 'proposed'
  | 'active'
  | 'superseded'
  | 'retired';
export type HypothesisEvidenceState =
  | 'untested'
  | 'insufficient'
  | 'supported'
  | 'contested'
  | 'refuted'
  | 'stale';
export type HypothesisReviewState =
  | 'not-required'
  | 'required'
  | 'accepted'
  | 'dismissed';

export interface UnifiedHypothesisRecord {
  id: string;
  origin: HypothesisOrigin;
  statement: string;
  rationale: string | null;
  lifecycleState: HypothesisLifecycleState;
  evidenceState: HypothesisEvidenceState;
  reviewState: HypothesisReviewState;
  confidence: number | null;
  evidenceCount: number;
  sourceDiversity: number | null;
  predictions: string[];
  falsificationConditions: string[];
  monitoring: {
    status: 'active' | 'paused' | 'stopped' | 'not-configured';
    nextDueAt: string | null;
    lastEvaluatedAt: string | null;
  };
  provenance: {
    policyId: string;
    promotedResourceId: string | null;
  };
}

export interface HypothesisSystemState {
  engine: 'unified-hypothesis-read-model-v1';
  records: UnifiedHypothesisRecord[];
  summary: {
    total: number;
    awaitingReview: number;
    activelyMonitored: number;
    contestedOrRefuted: number;
  };
}
