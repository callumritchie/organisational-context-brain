import { describe, expect, it } from 'vitest';
import { IDS } from '@/src/modules/canonical/ids';
import { actorHasCapability } from '@/src/modules/identity/authorization';

describe('action capabilities', () => {
  it('authorises a mapped user by explicit capability rather than fixture identity', () => {
    expect(
      actorHasCapability(
        {
          id: '90000000-0000-4000-8000-000000000001',
          role: 'Semantic Steward',
          authenticationMode: 'oidc',
          capabilities: ['ontology.review'],
        },
        'ontology.review',
      ),
    ).toBe(true);
  });

  it('treats an explicit empty capability set as authoritative', () => {
    expect(
      actorHasCapability(
        {
          id: IDS.users.alex,
          role: 'Project Lead',
          authenticationMode: 'oidc',
          capabilities: [],
        },
        'ontology.review',
      ),
    ).toBe(false);
  });
});
