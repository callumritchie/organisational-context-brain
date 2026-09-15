import { describe, expect, it } from 'vitest';
import {
  ProductionConfigurationError,
  validateProductionConfiguration,
} from '@/src/modules/operations/production-config';

const runtime = {
  NODE_ENV: 'production',
  APP_COMMIT_SHA: '4b9b69c45d920f92627b3184620bd95dc108dfa9',
  DATABASE_URL_APP:
    'postgresql://org_brain_app:a-long-runtime-password@db.example.test/org_brain?sslmode=require',
  DATABASE_URL_INGEST:
    'postgresql://org_brain_ingest:another-long-password@db.example.test/org_brain?sslmode=verify-full',
  AUTH_OIDC_ISSUER: 'https://identity.example.test/',
  AUTH_OIDC_AUDIENCE: 'org-brain-api',
  AUTH_OIDC_JWKS_URL: 'https://identity.example.test/jwks',
  AUTH_OIDC_AUTHORIZATION_URL: 'https://identity.example.test/authorize',
  AUTH_OIDC_TOKEN_URL: 'https://identity.example.test/token',
  AUTH_OIDC_CLIENT_ID: 'org-brain-web',
  AUTH_OIDC_REDIRECT_URI: 'https://brain.example.test/api/v1/auth/callback',
  AUTH_PUBLIC_ORIGIN: 'https://brain.example.test',
};

describe('enforced production configuration', () => {
  it('accepts least-privilege TLS runtime profiles', () => {
    expect(validateProductionConfiguration('web', runtime)).toEqual({
      profile: 'web',
      authentication: true,
    });
    expect(validateProductionConfiguration('operations', runtime)).toEqual({
      profile: 'operations',
      authentication: false,
    });
  });

  it('rejects an owner credential, loopback database or disposable password in runtime', () => {
    expect(() =>
      validateProductionConfiguration('web', {
        ...runtime,
        DATABASE_URL_OWNER:
          'postgresql://postgres:a-long-owner-password@db.example.test/org_brain?sslmode=require',
      }),
    ).toThrow('must not be available');
    expect(() =>
      validateProductionConfiguration('operations', {
        ...runtime,
        DATABASE_URL_APP:
          'postgresql://org_brain_app:a-long-runtime-password@localhost/org_brain?sslmode=require',
      }),
    ).toThrow('must not target a loopback');
    expect(() =>
      validateProductionConfiguration('operations', {
        ...runtime,
        DATABASE_URL_INGEST:
          'postgresql://org_brain_ingest:org_brain_ingest@db.example.test/org_brain?sslmode=require',
      }),
    ).toThrow('disposable development password');
  });

  it('keeps owner credentials in a release-only profile', () => {
    expect(
      validateProductionConfiguration('release', {
        NODE_ENV: 'production',
        DATABASE_URL_OWNER:
          'postgresql://postgres:a-long-owner-password@db.example.test/org_brain?sslmode=verify-full',
        DATABASE_PASSWORD_APP: 'a-new-application-password',
        DATABASE_PASSWORD_INGEST: 'a-new-ingestion-password',
      }),
    ).toEqual({ profile: 'release', authentication: false });
    expect(() =>
      validateProductionConfiguration('release', {
        NODE_ENV: 'production',
        DATABASE_URL_OWNER:
          'postgresql://postgres:a-long-owner-password@db.example.test/org_brain?sslmode=require',
        DATABASE_PASSWORD_APP: 'org_brain_app',
        DATABASE_PASSWORD_INGEST: 'a-new-ingestion-password',
      }),
    ).toThrow(ProductionConfigurationError);
  });
});
