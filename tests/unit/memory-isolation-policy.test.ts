import { describe, expect, it } from 'vitest';
import {
  evaluateMemoryCapture,
  evaluateMemoryPromotion,
  evaluateMemoryRetrieval,
  type MemoryScopeDescriptor,
} from '@/src/modules/organisational-memory/isolation-policy';

const person: MemoryScopeDescriptor = {
  id: 'person-alex',
  kind: 'person',
  ownerActorId: 'alex',
};
const projectA: MemoryScopeDescriptor = {
  id: 'project-a',
  kind: 'project',
  subjectResourceId: 'project-a-resource',
  parentScopeId: 'client-a',
};
const projectB: MemoryScopeDescriptor = {
  id: 'project-b',
  kind: 'project',
  subjectResourceId: 'project-b-resource',
  parentScopeId: 'client-b',
};
const clientA: MemoryScopeDescriptor = {
  id: 'client-a',
  kind: 'client',
  subjectResourceId: 'client-a-resource',
};
const domain: MemoryScopeDescriptor = {
  id: 'domain-regulated',
  kind: 'domain',
  subjectResourceId: 'domain-resource',
};
const organisation: MemoryScopeDescriptor = {
  id: 'organisation',
  kind: 'organisation',
};

const reviewedPromotion = {
  transferClass: 'abstractable' as const,
  sensitivity: 'internal' as const,
  reviewApproved: true,
  abstractionReviewed: true,
  createsNewMemory: true,
  attachesRawEvidence: false,
};

describe('organisational memory isolation policy', () => {
  it('captures only material, evidenced candidates in their origin scope', () => {
    expect(
      evaluateMemoryCapture({
        memoryType: 'decision',
        originScope: projectA,
        visibilityScope: projectA,
        actorId: 'alex',
        material: true,
        evidenceCount: 2,
        confidence: 0.8,
      }),
    ).toMatchObject({ allowed: true, code: 'candidate-capture-allowed' });
    expect(
      evaluateMemoryCapture({
        memoryType: 'decision',
        originScope: projectA,
        visibilityScope: domain,
        actorId: 'alex',
        material: true,
        evidenceCount: 2,
        confidence: 0.8,
      }),
    ).toMatchObject({ allowed: false, code: 'capture-cannot-promote' });
    expect(
      evaluateMemoryCapture({
        memoryType: 'decision',
        originScope: projectA,
        visibilityScope: projectA,
        actorId: 'alex',
        material: false,
        evidenceCount: 2,
        confidence: 0.8,
      }),
    ).toMatchObject({ allowed: false, code: 'not-material' });
  });

  it('makes person preferences owner-controlled and opt-in', () => {
    expect(
      evaluateMemoryCapture({
        memoryType: 'person-preference',
        originScope: person,
        visibilityScope: person,
        actorId: 'alex',
        material: true,
        evidenceCount: 1,
        confidence: 0.9,
        explicitUserContribution: true,
      }),
    ).toMatchObject({ allowed: true });
    expect(
      evaluateMemoryCapture({
        memoryType: 'person-preference',
        originScope: person,
        visibilityScope: person,
        actorId: 'jamie',
        material: true,
        evidenceCount: 1,
        confidence: 0.9,
        explicitUserContribution: true,
      }),
    ).toMatchObject({
      allowed: false,
      code: 'private-capture-requires-owner-consent',
    });
  });

  it('separates normal use from review and surfaces staleness', () => {
    expect(
      evaluateMemoryRetrieval({
        actorId: 'alex',
        visibilityScope: projectA,
        actorCanAccessVisibilityScope: true,
        lifecycleStatus: 'candidate',
      }),
    ).toMatchObject({ allowed: false, code: 'memory-not-active' });
    expect(
      evaluateMemoryRetrieval({
        actorId: 'alex',
        visibilityScope: projectA,
        actorCanAccessVisibilityScope: true,
        lifecycleStatus: 'candidate',
        purpose: 'review',
        actorCanReview: true,
      }),
    ).toMatchObject({ allowed: true });
    expect(
      evaluateMemoryRetrieval({
        actorId: 'alex',
        visibilityScope: projectA,
        actorCanAccessVisibilityScope: true,
        lifecycleStatus: 'active',
        stale: true,
      }),
    ).toMatchObject({
      allowed: true,
      code: 'retrieval-allowed-with-staleness',
      warning: expect.stringContaining('stale'),
    });
  });

  it('keeps person memory private even when its backing scope is misconfigured broadly', () => {
    expect(
      evaluateMemoryRetrieval({
        actorId: 'jamie',
        visibilityScope: person,
        actorCanAccessVisibilityScope: true,
        lifecycleStatus: 'active',
      }),
    ).toMatchObject({ allowed: false, code: 'person-memory-owner-only' });
  });

  it.each([
    [
      'project to another project',
      projectA,
      projectB,
      'no-direct-project-copy',
    ],
    ['project to client', projectA, clientA, 'client-layer-disabled-v1'],
    [
      'person to organisation',
      person,
      organisation,
      'person-memory-private-v1',
    ],
    [
      'organisation to project',
      organisation,
      projectA,
      'no-direct-project-copy',
    ],
  ])('denies %s', (_label, originScope, destinationScope, code) => {
    expect(
      evaluateMemoryPromotion({
        originScope,
        destinationScope,
        ...reviewedPromotion,
      }),
    ).toMatchObject({ allowed: false, code });
  });

  it('allows only a new reviewed abstraction into domain or organisation scope', () => {
    expect(
      evaluateMemoryPromotion({
        originScope: projectA,
        destinationScope: domain,
        ...reviewedPromotion,
      }),
    ).toMatchObject({ allowed: true, code: 'reviewed-abstraction-allowed' });
    for (const mutation of [
      { reviewApproved: false },
      { abstractionReviewed: false },
      { createsNewMemory: false },
      { attachesRawEvidence: true },
      { sensitivity: 'client-confidential' as const },
    ]) {
      expect(
        evaluateMemoryPromotion({
          originScope: projectA,
          destinationScope: organisation,
          ...reviewedPromotion,
          ...mutation,
        }).allowed,
      ).toBe(false);
    }
  });

  it('requires firm-reusable classification for domain-to-organisation promotion', () => {
    expect(
      evaluateMemoryPromotion({
        originScope: domain,
        destinationScope: organisation,
        ...reviewedPromotion,
      }),
    ).toMatchObject({ allowed: false, code: 'firm-reusable-required' });
    expect(
      evaluateMemoryPromotion({
        originScope: domain,
        destinationScope: organisation,
        ...reviewedPromotion,
        transferClass: 'firm-reusable',
      }),
    ).toMatchObject({ allowed: true });
  });
});
