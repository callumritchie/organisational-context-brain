export const memoryPolicyVersion = 'memory-isolation-v1';

export const memoryScopeKinds = [
  'person',
  'project',
  'client',
  'domain',
  'organisation',
] as const;
export type MemoryScopeKind = (typeof memoryScopeKinds)[number];

export const memoryTypes = [
  'decision',
  'approach-pattern',
  'risk-response',
  'constraint-adaptation',
  'anti-pattern',
  'stakeholder-pattern',
  'person-preference',
] as const;
export type MemoryType = (typeof memoryTypes)[number];

export const transferClasses = [
  'client-confidential',
  'client-reusable',
  'abstractable',
  'firm-reusable',
] as const;
export type TransferClass = (typeof transferClasses)[number];

export const memoryOutcomeStatuses = [
  'untested',
  'supported',
  'validated',
  'mixed',
  'invalidated',
] as const;
export type MemoryOutcomeStatus = (typeof memoryOutcomeStatuses)[number];

export interface MemoryScopeDescriptor {
  id: string;
  kind: MemoryScopeKind;
  ownerActorId?: string;
  subjectResourceId?: string;
  parentScopeId?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  code: string;
  rationale: string;
  policyVersion: typeof memoryPolicyVersion;
  warning?: string;
}

function decision(
  allowed: boolean,
  code: string,
  rationale: string,
  warning?: string,
): PolicyDecision {
  return {
    allowed,
    code,
    rationale,
    policyVersion: memoryPolicyVersion,
    ...(warning ? { warning } : {}),
  };
}

export function evaluateMemoryCapture(input: {
  memoryType: MemoryType;
  originScope: MemoryScopeDescriptor;
  visibilityScope: MemoryScopeDescriptor;
  actorId: string;
  material: boolean;
  evidenceCount: number;
  confidence: number;
  explicitUserContribution?: boolean;
}) {
  if (!input.material) {
    return decision(
      false,
      'not-material',
      'Short or tactical activity must not create durable memory.',
    );
  }
  if (input.evidenceCount < 1 || input.confidence < 0.65) {
    return decision(
      false,
      'quality-threshold-not-met',
      'A candidate requires evidence and confidence of at least 0.65.',
    );
  }
  if (input.originScope.id !== input.visibilityScope.id) {
    return decision(
      false,
      'capture-cannot-promote',
      'Initial capture remains in its origin scope; promotion is a separate reviewed act.',
    );
  }
  if (input.originScope.kind === 'person') {
    if (
      input.originScope.ownerActorId !== input.actorId ||
      !input.explicitUserContribution ||
      input.memoryType !== 'person-preference'
    ) {
      return decision(
        false,
        'private-capture-requires-owner-consent',
        'Person memory is opt-in, preference-only and controlled by its owner.',
      );
    }
  } else if (input.memoryType === 'person-preference') {
    return decision(
      false,
      'preference-requires-person-scope',
      'A person preference cannot be stored in a shared scope.',
    );
  }
  return decision(
    true,
    'candidate-capture-allowed',
    'The material signal may enter review as a candidate in its origin scope.',
  );
}

export function evaluateMemoryRetrieval(input: {
  actorId: string;
  visibilityScope: MemoryScopeDescriptor;
  actorCanAccessVisibilityScope: boolean;
  lifecycleStatus:
    | 'candidate'
    | 'active'
    | 'superseded'
    | 'retired'
    | 'rejected';
  purpose?: 'use' | 'review' | 'audit';
  actorCanReview?: boolean;
  stale?: boolean;
}) {
  if (!input.actorCanAccessVisibilityScope) {
    return decision(
      false,
      'visibility-scope-denied',
      'The actor is not a member of the memory visibility scope.',
    );
  }
  if (
    input.visibilityScope.kind === 'person' &&
    input.visibilityScope.ownerActorId !== input.actorId
  ) {
    return decision(
      false,
      'person-memory-owner-only',
      'A person memory remains private even if its backing access scope is broader.',
    );
  }
  const purpose = input.purpose ?? 'use';
  if (purpose === 'use' && input.lifecycleStatus !== 'active') {
    return decision(
      false,
      'memory-not-active',
      'Only active memories may influence normal project work.',
    );
  }
  if (purpose !== 'use' && !input.actorCanReview) {
    return decision(
      false,
      'review-capability-required',
      'Candidate and audit access requires explicit review authority.',
    );
  }
  return decision(
    true,
    input.stale ? 'retrieval-allowed-with-staleness' : 'retrieval-allowed',
    'The actor and intended use satisfy the memory visibility contract.',
    input.stale
      ? 'This memory is stale and must be presented with its time context.'
      : undefined,
  );
}

