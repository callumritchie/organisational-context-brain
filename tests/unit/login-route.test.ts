import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('@/src/db/pool', () => ({
  getAppPool: () => ({ query }),
}));

import { GET } from '@/app/api/v1/auth/login/route';

describe('browser login route', () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue({ rows: [] });
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_OIDC_ISSUER', 'https://identity.example.test/');
    vi.stubEnv('AUTH_OIDC_AUDIENCE', 'org-brain-api');
    vi.stubEnv('AUTH_OIDC_JWKS_URL', 'https://identity.example.test/jwks');
    vi.stubEnv(
      'AUTH_OIDC_AUTHORIZATION_URL',
      'https://identity.example.test/authorize',
    );
    vi.stubEnv('AUTH_OIDC_TOKEN_URL', 'https://identity.example.test/token');
    vi.stubEnv('AUTH_OIDC_CLIENT_ID', 'org-brain-web');
    vi.stubEnv(
      'AUTH_OIDC_REDIRECT_URI',
      'https://brain.example.test/api/v1/auth/callback',
    );
    vi.stubEnv('AUTH_PUBLIC_ORIGIN', 'https://brain.example.test');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('starts a browser-bound S256 authorization-code transaction', async () => {
    const response = await GET(
      new Request(
        'https://brain.example.test/api/v1/auth/login?returnTo=/%23ask',
      ),
    );
    expect(response.status).toBe(303);
    const destination = new URL(response.headers.get('location')!);
    expect(destination.origin + destination.pathname).toBe(
      'https://identity.example.test/authorize',
    );
    expect(destination.searchParams.get('response_type')).toBe('code');
    expect(destination.searchParams.get('code_challenge_method')).toBe('S256');
    expect(destination.searchParams.get('code_challenge')).toHaveLength(43);
    expect(destination.searchParams.get('state')).toHaveLength(43);
    expect(destination.searchParams.get('nonce')).toHaveLength(43);
    expect(response.headers.get('set-cookie')).toContain(
      '__Host-org_brain_login=',
    );
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('Secure');
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]).not.toContain(
      destination.searchParams.get('state'),
    );
  });
});
