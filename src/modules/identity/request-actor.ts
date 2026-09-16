import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { getAppPool } from '@/src/db/pool';
import { IDS } from '@/src/modules/canonical/ids';
import type { ActorCapability } from './authorization';
import {
  browserSessionIdleSeconds,
  sessionCookieValue,
  sha256,
  userAgentHash,
} from './browser-session';
import { resolveDemoActor } from './demo-actor';
import { AuthenticationError } from './errors';

export { AuthenticationError } from './errors';

export interface RequestActor {
  id: string;
  workspaceId: string;
  name: string;
  role: string;
  initials?: string;
  authenticationMode: 'demo' | 'oidc' | 'session';
  capabilities: ActorCapability[];
  session?: {
    id: string;
    csrfTokenHash: string;
  };
}

export interface OidcAuthConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
}

const remoteKeySets = new Map<string, JWTVerifyGetKey>();

export function readOidcAuthConfig(
  environment: Record<string, string | undefined> = process.env,
): OidcAuthConfig {
  const issuer = environment.AUTH_OIDC_ISSUER?.trim();
  const audience = environment.AUTH_OIDC_AUDIENCE?.trim();
  const jwksUrl = environment.AUTH_OIDC_JWKS_URL?.trim();
  if (!issuer || !audience || !jwksUrl) {
    throw new AuthenticationError(
      'Production authentication is not configured.',
      503,
    );
  }
  let parsedIssuer: URL;
  let parsedJwksUrl: URL;
  try {
    parsedIssuer = new URL(issuer);
    parsedJwksUrl = new URL(jwksUrl);
  } catch {
    throw new AuthenticationError('The configured OIDC URLs are invalid.', 503);
  }
  if (
    parsedIssuer.protocol !== 'https:' ||
    parsedJwksUrl.protocol !== 'https:'
  ) {
    throw new AuthenticationError(
      'The OIDC issuer and JWKS URL must use HTTPS.',
      503,
    );
  }
  return { issuer, audience, jwksUrl: parsedJwksUrl.toString() };
}

function bearerToken(headerValue: string | null) {
  if (!headerValue)
    throw new AuthenticationError('A bearer token is required.');
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(headerValue);
  if (!match)
    throw new AuthenticationError('The authorization header is invalid.');
  return match[1];
}

export async function verifyOidcAccessToken(
  authorizationHeader: string | null,
  config: OidcAuthConfig,
  keyResolver?: JWTVerifyGetKey,
) {
  const token = bearerToken(authorizationHeader);
  const resolver =
    keyResolver ??
    remoteKeySets.get(config.jwksUrl) ??
    createRemoteJWKSet(new URL(config.jwksUrl));
  if (!keyResolver) remoteKeySets.set(config.jwksUrl, resolver);
  try {
    const verified = await jwtVerify(token, resolver, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['RS256', 'ES256'],
      clockTolerance: 5,
    });
    if (
      typeof verified.payload.sub !== 'string' ||
      !verified.payload.sub.trim() ||
      verified.payload.sub.length > 255 ||
      typeof verified.payload.exp !== 'number'
    ) {
      throw new AuthenticationError(
        'The verified token is missing a subject or expiry.',
      );
    }
    return {
      issuer: config.issuer,
      audience: config.audience,
      subject: verified.payload.sub,
    };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    throw new AuthenticationError('The bearer token could not be verified.');
  }
}

async function resolveMappedActor(identity: {
  issuer: string;
  audience: string;
  subject: string;
}): Promise<RequestActor> {
  const result = await getAppPool().query<{
    actor_id: string;
    workspace_id: string;
    actor_name: string;
    role_label: string;
    capabilities: ActorCapability[];
  }>(
    `SELECT actor_id, workspace_id, actor_name, role_label, capabilities
     FROM resolve_external_identity($1, $2, $3)`,
    [identity.issuer, identity.subject, identity.audience],
  );
  const actor = result.rows[0];
  if (!actor) {
    throw new AuthenticationError(
      'This identity is not linked to an active workspace member.',
      403,
    );
  }
  return {
    id: actor.actor_id,
    workspaceId: actor.workspace_id,
    name: actor.actor_name,
    role: actor.role_label,
    authenticationMode: 'oidc',
    capabilities: actor.capabilities,
  };
}

