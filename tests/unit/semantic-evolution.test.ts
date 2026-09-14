import { describe, expect, it } from 'vitest';
import { ONTOLOGY } from '@/src/modules/ontology/ontology';
import {
  OntologyProposalConflictError,
  applyOntologyChangeSet,
} from '@/src/modules/ontology/semantic-evolution';

const supplierChanges = [
  {
    kind: 'add-resource-type' as const,
    name: 'Supplier',
    resourceKind: 'entity' as const,
    description: 'An external organisation supplying goods or services.',
  },
  {
    kind: 'add-relationship' as const,
    name: 'IS_ONBOARDED_THROUGH',
    from: ['Supplier'],
    to: ['Project'],
    description: 'A supplier is enrolled through an onboarding project.',
  },
  {
    kind: 'add-alias' as const,
    alias: 'vendor',
    target: 'Supplier',
    description: 'Vendor maps to the governed canonical Supplier concept.',
  },
];

describe('governed semantic evolution', () => {
  it('applies an additive type, relationship and alias atomically', () => {
    const next = applyOntologyChangeSet(ONTOLOGY, supplierChanges);

    expect(next.resourceTypes.Supplier).toMatchObject({ kind: 'entity' });
    expect(next.relationships.IS_ONBOARDED_THROUGH).toEqual({
      from: ['Supplier'],
      to: ['Project'],
      description: supplierChanges[1].description,
    });
    expect(next.aliases.vendor).toMatchObject({ target: 'Supplier' });
    expect(ONTOLOGY.resourceTypes.Supplier).toBeUndefined();
  });

  it('fails the whole change set when a relationship endpoint is undefined', () => {
    expect(() =>
      applyOntologyChangeSet(ONTOLOGY, [
        {
          kind: 'add-relationship',
          name: 'DEPENDS_ON_UNKNOWN',
          from: ['Project'],
          to: ['UnknownDomain'],
          description:
            'A deliberately invalid semantic relationship for validation.',
        },
      ]),
    ).toThrow(OntologyProposalConflictError);
    expect(ONTOLOGY.relationships.DEPENDS_ON_UNKNOWN).toBeUndefined();
  });
});
