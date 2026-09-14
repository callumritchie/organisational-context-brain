import { describe, expect, it } from 'vitest';
import {
  SUPPLIER_DISCOVERY_DOCUMENTS,
  SUPPLIER_DISCOVERY_RULES,
} from '@/data/sources/discovery/supplier-onboarding';
import { discoverHypotheses } from '@/src/modules/discovery/hypothesis-discovery';

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
});
