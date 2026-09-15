import { readBrowserOidcConfig } from '@/src/modules/identity/browser-session';

export type ProductionProcess = 'web' | 'operations' | 'release';

export class ProductionConfigurationError extends Error {}

const disposablePasswords = new Set([
  'postgres',
  'org_brain_app',
  'org_brain_ingest',
]);

function databaseUrl(
  environment: Record<string, string | undefined>,
  name: string,
  options: { owner?: boolean } = {},
) {
  const value = environment[name]?.trim();
  if (!value) throw new ProductionConfigurationError(`${name} is required.`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ProductionConfigurationError(`${name} is invalid.`);
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new ProductionConfigurationError(`${name} must be a PostgreSQL URL.`);
  }
  if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    throw new ProductionConfigurationError(
      `${name} must not target a loopback database in an enforced deployment.`,
    );
  }
  if (!parsed.username || !parsed.password) {
    throw new ProductionConfigurationError(
      `${name} must contain a dedicated user and password.`,
    );
  }
  if (disposablePasswords.has(decodeURIComponent(parsed.password))) {
    throw new ProductionConfigurationError(
      `${name} still contains a disposable development password.`,
    );
  }
  if (!options.owner && parsed.username === 'postgres') {
    throw new ProductionConfigurationError(
      `${name} must not use the owning PostgreSQL role.`,
    );
  }
  const sslMode = parsed.searchParams.get('sslmode');
  if (!sslMode || !['require', 'verify-ca', 'verify-full'].includes(sslMode)) {
    throw new ProductionConfigurationError(
      `${name} must require TLS with sslmode=require, verify-ca or verify-full.`,
    );
  }
}

function requiredSecret(
  environment: Record<string, string | undefined>,
  name: string,
) {
  const value = environment[name]?.trim();
  if (!value || value.length < 16 || disposablePasswords.has(value)) {
    throw new ProductionConfigurationError(
      `${name} must be a non-disposable secret of at least 16 characters.`,
    );
  }
}

export function validateProductionConfiguration(
  profile: ProductionProcess,
  environment: Record<string, string | undefined> = process.env,
) {
  if (environment.NODE_ENV !== 'production') {
    throw new ProductionConfigurationError('NODE_ENV must be production.');
  }

  if (profile === 'release') {
    databaseUrl(environment, 'DATABASE_URL_OWNER', { owner: true });
    requiredSecret(environment, 'DATABASE_PASSWORD_APP');
    requiredSecret(environment, 'DATABASE_PASSWORD_INGEST');
    return { profile, authentication: false } as const;
  }

  if (environment.DATABASE_URL_OWNER) {
    throw new ProductionConfigurationError(
      'DATABASE_URL_OWNER must not be available to web or operations processes.',
    );
  }
  databaseUrl(environment, 'DATABASE_URL_APP');
  databaseUrl(environment, 'DATABASE_URL_INGEST');
  if (!/^[a-f0-9]{40}$/i.test(environment.APP_COMMIT_SHA?.trim() ?? '')) {
    throw new ProductionConfigurationError(
      'APP_COMMIT_SHA must be the full 40-character source commit.',
    );
  }

  if (profile === 'web') {
    readBrowserOidcConfig(environment);
    return { profile, authentication: true } as const;
  }
  return { profile, authentication: false } as const;
}
