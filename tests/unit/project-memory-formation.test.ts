import { describe, expect, it } from 'vitest';
import {
  formationInputDigest,
  formProjectMemoryCandidates,
  type FormationArtifact,
} from '@/src/modules/organisational-memory/formation';
import {
  SyntheticHostProductAdapter,
  validateHostProjectSnapshot,
} from '@/src/modules/organisational-memory/host-product';

const artifacts: FormationArtifact[] = [
  {
    resourceId: '10000000-0000-4000-8000-000000000001',
    sourceType: 'conversation',
    title: 'Delivery channel',
    body: 'The team agreed to separate policy uncertainty from technical failure before redesigning the service.',
  },
  {
    resourceId: '10000000-0000-4000-8000-000000000002',
    sourceType: 'file',
    title: 'Retrospective',
    body: 'Repeated hand-offs created rework and delayed the final review by nine days.',
  },
  {
    resourceId: '10000000-0000-4000-8000-000000000003',
    sourceType: 'file',
    title: 'Status note',
    body: 'The project status is green.',
  },
];

describe('general-purpose project memory formation', () => {
  it('forms typed, falsifiable candidates without a prepared scenario label', () => {
    const candidates = formProjectMemoryCandidates(artifacts);
    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.memoryType).sort()).toEqual(
      ['anti-pattern', 'decision'].sort(),
    );
    for (const candidate of candidates) {
      expect(candidate.confidence).toBeGreaterThanOrEqual(0.67);
      expect(candidate.context.prediction).toBeTruthy();
      expect(candidate.context.falsificationCondition).toBeTruthy();
      expect(candidate.evidenceResourceIds).toHaveLength(1);
    }
  });

  it('uses a stable order-independent digest for idempotent background scans', () => {
    expect(formationInputDigest(artifacts)).toBe(
      formationInputDigest([...artifacts].reverse()),
    );
  });
});

describe('host-product project contract', () => {
  it('maps the synthetic project and an authoritative membership revision', async () => {
    const snapshot = await new SyntheticHostProductAdapter().readProject(
      'atlas-onboarding',
    );
    expect(snapshot).toMatchObject({
      provider: 'synthetic-host-product',
      membershipRevision: 'atlas-membership-v1',
    });
    expect(snapshot.members.some((member) => member.role === 'lead')).toBe(
      true,
    );
  });

  it('rejects duplicate members and snapshots without an active lead', () => {
    expect(() =>
      validateHostProjectSnapshot({
        provider: 'test',
        externalProjectId: 'project-1',
        projectResourceId: '10000000-0000-4000-8000-000000000001',
        clientResourceId: '10000000-0000-4000-8000-000000000002',
        membershipRevision: 'v1',
        members: [
          {
            actorId: '10000000-0000-4000-8000-000000000003',
            role: 'viewer',
            status: 'active',
          },
          {
            actorId: '10000000-0000-4000-8000-000000000003',
            role: 'viewer',
            status: 'active',
          },
        ],
      }),
    ).toThrow();
  });
});
