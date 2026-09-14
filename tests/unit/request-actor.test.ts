import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDS } from '@/src/modules/canonical/ids';
import {
  AuthenticationError,
  readOidcAuthConfig,
  resolveRequestActor,
  verifyOidcAccessToken,
} from '@/src/modules/identity/request-actor';

const config = {
  issuer: 'https://identity.example.test/',
  audience: 'org-brain-api',
  jwksUrl: 'https://identity.example.test/.well-known/jwks.json',
};

async function signedFixture(
  overrides: { audience?: string; expiresAt?: string } = {},
) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'test-key';
  publicJwk.use = 'sig';
  const token = await new SignJWT({ purpose: 'test' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(config.issuer)
    .setAudience(overrides.audience ?? config.audience)
    .setSubject('person-123')
    .setIssuedAt()
    .setExpirationTime(overrides.expiresAt ?? '5m')
    .sign(privateKey);
  return { token, resolver: createLocalJWKSet({ keys: [publicJwk] }) };
}

describe('production request identity', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('verifies signature, issuer, audience, subject and expiry', async () => {
    const fixture = await signedFixture();
    await expect(
      verifyOidcAccessToken(
        `Bearer ${fixture.token}`,
        config,
        fixture.resolver,
      ),
    ).resolves.toEqual({
      issuer: config.issuer,
      audience: config.audience,
      subject: 'person-123',
    });
  });

  it('fails closed for the wrong audience or an expired token', async () => {
    const wrongAudience = await signedFixture({ audience: 'another-api' });
    await expect(
      verifyOidcAccessToken(
        `Bearer ${wrongAudience.token}`,
        config,
        wrongAudience.resolver,
      ),
    ).rejects.toBeInstanceOf(AuthenticationError);

    const expired = await signedFixture({ expiresAt: '-10s' });
    await expect(
      verifyOidcAccessToken(
        `Bearer ${expired.token}`,
        config,
        expired.resolver,
      ),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('requires an explicit HTTPS production configuration', () => {
    expect(() => readOidcAuthConfig({})).toThrow(AuthenticationError);
    expect(() =>
      readOidcAuthConfig({
        AUTH_OIDC_ISSUER: config.issuer,
        AUTH_OIDC_AUDIENCE: config.audience,
        AUTH_OIDC_JWKS_URL: 'http://identity.example.test/jwks',
      }),
    ).toThrow('must use HTTPS');
  });

  it('keeps the synthetic persona header available only in non-production mode', async () => {
    const actor = await resolveRequestActor(
      new Request('http://localhost/api', {
        headers: { 'x-demo-actor': IDS.users.jamie },
      }),
    );
    expect(actor).toMatchObject({
      id: IDS.users.jamie,
      role: 'Consultant',
      authenticationMode: 'demo',
    });
    await expect(
      resolveRequestActor(
        new Request('http://localhost/api', {
          headers: { 'x-demo-actor': '90000000-0000-4000-8000-000000000099' },
        }),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects an unsigned demo header in production before configuration lookup', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(
      resolveRequestActor(
        new Request('https://brain.example.test/api', {
          headers: { 'x-demo-actor': IDS.users.alex },
        }),
      ),
    ).rejects.toMatchObject({
      message: 'A browser session or bearer token is required.',
      status: 401,
    });
  });
});
