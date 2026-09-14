export interface DiscoveryDocument {
  resourceId: string;
  sourceUri: string;
  sourceId?: string;
  sourceSystem: string;
  title: string;
  body: string;
}

export interface DiscoveryConceptRule {
  id: string;
  label: string;
  keywords: string[];
  hypothesisFragment: string;
  prediction: string;
  falsificationCondition: string;
}

export interface DiscoveryPolicyContract {
  subject: string;
  minimumSourceDiversity: number;
  conceptRules: DiscoveryConceptRule[];
  existingHypotheses?: string[];
}

export interface DiscoveredHypothesis {
  statement: string;
  rationale: string;
  concepts: Array<{
    id: string;
    label: string;
    evidenceCount: number;
    sourceDiversity: number;
  }>;
  evidence: DiscoveryDocument[];
  predictions: string[];
  falsificationConditions: string[];
  confidence: number;
  noveltyScore: number;
  sourceDiversity: number;
}

export interface DiscoveryState {
  policy: {
    id: string;
    name: string;
    status: 'active' | 'paused' | 'stopped';
    minimumSourceDiversity: number;
    ontologyVersion: string;
  };
  latestRun: {
    id: string;
    status: 'running' | 'completed' | 'no-candidate' | 'failed';
    documentsScanned: number;
    sourceSystemsScanned: number;
    candidatesFormed: number;
    candidatesReobserved: number;
    selectedRoute: 'no-model' | 'economy' | 'high-assurance' | 'deferred';
    rationale: string | null;
    finishedAt: string | null;
  } | null;
  operations: {
    scheduleEnabled: boolean;
    intervalSeconds: number;
    nextDueAt: string | null;
    pendingJobs: number;
    retryingJobs: number;
    deadLetterJobs: number;
    lastSuccessfulRunAt: string | null;
  };
  candidates: Array<{
    id: string;
    statement: string;
    rationale: string;
    concepts: Array<{
      id: string;
      label: string;
      evidenceCount: number;
      sourceDiversity: number;
    }>;
    sourceUris: string[];
    sourceSystems: string[];
    predictions: string[];
    falsificationConditions: string[];
    confidence: number;
    noveltyScore: number;
    sourceDiversity: number;
    status: 'proposed' | 'accepted' | 'dismissed' | 'superseded';
    promotedResourceId: string | null;
  }>;
}
