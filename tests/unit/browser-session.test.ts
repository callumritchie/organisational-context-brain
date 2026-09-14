import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  cookieNames,
  readBrowserOidcConfig,
  safeReturnTo,
  verifyOidcIdToken,
} from '@/src/modules/identity/browser-session';
import { AuthenticationError } from '@/src/modules/identity/errors';

const config = {
  issuer: 'https://identity.example.test/',
  audience: 'org-brain-api',
  jwksUrl: 'https://identity.example.test/jwks',
  authorizationUrl: 'https://identity.example.test/authorize',
  tokenUrl: 'https://identity.example.test/token',
  clientId: 'org-brain-web',
  redirectUri: 'https://brain.example.test/api/v1/auth/callback',
  publicOrigin: 'https://brain.example.test',
};

async function idToken(nonce: string) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'browser-test-key';
  const token = await new SignJWT({ nonce })
    .setProtectedHeader({ alg: 'RS256', kid: 'browser-test-key' })
    .setIssuer(config.issuer)
    .setAudience(config.clientId)
    .setSubject('person-123')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  return { token, keys: createLocalJWKSet({ keys: [publicJwk] }) };
}

describe('browser OIDC and session primitives', () => {
  it('accepts an exact nonce and rejects a swapped login transaction', async () => {
    const fixture = await idToken('one-time-nonce');
    await expect(
      verifyOidcIdToken(fixture.token, 'one-time-nonce', config, fixture.keys),
    ).resolves.toEqual({
      issuer: config.issuer,
      audience: config.audience,
      subject: 'person-123',
    });
    await expect(
      verifyOidcIdToken(
        fixture.token,
        'another-login-nonce',
        config,
        fixture.keys,
      ),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('requires explicit HTTPS browser endpoints in production', () => {
    expect(() =>
      readBrowserOidcConfig({
        NODE_ENV: 'production',
        AUTH_OIDC_ISSUER: config.issuer,
        AUTH_OIDC_AUDIENCE: config.audience,
        AUTH_OIDC_JWKS_URL: config.jwksUrl,
        AUTH_OIDC_AUTHORIZATION_URL: 'http://identity.example.test/authorize',
        AUTH_OIDC_TOKEN_URL: config.tokenUrl,
        AUTH_OIDC_CLIENT_ID: config.clientId,
        AUTH_OIDC_REDIRECT_URI: config.redirectUri,
        AUTH_PUBLIC_ORIGIN: config.publicOrigin,
      }),
    ).toThrow('must use HTTPS');
    expect(() =>
      readBrowserOidcConfig({
        NODE_ENV: 'production',
        AUTH_OIDC_ISSUER: config.issuer,
        AUTH_OIDC_AUDIENCE: config.audience,
        AUTH_OIDC_JWKS_URL: config.jwksUrl,
        AUTH_OIDC_AUTHORIZATION_URL: config.authorizationUrl,
        AUTH_OIDC_TOKEN_URL: config.tokenUrl,
        AUTH_OIDC_CLIENT_ID: config.clientId,
        AUTH_OIDC_REDIRECT_URI: config.redirectUri,
      }),
    ).toThrow('AUTH_PUBLIC_ORIGIN is required');
  });

  it('permits only same-origin relative return paths and uses host cookies on HTTPS', () => {
    expect(safeReturnTo('/#ask')).toBe('/#ask');
    expect(safeReturnTo('//attacker.example')).toBe('/');
    expect(safeReturnTo('https://attacker.example')).toBe('/');
    expect(cookieNames(true).session).toBe('__Host-org_brain_session');
    expect(cookieNames(false).session).toBe('org_brain_session');
  });
});
