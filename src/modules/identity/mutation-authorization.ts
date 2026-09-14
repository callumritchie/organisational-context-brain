import { randomUUID } from 'node:crypto';
import { getAppPool } from '@/src/db/pool';
import { actorHasCapability, type ActorCapability } from './authorization';
import { AuthenticationError } from './errors';
import type { RequestActor } from './request-actor';
import { constantTimeEqual, sha256 } from './browser-session';

export class RequestAuthorizationError extends AuthenticationError {}

const actionCapabilities: Partial<Record<string, ActorCapability>> = {
  'discovery.review': 'hypothesis.review',
  'hypothesis.review': 'hypothesis.review',
  'discovery.operate': 'monitor.operate',
  'monitor.operate': 'monitor.operate',
  'ontology.review': 'ontology.review',
};

export async function recordSecurityAudit(input: {
  actor?: Pick<RequestActor, 'id' | 'workspaceId' | 'session'>;
  eventType: string;
  outcome: 'success' | 'denied' | 'failure';
  request?: Request;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  await getAppPool().query(
    `SELECT record_security_audit_event($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.actor?.workspaceId ?? null,
      input.actor?.id ?? null,
      input.eventType,
      input.outcome,
      input.request?.headers.get('x-request-id') ?? randomUUID(),
      input.actor?.session?.id ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

function expectedOrigin(request: Request) {
  const configured = process.env.AUTH_PUBLIC_ORIGIN?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      throw new RequestAuthorizationError(
        'AUTH_PUBLIC_ORIGIN is invalid.',
        503,
      );
    }
  }
  if (process.env.NODE_ENV === 'production') {
    throw new RequestAuthorizationError(
      'AUTH_PUBLIC_ORIGIN is not configured.',
      503,
    );
  }
  return new URL(request.url).origin;
}

export async function authorizeMutationRequest(
  request: Request,
  actor: RequestActor,
  action: string,
) {
  if (actor.authenticationMode === 'demo') return;
  try {
    if (actor.authenticationMode === 'session') {
      if (!actor.session) {
        throw new RequestAuthorizationError(
          'The browser session context is incomplete.',
          401,
        );
      }
      const origin = request.headers.get('origin');
      if (!origin || origin !== expectedOrigin(request)) {
        throw new RequestAuthorizationError(
          'The request origin could not be verified.',
          403,
        );
      }
      const token = request.headers.get('x-csrf-token');
      if (
        !token ||
        token.length > 255 ||
        !constantTimeEqual(sha256(token), actor.session.csrfTokenHash)
      ) {
        throw new RequestAuthorizationError(
          'The CSRF token is missing or invalid.',
          403,
        );
      }
    }
    const requiredCapability = actionCapabilities[action];
    if (requiredCapability && !actorHasCapability(actor, requiredCapability)) {
      throw new RequestAuthorizationError(
        `The ${requiredCapability} capability is required.`,
        403,
      );
    }
    await recordSecurityAudit({
      actor,
      eventType: `mutation.authorized.${action}`,
      outcome: 'success',
      request,
    });
  } catch (error) {
    await recordSecurityAudit({
      actor,
      eventType: `mutation.denied.${action}`,
      outcome: 'denied',
      request,
    }).catch(() => undefined);
    throw error;
  }
}
