import { describe, expect, it } from 'vitest';
import type { DiscoveryState } from '@/src/modules/discovery/types';
import { projectHypothesisSystem } from '@/src/modules/hypotheses/projection';
import type { MemoryState } from '@/src/modules/memory/types';

const memory = {
  configured: true,
  policy: {
    id: 'monitor-policy',
    name: 'Prepared monitor',
    status: 'active',
    hypothesisId: 'monitored-hypothesis',
    hypothesis: 'Identity friction drives abandonment',
    ownerActorId: 'owner',
    serviceActorId: 'service',
    query: 'Why do users abandon?',
    trigger: 'source-version-changed',
    reviewRequired: true,
  },
  checkpoint: {
    id: 'checkpoint',
    epistemicStatus: 'contested',
    supportingEvidence: 5,
    contradictingEvidence: 1,
    evidenceCount: 6,
    capturedAt: '2026-09-21T10:00:00.000Z',
  },
  hypothesis: {
    lifecycleStatus: 'active',
    epistemicStatus: 'contested',
    revision: 2,
    statement: 'Identity friction drives abandonment',
    predictions: ['Retries should predict abandonment.'],
    falsificationConditions: ['Retries do not affect completion.'],
    lastEvaluatedAt: '2026-09-21T10:00:00.000Z',
    recentTransitions: [],
  },
  operations: {
    pendingJobs: 0,
    retryingJobs: 0,
    deadLetterJobs: 0,
    completedJobs: 2,
    scheduleEnabled: true,
    nextDueAt: '2026-09-21T16:00:00.000Z',
    intervalSeconds: 21_600,
  },
  modelRouting: null,
  notifications: [],
  latestRun: null,
  candidates: [],
} satisfies MemoryState;

const discovery = {
  policy: {
    id: 'discovery-policy',
    name: 'Background discovery',
    status: 'active',
    minimumSourceDiversity: 2,
    ontologyVersion: 'ontology-v1',
  },
  latestRun: null,
  operations: {
    scheduleEnabled: true,
    intervalSeconds: 21_600,
    nextDueAt: '2026-09-21T16:00:00.000Z',
    pendingJobs: 0,
    retryingJobs: 0,
    deadLetterJobs: 0,
    lastSuccessfulRunAt: '2026-09-21T10:00:00.000Z',
  },
  candidates: [
    {
      id: 'discovered-hypothesis',
      statement: 'Status ambiguity may drive abandonment',
      rationale: 'Repeated across two independent sources.',
      concepts: [
        {
          id: 'status-ambiguity',
          label: 'Status ambiguity',
          evidenceCount: 4,
          sourceDiversity: 2,
        },
      ],
      sourceUris: ['source:a', 'source:b'],
      sourceSystems: ['api', 'mcp'],
      predictions: ['Clear states improve completion.'],
      falsificationConditions: ['Clarity has no effect.'],
      confidence: 0.67,
      noveltyScore: 0.8,
      sourceDiversity: 2,
      status: 'proposed',
      promotedResourceId: null,
    },
  ],
} satisfies DiscoveryState;

describe('unified hypothesis projection', () => {
  it('keeps lifecycle, evidence and review as independent axes', () => {
    const state = projectHypothesisSystem(memory, discovery);
    expect(state.summary).toEqual({
      total: 2,
      awaitingReview: 1,
      activelyMonitored: 1,
      contestedOrRefuted: 1,
    });
    expect(state.records[0]).toMatchObject({
      id: 'monitored-hypothesis',
      origin: 'monitored',
      lifecycleState: 'active',
      evidenceState: 'contested',
      reviewState: 'not-required',
      evidenceCount: 6,
    });
    expect(state.records[1]).toMatchObject({
      id: 'discovered-hypothesis',
      origin: 'discovered',
      lifecycleState: 'proposed',
      evidenceState: 'untested',
      reviewState: 'required',
      sourceDiversity: 2,
      monitoring: {
        status: 'not-configured',
        nextDueAt: null,
        lastEvaluatedAt: null,
      },
    });
  });

  it('only starts candidate monitoring after acceptance', () => {
    const accepted = {
      ...discovery,
      candidates: [
        {
          ...discovery.candidates[0],
          status: 'accepted' as const,
          promotedResourceId: 'promoted-hypothesis',
        },
      ],
    } satisfies DiscoveryState;
    const state = projectHypothesisSystem(null, accepted);
    expect(state.records[0]).toMatchObject({
      lifecycleState: 'active',
      evidenceState: 'untested',
      reviewState: 'accepted',
      monitoring: {
        status: 'active',
        nextDueAt: '2026-09-21T16:00:00.000Z',
        lastEvaluatedAt: '2026-09-21T10:00:00.000Z',
      },
    });
    expect(state.summary.activelyMonitored).toBe(1);
  });

  it('projects safely when neither legacy pipeline is configured', () => {
    expect(projectHypothesisSystem(null, null)).toEqual({
      engine: 'unified-hypothesis-read-model-v1',
      records: [],
      summary: {
        total: 0,
        awaitingReview: 0,
        activelyMonitored: 0,
        contestedOrRefuted: 0,
      },
    });
  });
});
