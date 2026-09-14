import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { getAppPool } from '@/src/db/pool';
import { AuthenticationError } from './errors';
import type { OidcAuthConfig } from './request-actor';

export const SESSION_COOKIE = '__Host-org_brain_session';
export const DEVELOPMENT_SESSION_COOKIE = 'org_brain_session';
export const CSRF_COOKIE = '__Host-org_brain_csrf';
export const DEVELOPMENT_CSRF_COOKIE = 'org_brain_csrf';
export const LOGIN_BINDING_COOKIE = '__Host-org_brain_login';
export const DEVELOPMENT_LOGIN_BINDING_COOKIE = 'org_brain_login';

const SESSION_SECONDS = 8 * 60 * 60;
const IDLE_SECONDS = 30 * 60;

export interface BrowserOidcConfig extends OidcAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  publicOrigin: string;
}

export interface LoginAttempt {
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  returnTo: string;
}

export interface BrowserSessionIdentity {
  issuer: string;
  audience: string;
  subject: string;
}

const tokenResponseSchema = z
  .object({
    id_token: z.string().min(1),
    token_type: z.string().optional(),
  })
  .passthrough();

function requiredHttpsUrl(
  value: string | undefined,
  label: string,
  allowLocalHttp = false,
) {
  if (!value?.trim()) {
    throw new AuthenticationError(`${label} is not configured.`, 503);
  }
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new AuthenticationError(`${label} is invalid.`, 503);
  }
  const localHttp =
    allowLocalHttp &&
    parsed.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !localHttp) {
    throw new AuthenticationError(`${label} must use HTTPS.`, 503);
  }
  return parsed.toString();
}

