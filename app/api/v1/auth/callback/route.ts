import { NextResponse } from 'next/server';
import {
  consumeLoginAttempt,
  cookieNames,
  cookieValue,
  createBrowserSession,
  exchangeAuthorizationCode,
  readBrowserOidcConfig,
  verifyOidcIdToken,
} from '@/src/modules/identity/browser-session';
import { AuthenticationError } from '@/src/modules/identity/errors';
import { recordSecurityAudit } from '@/src/modules/identity/mutation-authorization';

export const runtime = 'nodejs';

function secured(response: NextResponse) {
  response.headers.set('cache-control', 'no-store');
  response.headers.set('referrer-policy', 'no-referrer');
  response.headers.set('x-content-type-options', 'nosniff');
  return response;
}

export async function GET(request: Request) {
  let config: ReturnType<typeof readBrowserOidcConfig> | undefined;
  try {
    config = readBrowserOidcConfig();
    const secure = new URL(config.redirectUri).protocol === 'https:';
    const names = cookieNames(secure);
    const url = new URL(request.url);
    if (url.searchParams.has('error')) {
      throw new AuthenticationError('The identity provider denied sign-in.');
    }
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const browserBinding = cookieValue(request, names.login);
    if (
      !code ||
      code.length > 4096 ||
      !state ||
      state.length > 255 ||
      !browserBinding ||
      browserBinding.length > 255
    ) {
      throw new AuthenticationError('The sign-in callback is incomplete.');
    }

    const attempt = await consumeLoginAttempt(state, browserBinding);
    if (attempt.redirectUri !== config.redirectUri) {
      throw new AuthenticationError(
        'The sign-in callback does not match its request.',
      );
    }
    const idToken = await exchangeAuthorizationCode(code, attempt, config);
    const identity = await verifyOidcIdToken(idToken, attempt.nonce, config);
    const session = await createBrowserSession(identity, request);

    await recordSecurityAudit({
      actor: {
        id: session.actor_id,
        workspaceId: session.workspace_id,
        session: { id: session.session_id, csrfTokenHash: '' },
      },
      eventType: 'authentication.login',
      outcome: 'success',
      request,
      metadata: { mode: 'authorization_code_pkce' },
    });

    const destination = new URL(
      attempt.returnTo,
      new URL(config.redirectUri).origin,
    );
    const response = secured(NextResponse.redirect(destination, 303));
    response.cookies.set(names.session, session.sessionToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: session.maxAge,
      priority: 'high',
    });
    response.cookies.set(names.csrf, session.csrfToken, {
      httpOnly: false,
      secure,
      sameSite: 'strict',
      path: '/',
      maxAge: session.maxAge,
      priority: 'high',
    });
    response.cookies.delete(names.login);
    return response;
  } catch (error) {
    await recordSecurityAudit({
      eventType: 'authentication.login',
      outcome: 'failure',
      request,
    }).catch(() => undefined);
    console.error('OIDC callback failed', error);
    const status = error instanceof AuthenticationError ? error.status : 500;
    return secured(
      NextResponse.json(
        {
          type: 'login-callback-failed',
          title:
            status === 403
              ? 'Your identity is not linked to this workspace.'
              : 'Sign-in could not be completed. Start a new sign-in attempt.',
        },
        { status },
      ),
    );
  }
}