function reviewedAbstractionRequirements(input: {
  transferClass: TransferClass;
  sensitivity: 'client-confidential' | 'internal' | 'restricted';
  reviewApproved: boolean;
  abstractionReviewed: boolean;
  createsNewMemory: boolean;
  attachesRawEvidence: boolean;
}) {
  if (input.sensitivity === 'client-confidential') {
    return decision(
      false,
      'client-confidential-cannot-propagate',
      'Client-confidential substance must remain in its originating client boundary.',
    );
  }
  if (!['abstractable', 'firm-reusable'].includes(input.transferClass)) {
    return decision(
      false,
      'transfer-class-denied',
      'The source is not classified for cross-boundary abstraction.',
    );
  }
  if (!input.reviewApproved || !input.abstractionReviewed) {
    return decision(
      false,
      'human-review-required',
      'Cross-boundary promotion requires an attributable abstraction review.',
    );
  }
  if (!input.createsNewMemory) {
    return decision(
      false,
      'new-artifact-required',
      'Promotion creates a new governed memory; it never broadens the source row.',
    );
  }
  if (input.attachesRawEvidence) {
    return decision(
      false,
      'raw-evidence-cannot-propagate',
      'Restricted source evidence remains behind its original boundary.',
    );
  }
  return null;
}

export function evaluateMemoryPromotion(input: {
  originScope: MemoryScopeDescriptor;
  destinationScope: MemoryScopeDescriptor;
  transferClass: TransferClass;
  sensitivity: 'client-confidential' | 'internal' | 'restricted';
  reviewApproved: boolean;
  abstractionReviewed: boolean;
  createsNewMemory: boolean;
  attachesRawEvidence: boolean;
}) {
  const from = input.originScope.kind;
  const to = input.destinationScope.kind;
  if (input.originScope.id === input.destinationScope.id) {
    return decision(
      false,
      'same-scope-is-enrichment',
      'Corroboration within a scope enriches the existing memory rather than promoting it.',
    );
  }
  if (from === 'person' || to === 'person') {
    return decision(
      false,
      'person-memory-private-v1',
      'Version 1 never promotes data into or out of a private person scope.',
    );
  }
  if (to === 'client') {
    return decision(
      false,
      'client-layer-disabled-v1',
      'Client-level propagation is disabled until relationship membership is formalised.',
    );
  }
  if (to === 'project') {
    return decision(
      false,
      'no-direct-project-copy',
      'A memory is retrieved into a project when permitted; it is never copied between projects.',
    );
  }
  if (from === 'organisation') {
    return decision(
      false,
      'organisation-memory-is-retrieved',
      'Organisation memory is consumed through retrieval rather than copied downward.',
    );
  }
  if (from === 'domain' && to !== 'organisation') {
    return decision(
      false,
      'domain-to-domain-copy-denied',
      'Domain memory may only be promoted into curated organisation memory.',
    );
  }
  if (!['domain', 'organisation'].includes(to)) {
    return decision(
      false,
      'promotion-path-denied',
      'The requested scope transition is not an approved version 1 path.',
    );
  }
  const unmet = reviewedAbstractionRequirements(input);
  if (unmet) return unmet;
  if (from === 'domain' && input.transferClass !== 'firm-reusable') {
    return decision(
      false,
      'firm-reusable-required',
      'Only firm-reusable domain memory may enter the organisation layer.',
    );
  }
  return decision(
    true,
    'reviewed-abstraction-allowed',
    'A new reviewed abstraction may be created without widening access to its source evidence.',
  );
}
