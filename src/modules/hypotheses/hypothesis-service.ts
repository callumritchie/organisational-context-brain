import {
  getDiscoveryState,
  reviewDiscoveryCandidate,
} from '@/src/modules/discovery/discovery-demo';
import type { RequestActor } from '@/src/modules/identity/request-actor';
import {
  getMemoryState,
  reviewMemoryCandidate,
} from '@/src/modules/memory/hypothesis-monitor';
import { projectHypothesisSystem } from './projection';

export type HypothesisCandidateOrigin = 'monitored' | 'discovered';
export type HypothesisReviewDecision = 'accept' | 'dismiss';

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
