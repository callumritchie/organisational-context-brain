import type {
  MemoryOutcomeStatus,
  MemoryScopeKind,
  MemoryType,
} from './isolation-policy';
import type { ContextFoundationState } from '@/src/modules/context-assets/types';
import type { SourceIntegrationState } from '@/src/modules/source-integration/types';

export interface HostProjectMemberView {
  actorId: string;
  name: string;
  role: 'lead' | 'contributor' | 'viewer' | 'service';
  status: 'active' | 'removed';
}

export interface ProjectMemoryView {
  id: string;
  type: MemoryType;
  statement: string;
  scope: MemoryScopeKind;
  status: 'candidate' | 'active' | 'superseded' | 'retired' | 'rejected';
  reviewStatus: 'proposed' | 'approved' | 'rejected' | 'correction-required';
  outcomeStatus: MemoryOutcomeStatus;
  confidence: number;
  qualityScore: number;
  process: string;
  evidenceCount: number;
  createdAt: string;
  review?: {
    decision: 'approved' | 'rejected' | 'correction-requested' | 'corrected';
    note: string;
    reviewer: string;
    reviewedAt: string;
  };
}

export interface ProjectMemoryState {
  configured: boolean;
  integration?: {
    bindingId: string;
    provider: string;
    externalProjectId: string;
    membershipRevision: string;
    project: { id: string; name: string };
    client: { id: string; name: string };
    members: HostProjectMemberView[];
    files: number;
    conversations: number;
    lastSyncedAt: string;
  };
  capture: {
    debriefs: number;
    backgroundRuns: number;
    latestRationale: string | null;
  };
  formation: {
    mode: 'deterministic-general-purpose';
    modelRoute: 'no-model';
    schedule: 'active' | 'paused';
    nextDueAt: string | null;
    pendingJobs: number;
    completedJobs: number;
  };
  memories: ProjectMemoryView[];
  contextFoundation?: ContextFoundationState;
  sourceIntegration?: SourceIntegrationState;
  kickoff?: {
    id: string;
    generatedAt: string;
    reason: string;
    items: Array<{
      memoryId: string;
      statement: string;
      memoryType: MemoryType;
      sourceScope: MemoryScopeKind;
      relevance: number;
      rationale: string;
    }>;
  };
  clientMemory: {
    enabled: false;
    reason: string;
  };
  permissions: {
    canCapture: boolean;
    canReview: boolean;
    canGenerateKickoff: boolean;
  };
}