async function resolveSessionActor(
  request: Request,
  sessionToken: string,
): Promise<RequestActor> {
  if (sessionToken.length < 32 || sessionToken.length > 255) {
    throw new AuthenticationError('The browser session is invalid.');
  }
  const result = await getAppPool().query<{
    session_id: string;
    actor_id: string;
    workspace_id: string;
    actor_name: string;
    role_label: string;
    capabilities: ActorCapability[];
    csrf_token_hash: string;
  }>(
    `SELECT session_id, actor_id, workspace_id, actor_name, role_label,
       capabilities, csrf_token_hash
     FROM resolve_browser_session($1, $2, $3::interval)`,
    [
      sha256(sessionToken),
      userAgentHash(request),
      `${browserSessionIdleSeconds} seconds`,
    ],
  );
  const actor = result.rows[0];
  if (!actor) {
    throw new AuthenticationError(
      'The browser session has expired or was revoked.',
    );
  }
  return {
    id: actor.actor_id,
    workspaceId: actor.workspace_id,
    name: actor.actor_name,
    role: actor.role_label,
    authenticationMode: 'session',
    capabilities: actor.capabilities,
    session: {
      id: actor.session_id,
      csrfTokenHash: actor.csrf_token_hash,
    },
  };
}

async function enforceRateLimit(
  actor: RequestActor,
  operationClass: 'read' | 'mutation',
) {
  if (process.env.NODE_ENV !== 'production') return;
  const limit = operationClass === 'mutation' ? 30 : 120;
  const result = await getAppPool().query<{
    allowed: boolean;
    retry_after_seconds: number;
  }>(
    `SELECT allowed, retry_after_seconds
     FROM consume_api_rate_limit($1, $2, $3, $4, interval '1 minute')`,
    [actor.workspaceId, actor.id, operationClass, limit],
  );
  if (!result.rows[0]?.allowed) {
    await getAppPool()
      .query(`SELECT record_security_audit_event($1, $2, $3, $4, $5, $6, $7)`, [
        actor.workspaceId,
        actor.id,
        `rate_limit.${operationClass}`,
        'denied',
        null,
        actor.session?.id ?? null,
        JSON.stringify({
          retryAfterSeconds: result.rows[0]?.retry_after_seconds ?? 60,
        }),
      ])
      .catch(() => undefined);
    throw new AuthenticationError('The API rate limit has been exceeded.', 429);
  }
}

export async function resolveRequestActor(
  request: Request,
  options: { operationClass?: 'read' | 'mutation' } = {},
): Promise<RequestActor> {
  const authorization = request.headers.get('authorization');
  let actor: RequestActor;
  if (authorization) {
    const identity = await verifyOidcAccessToken(
      authorization,
      readOidcAuthConfig(),
    );
    actor = await resolveMappedActor(identity);
  } else {
    const sessionToken = sessionCookieValue(request);
    if (sessionToken) {
      actor = await resolveSessionActor(request, sessionToken);
    } else if (process.env.NODE_ENV !== 'production') {
      let demoActor: ReturnType<typeof resolveDemoActor>;
      try {
        demoActor = resolveDemoActor(request.headers.get('x-demo-actor'));
      } catch {
        throw new AuthenticationError('Unknown demo persona.');
      }
      actor = {
        ...demoActor,
        authenticationMode: 'demo',
        capabilities:
          demoActor.id === IDS.users.alex
            ? [
                'hypothesis.review',
                'monitor.operate',
                'ontology.review',
                'memory.capture',
                'memory.review',
                'kickoff.generate',
              ]
            : demoActor.id === IDS.users.jamie
              ? ['memory.capture', 'kickoff.generate']
              : demoActor.id === IDS.users.morgan
                ? ['kickoff.generate']
                : [],
      };
    } else {
      throw new AuthenticationError(
        'A browser session or bearer token is required.',
      );
    }
  }
  await enforceRateLimit(
    actor,
    options.operationClass ?? (request.method === 'GET' ? 'read' : 'mutation'),
  );
  return actor;
}
