import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('@/src/db/pool', () => ({
  getAppPool: () => ({ query }),
}));

import {
  authorizeMutationRequest,
  RequestAuthorizationError,
} from '@/src/modules/identity/mutation-authorization';
import { sha256 } from '@/src/modules/identity/browser-session';

const actor = {
  id: '90000000-0000-4000-8000-000000000001',
  workspaceId: '10000000-0000-4000-8000-000000000001',
  name: 'Alex Chen',
  role: 'Project Lead',
  authenticationMode: 'session' as const,
  capabilities: ['ontology.review' as const, 'monitor.operate' as const],
  session: {
    id: '91000000-0000-4000-8000-000000000001',
    csrfTokenHash: sha256('csrf-secret'),
  },
};

describe('cookie mutation authorization', () => {
  beforeEach(() => query.mockReset().mockResolvedValue({ rows: [] }));

  it('requires both the configured origin and CSRF proof', async () => {
    await expect(
      authorizeMutationRequest(
        new Request('https://brain.example.test/api/v1/memory/operations', {
          method: 'POST',
          headers: {
            origin: 'https://brain.example.test',
            'x-csrf-token': 'csrf-secret',
          },
        }),
        actor,
        'monitor.operate',
      ),
    ).resolves.toBeUndefined();

    await expect(
      authorizeMutationRequest(
        new Request('https://brain.example.test/api/v1/memory/operations', {
          method: 'POST',
          headers: {
            origin: 'https://attacker.example',
            'x-csrf-token': 'csrf-secret',
          },
        }),
        actor,
        'monitor.operate',
      ),
    ).rejects.toBeInstanceOf(RequestAuthorizationError);
  });

  it('does not require browser CSRF proof for an API bearer actor', async () => {
    await expect(
      authorizeMutationRequest(
        new Request('https://brain.example.test/api/v1/memory/operations', {
          method: 'POST',
        }),
        { ...actor, authenticationMode: 'oidc', session: undefined },
        'monitor.operate',
      ),
    ).resolves.toBeUndefined();
  });

  it('denies a valid browser request without the server-owned capability', async () => {
    await expect(
      authorizeMutationRequest(
        new Request('https://brain.example.test/api/v1/memory/operations', {
          method: 'POST',
          headers: {
            origin: 'https://brain.example.test',
            'x-csrf-token': 'csrf-secret',
          },
        }),
        { ...actor, capabilities: [] },
        'monitor.operate',
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
