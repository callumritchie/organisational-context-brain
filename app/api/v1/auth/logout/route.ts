import { NextResponse } from 'next/server';
import {
  cookieNames,
  readBrowserOidcConfig,
  revokeBrowserSession,
  sessionCookieValue,
} from '@/src/modules/identity/browser-session';
import { AuthenticationError } from '@/src/modules/identity/errors';
import {
  authorizeMutationRequest,
  recordSecurityAudit,
} from '@/src/modules/identity/mutation-authorization';
import { resolveRequestActor } from '@/src/modules/identity/request-actor';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request, {
      operationClass: 'mutation',
    });
    await authorizeMutationRequest(request, actor, 'authentication.logout');
    const token = sessionCookieValue(request);
    if (token) await revokeBrowserSession(token);
    await recordSecurityAudit({
      actor,
      eventType: 'authentication.logout',
      outcome: 'success',
      request,
    });

    let secure = process.env.NODE_ENV === 'production';
    try {
      secure =
        new URL(readBrowserOidcConfig().redirectUri).protocol === 'https:';
    } catch {
      // Clear both cookie variants below when configuration is unavailable.
    }
    const response = new NextResponse(null, { status: 204 });
    const configured = cookieNames(secure);
    const fallback = cookieNames(!secure);
    for (const name of new Set([
      configured.session,
      configured.csrf,
      configured.login,
      fallback.session,
      fallback.csrf,
      fallback.login,
    ])) {
      response.cookies.delete(name);
    }
    response.headers.set('cache-control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { type: 'logout-denied', title: error.message },
        { status: error.status, headers: { 'cache-control': 'no-store' } },
      );
    }
    console.error('Logout failed', error);
    return NextResponse.json(
      { type: 'logout-failed', title: 'Sign-out could not be completed.' },
      { status: 500, headers: { 'cache-control': 'no-store' } },
    );
  }
}
