import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { getAppPool } from '@/src/db/pool';
import { IDS } from '@/src/modules/canonical/ids';
import type { ActorCapability } from './authorization';
import { resolveDemoActor } from './demo-actor';

export interface RequestActor {
  id: string;
  workspaceId: string;
  name: string;
  role: string;
  initials?: string;
  authenticationMode: 'demo' | 'oidc';
  capabilities: ActorCapability[];
}

export interface OidcAuthConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
}

export class AuthenticationError extends Error {
  constructor(
    message: string,
    readonly status = 401,
  ) {
    super(message);
  }
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

export async function resolveRequestActor(
  request: Request,
): Promise<RequestActor> {
  const authorization = request.headers.get('authorization');
  if (process.env.NODE_ENV !== 'production' && !authorization) {
    let demoActor: ReturnType<typeof resolveDemoActor>;
    try {
      demoActor = resolveDemoActor(request.headers.get('x-demo-actor'));
    } catch {
      throw new AuthenticationError('Unknown demo persona.');
    }
    return {
      ...demoActor,
      authenticationMode: 'demo',
      capabilities:
        demoActor.id === IDS.users.alex
          ? ['hypothesis.review', 'monitor.operate', 'ontology.review']
          : [],
    };
  }
  if (!authorization)
    throw new AuthenticationError('A bearer token is required.');
  const identity = await verifyOidcAccessToken(
    authorization,
    readOidcAuthConfig(),
  );
  return resolveMappedActor(identity);
}
