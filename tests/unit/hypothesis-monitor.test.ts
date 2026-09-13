import { describe, expect, it } from 'vitest';
import {
  compareSnapshots,
  deriveMemoryCandidates,
  snapshotHash,
} from '@/src/modules/memory/hypothesis-monitor';
import type {
  ContextSnapshotProjection,
  SnapshotEvidence,
} from '@/src/modules/memory/types';

const supporting: SnapshotEvidence = {
  id: '50000000-0000-4000-8000-000000000101',
  title: 'Verification delay observation',
  summary: 'Participants abandoned after a long identity verification wait.',
  stance: 'SUPPORTS',
  confidence: 0.9,
  assertionId: '60000000-0000-4000-8000-000000000101',
  sourceTitle: 'Research note',
  sourceUri: 'research://northstar/supporting',
  sourceUpdatedAt: '2026-08-01T10:00:00.000Z',
};

const contradicting: SnapshotEvidence = {
  id: '50000000-0000-4000-8000-000000000102',
  title: 'Clear guidance enables completion',
  summary:
    'Customers with clearer eligibility guidance completed verification.',
  stance: 'CONTRADICTS',
  confidence: 0.87,
  assertionId: '60000000-0000-4000-8000-000000000102',
  sourceTitle: 'Follow-up research',
  sourceUri: 'research://northstar/contradicting',
  sourceUpdatedAt: '2026-09-02T10:00:00.000Z',
};

function snapshot(evidence: SnapshotEvidence[]): ContextSnapshotProjection {
  return {
    traceId: null,
    summary: 'Fixture context',
    epistemicStatus: evidence.some((item) => item.stance === 'CONTRADICTS')
      ? 'contested'
      : 'supported',
    supportingEvidence: evidence.filter((item) => item.stance === 'SUPPORTS')
      .length,
    contradictingEvidence: evidence.filter(
      (item) => item.stance === 'CONTRADICTS',
    ).length,
    evidence,
  };
}

describe('continual hypothesis monitor', () => {
  it('detects an attributable evidence delta between durable checkpoints', () => {
    const deltas = compareSnapshots(
      snapshot([supporting]),
      snapshot([supporting, contradicting]),
    );
    expect(deltas).toEqual([
      {
        type: 'added',
        evidence: contradicting,
        previousStance: null,
        currentStance: 'CONTRADICTS',
      },
    ]);
  });

  it('forms a reviewable counter-hypothesis without claiming it is trusted memory', () => {
    const [candidate] = deriveMemoryCandidates([
      {
        type: 'added',
        evidence: contradicting,
        previousStance: null,
        currentStance: 'CONTRADICTS',
      },
    ]);
    expect(candidate).toMatchObject({
      kind: 'counter-hypothesis',
      statement:
        'Alternative explanation to test: Clear guidance enables completion.',
      confidence: 0.78,
      evidence: contradicting,
    });
    expect(candidate?.rationale).toContain(
      'proposed for testing, not asserted as fact',
    );
  });

  it('hashes epistemic content rather than transient trace identity', () => {
    const first = snapshot([supporting]);
    const second = {
      ...first,
      traceId: '70000000-0000-4000-8000-000000000101',
    };
    expect(snapshotHash(first)).toBe(snapshotHash(second));
  });
});
