import { describe, expect, it } from 'vitest';
import {
  SUPPLIER_DISCOVERY_DOCUMENTS,
  SUPPLIER_DISCOVERY_RULES,
} from '@/data/sources/discovery/supplier-onboarding';
import { discoverHypotheses } from '@/src/modules/discovery/hypothesis-discovery';
import { createDiscoveryPolicy } from '@/src/modules/discovery/discovery-policy';
import { IDS } from '@/src/modules/canonical/ids';

describe('hypothesis discovery', () => {
  it('forms a falsifiable cross-source candidate from unlabeled records', () => {
    const candidate = discoverHypotheses(SUPPLIER_DISCOVERY_DOCUMENTS, {
      subject: 'Supplier onboarding abandonment',
      minimumSourceDiversity: 3,
      conceptRules: SUPPLIER_DISCOVERY_RULES,
    })[0];
    expect(candidate).toMatchObject({
      sourceDiversity: 5,
      concepts: [
        { id: 'duplicate-compliance-requests' },
        { id: 'supplier-identity-mismatch' },
      ],
    });
    expect(candidate?.statement).toContain(
      'duplicate compliance-document requests',
    );
    expect(candidate?.predictions.length).toBeGreaterThan(0);
    expect(candidate?.falsificationConditions.length).toBeGreaterThan(0);
  });

  it('does not form a candidate below the required source diversity', () => {
    expect(
      discoverHypotheses(SUPPLIER_DISCOVERY_DOCUMENTS.slice(0, 2), {
        subject: 'Supplier onboarding abandonment',
        minimumSourceDiversity: 3,
        conceptRules: SUPPLIER_DISCOVERY_RULES,
      }),
    ).toEqual([]);
  });

  it('rejects a discovery policy whose corroboration threshold exceeds its sources', async () => {
    await expect(
      createDiscoveryPolicy({
        accessScopeId: IDS.scopes.everyone,
        ownerActorId: IDS.users.alex,
        serviceActorId: IDS.users.memoryAgent,
        name: 'Invalid policy',
        subject: 'An outcome',
        projectResourceId: IDS.resources.project,
        sourceIds: [IDS.sources.research, IDS.sources.meetings],
        conceptRules: SUPPLIER_DISCOVERY_RULES,
        minimumSourceDiversity: 3,
      }),
    ).rejects.toThrow(
      'The source-diversity threshold cannot exceed the configured source count',
    );
  });
});
