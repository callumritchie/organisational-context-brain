import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  beginLoginAttempt,
  cookieNames,
  randomSecret,
  readBrowserOidcConfig,
  safeReturnTo,
} from '@/src/modules/identity/browser-session';
import { AuthenticationError } from '@/src/modules/identity/errors';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const config = readBrowserOidcConfig();
    const state = randomSecret();
    const browserBinding = randomSecret();
    const codeVerifier = randomSecret();
    const nonce = randomSecret();
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const returnTo = safeReturnTo(
      new URL(request.url).searchParams.get('returnTo'),
    );

    await beginLoginAttempt({
      state,
      browserBinding,
      codeVerifier,
      nonce,
      redirectUri: config.redirectUri,
      returnTo,
    });

    const authorizationUrl = new URL(config.authorizationUrl);
    authorizationUrl.searchParams.set('client_id', config.clientId);
    authorizationUrl.searchParams.set('redirect_uri', config.redirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid profile');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('nonce', nonce);
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');

    const secure = new URL(config.redirectUri).protocol === 'https:';
    const names = cookieNames(secure);
    const response = NextResponse.redirect(authorizationUrl, 303);
    response.cookies.set(names.login, browserBinding, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 5 * 60,
      priority: 'high',
    });
    response.headers.set('cache-control', 'no-store');
    response.headers.set('referrer-policy', 'no-referrer');
    return response;
  } catch (error) {
    const status = error instanceof AuthenticationError ? error.status : 500;
    console.error('OIDC login could not start', error);
    return NextResponse.json(
      {
        type: 'login-start-failed',
        title:
          status === 503
            ? 'Interactive sign-in is not configured.'
            : 'Sign-in could not be started.',
      },
      { status, headers: { 'cache-control': 'no-store' } },
    );
  }
}
