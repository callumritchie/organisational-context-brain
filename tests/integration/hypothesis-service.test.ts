import { afterAll, describe, expect, it } from 'vitest';
import { getAppPool, getIngestionPool } from '@/src/db/pool';
import {
  getHypothesisSystemState,
  reviewHypothesisCandidate,
} from '@/src/modules/hypotheses/hypothesis-service';
import { IDS } from '@/src/modules/canonical/ids';
import type { RequestActor } from '@/src/modules/identity/request-actor';

const alex: RequestActor = {
  id: IDS.users.alex,
  workspaceId: IDS.workspace,
  name: 'Alex Chen',
  role: 'Project Lead',
  authenticationMode: 'demo',
  capabilities: ['hypothesis.review'],
};
const morgan: RequestActor = {
  id: IDS.users.morgan,
  workspaceId: IDS.workspace,
  name: 'Morgan Reed',
  role: 'External Contractor',
  authenticationMode: 'demo',
  capabilities: [],
};

describe('unified hypothesis service', () => {
  afterAll(async () => {
    await getAppPool().end();
    await getIngestionPool().end();
  });

  it('reviews a discovery through the shared command and returns all axes', async () => {
    const initial = await getHypothesisSystemState(alex);
    const candidate = initial.hypotheses.records.find(
      (record) =>
        record.origin === 'discovered' && record.reviewState === 'required',
    );
    expect(candidate).toBeDefined();

    await expect(
      reviewHypothesisCandidate(morgan, {
        origin: 'discovered',
        candidateId: candidate!.id,
        decision: 'dismiss',
      }),
    ).rejects.toThrow('hypothesis.review capability');

    const reviewed = await reviewHypothesisCandidate(alex, {
      origin: 'discovered',
      candidateId: candidate!.id,
      decision: 'dismiss',
    });
    expect(reviewed.hypotheses.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: candidate!.id,
          origin: 'discovered',
          lifecycleState: 'retired',
          evidenceState: 'insufficient',
          reviewState: 'dismissed',
          monitoring: expect.objectContaining({ status: 'stopped' }),
        }),
        expect.objectContaining({ origin: 'monitored' }),
      ]),
    );
    expect(reviewed.hypotheses.summary.awaitingReview).toBe(0);
  });
});