export function readBrowserOidcConfig(
  environment: Record<string, string | undefined> = process.env,
): BrowserOidcConfig {
  const allowLocalHttp = environment.NODE_ENV !== 'production';
  const issuer = requiredHttpsUrl(
    environment.AUTH_OIDC_ISSUER,
    'AUTH_OIDC_ISSUER',
  );
  const audience = environment.AUTH_OIDC_AUDIENCE?.trim();
  const jwksUrl = requiredHttpsUrl(
    environment.AUTH_OIDC_JWKS_URL,
    'AUTH_OIDC_JWKS_URL',
  );
  const authorizationUrl = requiredHttpsUrl(
    environment.AUTH_OIDC_AUTHORIZATION_URL,
    'AUTH_OIDC_AUTHORIZATION_URL',
  );
  const tokenUrl = requiredHttpsUrl(
    environment.AUTH_OIDC_TOKEN_URL,
    'AUTH_OIDC_TOKEN_URL',
  );
  const redirectUri = requiredHttpsUrl(
    environment.AUTH_OIDC_REDIRECT_URI,
    'AUTH_OIDC_REDIRECT_URI',
    allowLocalHttp,
  );
  const clientId = environment.AUTH_OIDC_CLIENT_ID?.trim();
  const clientSecret = environment.AUTH_OIDC_CLIENT_SECRET?.trim();
  const configuredPublicOrigin = environment.AUTH_PUBLIC_ORIGIN?.trim();
  if (!audience || !clientId) {
    throw new AuthenticationError(
      'AUTH_OIDC_AUDIENCE and AUTH_OIDC_CLIENT_ID are required.',
      503,
    );
  }
  if (clientId.length > 255 || audience.length > 255) {
    throw new AuthenticationError(
      'The OIDC client configuration is invalid.',
      503,
    );
  }
  if (!configuredPublicOrigin && environment.NODE_ENV === 'production') {
    throw new AuthenticationError('AUTH_PUBLIC_ORIGIN is required.', 503);
  }
  const publicOrigin = configuredPublicOrigin
    ? requiredHttpsUrl(
        configuredPublicOrigin,
        'AUTH_PUBLIC_ORIGIN',
        allowLocalHttp,
      )
    : new URL(redirectUri).origin;
  if (
    new URL(publicOrigin).origin !== publicOrigin.replace(/\/$/, '') ||
    new URL(redirectUri).origin !== new URL(publicOrigin).origin
  ) {
    throw new AuthenticationError(
      'AUTH_PUBLIC_ORIGIN must be an origin matching AUTH_OIDC_REDIRECT_URI.',
      503,
    );
  }
  return {
    issuer,
    audience,
    jwksUrl,
    authorizationUrl,
    tokenUrl,
    clientId,
    clientSecret,
    redirectUri,
    publicOrigin: new URL(publicOrigin).origin,
  };
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function userAgentHash(request: Request) {
  const value = request.headers.get('user-agent')?.slice(0, 1000);
  return value ? sha256(value) : null;
}

export function randomSecret(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function safeReturnTo(value: string | null) {
  return value && /^\/(?!\/)/.test(value) ? value.slice(0, 1000) : '/';
}

export function cookieNames(secure: boolean) {
  return secure
    ? {
        session: SESSION_COOKIE,
        csrf: CSRF_COOKIE,
        login: LOGIN_BINDING_COOKIE,
      }
    : {
        session: DEVELOPMENT_SESSION_COOKIE,
        csrf: DEVELOPMENT_CSRF_COOKIE,
        login: DEVELOPMENT_LOGIN_BINDING_COOKIE,
      };
}

export function cookieValue(request: Request, name: string) {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(item.slice(separator + 1).trim());
  }
  return null;
}

export function sessionCookieValue(request: Request) {
  return (
    cookieValue(request, SESSION_COOKIE) ??
    cookieValue(request, DEVELOPMENT_SESSION_COOKIE)
  );
}

export async function beginLoginAttempt(input: {
  state: string;
  browserBinding: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  returnTo: string;
}) {
  await getAppPool().query(
    `SELECT begin_oidc_login_attempt($1, $2, $3, $4, $5, $6, $7)`,
    [
      sha256(input.state),
      sha256(input.browserBinding),
      input.codeVerifier,
      input.nonce,
      input.redirectUri,
      input.returnTo,
      new Date(Date.now() + 5 * 60 * 1000),
    ],
  );
}

export async function consumeLoginAttempt(
  state: string,
  browserBinding: string,
): Promise<LoginAttempt> {
  const result = await getAppPool().query<{
    code_verifier: string;
    nonce: string;
    redirect_uri: string;
    return_to: string;
  }>(
    `SELECT code_verifier, nonce, redirect_uri, return_to
     FROM consume_oidc_login_attempt($1, $2)`,
    [sha256(state), sha256(browserBinding)],
  );
  const attempt = result.rows[0];
  if (!attempt) {
    throw new AuthenticationError(
      'The sign-in attempt is missing, expired, or has already been used.',
    );
  }
  return {
    codeVerifier: attempt.code_verifier,
    nonce: attempt.nonce,
    redirectUri: attempt.redirect_uri,
    returnTo: safeReturnTo(attempt.return_to),
  };
}

export async function exchangeAuthorizationCode(
  code: string,
  attempt: LoginAttempt,
  config: BrowserOidcConfig,
) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: attempt.redirectUri,
    client_id: config.clientId,
    code_verifier: attempt.codeVerifier,
  });
  const headers = new Headers({
    accept: 'application/json',
    'content-type': 'application/x-www-form-urlencoded',
  });
  if (config.clientSecret) {
    headers.set(
      'authorization',
      `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
    );
    body.delete('client_id');
  }
  let response: Response;
  try {
    response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AuthenticationError(
      'The identity provider could not be reached.',
      502,
    );
  }
  if (!response.ok) {
    throw new AuthenticationError('The authorization code was rejected.');
  }
  const payload = tokenResponseSchema.safeParse(await response.json());
  if (!payload.success) {
    throw new AuthenticationError(
      'The identity provider response was invalid.',
      502,
    );
  }
  return payload.data.id_token;
}

export async function verifyOidcIdToken(
  idToken: string,
  nonce: string,
  config: BrowserOidcConfig,
  keyResolver?: JWTVerifyGetKey,
): Promise<BrowserSessionIdentity> {
  try {
    const verified = await jwtVerify(
      idToken,
      keyResolver ?? createRemoteJWKSet(new URL(config.jwksUrl)),
      {
        issuer: config.issuer,
        audience: config.clientId,
        algorithms: ['RS256', 'ES256'],
        clockTolerance: 5,
      },
    );
    if (
      typeof verified.payload.sub !== 'string' ||
      !verified.payload.sub.trim() ||
      verified.payload.sub.length > 255 ||
      typeof verified.payload.exp !== 'number' ||
      typeof verified.payload.iat !== 'number' ||
      typeof verified.payload.nonce !== 'string' ||
      !constantTimeEqual(verified.payload.nonce, nonce) ||
      (Array.isArray(verified.payload.aud) &&
        verified.payload.aud.length > 1 &&
        verified.payload.azp !== config.clientId)
    ) {
      throw new AuthenticationError('The ID token is missing required claims.');
    }
    return {
      issuer: config.issuer,
      audience: config.audience,
      subject: verified.payload.sub,
    };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    throw new AuthenticationError('The ID token could not be verified.');
  }
}

export function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export async function createBrowserSession(
  identity: BrowserSessionIdentity,
  request: Request,
) {
  const sessionToken = randomSecret();
  const csrfToken = randomSecret();
  const result = await getAppPool().query<{
    session_id: string;
    actor_id: string;
    workspace_id: string;
  }>(
    `SELECT session_id, actor_id, workspace_id
     FROM create_browser_session($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      identity.issuer,
      identity.subject,
      identity.audience,
      sha256(sessionToken),
      sha256(csrfToken),
      userAgentHash(request),
      new Date(Date.now() + IDLE_SECONDS * 1000),
      new Date(Date.now() + SESSION_SECONDS * 1000),
    ],
  );
  const session = result.rows[0];
  if (!session) {
    throw new AuthenticationError(
      'This identity is not linked to an active workspace member.',
      403,
    );
  }
  return { sessionToken, csrfToken, ...session, maxAge: SESSION_SECONDS };
}

export async function revokeBrowserSession(sessionToken: string) {
  await getAppPool().query(`SELECT revoke_browser_session($1, $2)`, [
    sha256(sessionToken),
    'user_logout',
  ]);
}

export const browserSessionIdleSeconds = IDLE_SECONDS;
