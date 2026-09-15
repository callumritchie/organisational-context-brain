import { describe, expect, it, vi } from 'vitest';
import {
  assertSecurityHeaders,
  certifyStaging,
} from '@/src/modules/operations/staging-certification';
import { contentSecurityPolicy } from '@/src/modules/operations/security-policy';

const commit = '64478352a030d015511583f157ca2656b5b153e9';

function response(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
}

function securityHeaders() {
  return new Headers({
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'permissions-policy':
      'camera=(), microphone=(), geolocation=(), payment=()',
    'content-security-policy': contentSecurityPolicy('test-nonce_123', false),
  });
}

function successfulFetch() {
  return vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const target = new URL(input.toString());
    if (target.pathname === '/api/health/live') {
      return response(
        { status: 'live', commit },
        { headers: { 'cache-control': 'no-store' } },
      );
    }
    if (target.pathname === '/api/health/ready') {
      return response({
        status: 'ready',
        database: 'available',
        migrations: 'current',
      });
    }
    if (target.pathname === '/') {
      return new Response('<html></html>', {
        status: 200,
        headers: securityHeaders(),
      });
    }
    if (target.pathname === '/api/v1/auth/login') {
      return new Response(null, {
        status: 303,
        headers: {
          location:
            'https://identity.example.test/authorize?response_type=code&client_id=org-brain-web&scope=openid%20profile&redirect_uri=https%3A%2F%2Fbrain.example.test%2Fapi%2Fv1%2Fauth%2Fcallback&code_challenge_method=S256&code_challenge=abcdefghijklmnopqrstuvwxyz1234567890ABCDEFG&state=abcdefghijklmnopqrstuvwxyz123456&nonce=abcdefghijklmnopqrstuvwxyz123456',
          'set-cookie':
            '__Host-org_brain_login=value; Path=/; HttpOnly; Secure; SameSite=Lax',
        },
      });
    }
    if (target.pathname === '/api/v1/session') {
      const authorization = new Headers(init?.headers).get('authorization');
      if (authorization === 'Bearer valid-test-token') {
        return response({
          actor: {
            workspaceId: '10000000-0000-4000-8000-000000000001',
            authenticationMode: 'oidc',
          },
        });
      }
      return response({ type: 'authentication-failed' }, { status: 401 });
    }
    return response({ type: 'not-found' }, { status: 404 });
  });
}

describe('staging certification', () => {
  it('certifies immutable health, browser hardening and real identity mapping', async () => {
    const request = successfulFetch();
    const result = await certifyStaging({
      baseUrl: 'https://brain.example.test',
      expectedCommit: commit,
      expectedIdentityOrigin: 'https://identity.example.test',
      bearerToken: 'valid-test-token',
      fetchImplementation: request as unknown as typeof fetch,
    });

    expect(result.outcome).toBe('passed');
    expect(result.checks).toHaveLength(8);
    expect(result.checks.every((check) => check.status === 'passed')).toBe(
      true,
    );
    expect(JSON.stringify(result)).not.toContain('valid-test-token');
  });

  it('is explicitly incomplete when only the public boundary is checked', async () => {
    const result = await certifyStaging({
      baseUrl: 'https://brain.example.test',
      expectedCommit: commit,
      expectedIdentityOrigin: 'https://identity.example.test',
      allowPublicOnly: true,
      fetchImplementation: successfulFetch() as unknown as typeof fetch,
    });
    expect(result.outcome).toBe('incomplete');
    expect(result.checks.at(-1)).toMatchObject({
      id: 'mapped-identity',
      status: 'skipped',
    });
  });

  it('fails closed on the wrong deployed commit or weak browser headers', async () => {
    const request = successfulFetch();
    request.mockImplementationOnce(async () =>
      response(
        { status: 'live', commit: '0000000000000000000000000000000000000000' },
        { headers: { 'cache-control': 'no-store' } },
      ),
    );
    const result = await certifyStaging({
      baseUrl: 'https://brain.example.test',
      expectedCommit: commit,
      expectedIdentityOrigin: 'https://identity.example.test',
      bearerToken: 'valid-test-token',
      fetchImplementation: request as unknown as typeof fetch,
    });
    expect(result.outcome).toBe('failed');
    expect(result.checks[0]).toMatchObject({ id: 'live', status: 'failed' });
  });
});

describe('browser security policy', () => {
  it('uses a strict nonce for scripts and permits only the required style compromise', () => {
    const production = contentSecurityPolicy('random-nonce', false);
    expect(production).toContain(
      "script-src 'self' 'nonce-random-nonce' 'strict-dynamic'",
    );
    expect(production).not.toMatch(/script-src [^;]*'unsafe-inline'/);
    expect(production).toContain("style-src 'self' 'unsafe-inline'");
    expect(() => assertSecurityHeaders(securityHeaders())).not.toThrow();
  });
});
