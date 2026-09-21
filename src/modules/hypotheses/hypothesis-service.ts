import {
  getDiscoveryState,
  reviewDiscoveryCandidate,
} from '@/src/modules/discovery/discovery-demo';
import { operateDiscovery } from '@/src/modules/discovery/discovery-operations';
import type { RequestActor } from '@/src/modules/identity/request-actor';
import {
  getMemoryState,
  reviewMemoryCandidate,
} from '@/src/modules/memory/hypothesis-monitor';
import { operateMonitor } from '@/src/modules/memory/monitor-operations';
import { projectHypothesisSystem } from './projection';

export type HypothesisCandidateOrigin = 'monitored' | 'discovered';
export type HypothesisReviewDecision = 'accept' | 'dismiss';
export type HypothesisSystemOperation =
  | 'pause'
  | 'resume'
  | 'run-now'
  | 'mark-notifications-read';

export class UnsupportedHypothesisOperationError extends Error {}

export async function getHypothesisSystemState(actor: {
  id: string;
  workspaceId: string;
  name: string;
  role: string;
}) {
  const [memory, discovery] = await Promise.all([
    getMemoryState(actor),
    getDiscoveryState(actor),
  ]);
  return {
    hypotheses: projectHypothesisSystem(memory, discovery),
    memory,
    discovery,
  };
}

export async function reviewHypothesisCandidate(
  actor: RequestActor,
  input: {
    origin: HypothesisCandidateOrigin;
    candidateId: string;
    decision: HypothesisReviewDecision;
  },
) {
  if (input.origin === 'monitored') {
    await reviewMemoryCandidate(actor, input.candidateId, input.decision);
  } else {
    await reviewDiscoveryCandidate(actor, input.candidateId, input.decision);
  }
  return getHypothesisSystemState(actor);
}

export async function operateHypothesisSystem(
  actor: RequestActor,
  input: {
    origin: HypothesisCandidateOrigin;
    operation: HypothesisSystemOperation;
  },
) {
  if (input.origin === 'monitored') {
    await operateMonitor(actor, input.operation);
  } else {
    if (input.operation === 'mark-notifications-read') {
      throw new UnsupportedHypothesisOperationError(
        'Discovery does not expose a notification-read operation.',
      );
    }
    await operateDiscovery(actor, input.operation);
  }
  return getHypothesisSystemState(actor);
}
