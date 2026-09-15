export type CertificationStatus = 'passed' | 'failed' | 'skipped';

export interface CertificationCheck {
  id: string;
  status: CertificationStatus;
  durationMs: number;
  detail: string;
}

export interface StagingCertificationOptions {
  baseUrl: string;
  expectedCommit: string;
  expectedIdentityOrigin: string;
  bearerToken?: string;
  allowPublicOnly?: boolean;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
}

export interface StagingCertificationResult {
  outcome: 'passed' | 'incomplete' | 'failed';
  targetOrigin: string;
  expectedCommit: string;
  checks: CertificationCheck[];
}

class CertificationFailure extends Error {}

function requiredHttpsOrigin(value: string, label: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new CertificationFailure(`${label} is not a valid URL.`);
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.origin !== parsed.toString().replace(/\/$/, '')
  ) {
    throw new CertificationFailure(`${label} must be a bare HTTPS origin.`);
  }
  return parsed.origin;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CertificationFailure(message);
}

async function json(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  invariant(contentType.includes('application/json'), 'Response is not JSON.');
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    throw new CertificationFailure('Response contains invalid JSON.');
  }
}

function hasDirective(policy: string, directive: string, token: string) {
  return policy
    .split(';')
    .map((item) => item.trim())
    .some(
      (item) =>
        item.startsWith(`${directive} `) && item.split(/\s+/).includes(token),
    );
}

export function assertSecurityHeaders(headers: Headers) {
  invariant(
    headers.get('x-content-type-options') === 'nosniff',
    'X-Content-Type-Options is not nosniff.',
  );
  invariant(
    headers.get('x-frame-options') === 'DENY',
    'Framing is not denied.',
  );
  invariant(
    headers.get('referrer-policy') === 'strict-origin-when-cross-origin',
    'Referrer-Policy is not the expected restricted policy.',
  );
  invariant(
    headers.get('strict-transport-security')?.includes('max-age=31536000'),
    'HSTS is absent or too short.',
  );
  invariant(
    headers.get('permissions-policy')?.includes('camera=()'),
    'Permissions-Policy is absent or incomplete.',
  );
  const policy = headers.get('content-security-policy') ?? '';
  invariant(
    hasDirective(policy, 'default-src', "'self'"),
    'CSP default-src is missing.',
  );
  invariant(
    hasDirective(policy, 'object-src', "'none'"),
    'CSP object-src is not none.',
  );
  invariant(
    hasDirective(policy, 'frame-ancestors', "'none'"),
    'CSP frame-ancestors is not none.',
  );
  invariant(
    hasDirective(policy, 'base-uri', "'self'"),
    'CSP base-uri is missing.',
  );
  invariant(
    hasDirective(policy, 'form-action', "'self'"),
    'CSP form-action is missing.',
  );
  invariant(
    /script-src [^;]*'nonce-[A-Za-z0-9+/=_-]+'[^;]*'strict-dynamic'/.test(
      policy,
    ),
    'CSP does not contain a nonce-protected strict script policy.',
  );
  invariant(
    !/script-src [^;]*'unsafe-inline'/.test(policy),
    'CSP permits unsafe inline scripts.',
  );
}

async function timedCheck(
  id: string,
  operation: () => Promise<string> | string,
): Promise<CertificationCheck> {
  const started = performance.now();
  try {
    const detail = await operation();
    return {
      id,
      status: 'passed',
      durationMs: Math.round(performance.now() - started),
      detail,
    };
  } catch (error) {
    return {
      id,
      status: 'failed',
      durationMs: Math.round(performance.now() - started),
      detail:
        error instanceof Error
          ? error.message
          : 'Unknown certification failure.',
    };
  }
}

export async function certifyStaging(
  options: StagingCertificationOptions,
): Promise<StagingCertificationResult> {
  const targetOrigin = requiredHttpsOrigin(options.baseUrl, 'STAGING_BASE_URL');
  const identityOrigin = requiredHttpsOrigin(
    options.expectedIdentityOrigin,
    'STAGING_EXPECTED_IDP_ORIGIN',
  );
  invariant(
    /^[a-f0-9]{40}$/i.test(options.expectedCommit),
    'STAGING_EXPECTED_COMMIT must be a full 40-character commit SHA.',
  );
  invariant(
    identityOrigin !== targetOrigin,
    'The identity provider must use a different origin from the application.',
  );

  const request = options.fetchImplementation ?? fetch;
  const timeoutMs = Math.max(
    1_000,
    Math.min(options.timeoutMs ?? 10_000, 30_000),
  );
  const fetchTarget = (path: string, init: RequestInit = {}) =>
    request(new URL(path, `${targetOrigin}/`), {
      ...init,
      redirect: init.redirect ?? 'manual',
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      headers: {
        accept: 'application/json',
        'user-agent': 'org-brain-staging-certifier/1',
        ...init.headers,
      },
    });

  const checks: CertificationCheck[] = [];
  checks.push(
    await timedCheck('live', async () => {
      const response = await fetchTarget('/api/health/live');
      invariant(
        response.status === 200,
        `Liveness returned ${response.status}.`,
      );
      invariant(
        response.headers.get('cache-control') === 'no-store',
        'Liveness is cacheable.',
      );
      const body = await json(response);
      invariant(body.status === 'live', 'Liveness body is invalid.');
      invariant(
        body.commit === options.expectedCommit,
        'Deployed commit does not match the requested commit.',
      );
      return 'Process is live and reports the expected immutable commit.';
    }),
  );
  checks.push(
    await timedCheck('ready', async () => {
      const response = await fetchTarget('/api/health/ready');
      invariant(
        response.status === 200,
        `Readiness returned ${response.status}.`,
      );
      const body = await json(response);
      invariant(
        body.status === 'ready' &&
          body.database === 'available' &&
          body.migrations === 'current',
        'Readiness contract is incomplete.',
      );
      return 'Restricted database role and current migration boundary are ready.';
    }),
  );
  checks.push(
    await timedCheck('browser-security-headers', async () => {
      const response = await fetchTarget('/', {
        headers: { accept: 'text/html' },
      });
      invariant(
        response.status === 200,
        `Application shell returned ${response.status}.`,
      );
      assertSecurityHeaders(response.headers);
      return 'TLS, framing, browser capability and nonce-based CSP headers are enforced.';
    }),
  );
  checks.push(
    await timedCheck('anonymous-boundary', async () => {
      const response = await fetchTarget('/api/v1/session');
      invariant(
        response.status === 401,
        `Anonymous session probe returned ${response.status}.`,
      );
      const body = await json(response);
      invariant(
        body.type === 'authentication-failed',
        'Anonymous denial contract is invalid.',
      );
      return 'Anonymous requests cannot resolve an organisational actor.';
    }),
  );
  checks.push(
    await timedCheck('demo-header-boundary', async () => {
      const response = await fetchTarget('/api/v1/session', {
        headers: { 'x-demo-actor': 'alex-chen' },
      });
      invariant(
        response.status === 401,
        `Forged demo identity returned ${response.status}.`,
      );
      return 'The development persona header is rejected by the deployment.';
    }),
  );
  checks.push(
    await timedCheck('invalid-token-boundary', async () => {
      const response = await fetchTarget('/api/v1/session', {
        headers: {
          authorization: 'Bearer staging-certification.invalid.token',
        },
      });
      invariant(
        response.status === 401,
        `Invalid bearer token returned ${response.status}.`,
      );
      return 'An unverified bearer token cannot cross the identity boundary.';
    }),
  );
  checks.push(
    await timedCheck('oidc-login-start', async () => {
      const response = await fetchTarget('/api/v1/auth/login?returnTo=/%23ask');
      invariant(
        response.status === 303,
        `OIDC login start returned ${response.status}.`,
      );
      const destination = new URL(response.headers.get('location') ?? '');
      invariant(
        destination.origin === identityOrigin,
        'Login redirects to an unexpected identity origin.',
      );
      invariant(
        destination.searchParams.get('response_type') === 'code',
        'OIDC response type is not code.',
      );
      invariant(
        destination.searchParams.get('code_challenge_method') === 'S256',
        'OIDC PKCE method is not S256.',
      );
      invariant(
        (destination.searchParams.get('code_challenge')?.length ?? 0) >= 43,
        'OIDC PKCE challenge is missing.',
      );
      invariant(
        destination.searchParams.get('scope')?.split(/\s+/).includes('openid'),
        'OIDC openid scope is missing.',
      );
      invariant(
        Boolean(destination.searchParams.get('client_id')),
        'OIDC client ID is missing.',
      );
      const redirect = new URL(
        destination.searchParams.get('redirect_uri') ?? '',
      );
      invariant(
        redirect.origin === targetOrigin &&
          redirect.pathname === '/api/v1/auth/callback',
        'OIDC callback does not return to the exact staging boundary.',
      );
      invariant(
        (destination.searchParams.get('state')?.length ?? 0) >= 32,
        'OIDC state is missing.',
      );
      invariant(
        (destination.searchParams.get('nonce')?.length ?? 0) >= 32,
        'OIDC nonce is missing.',
      );
      const cookie = response.headers.get('set-cookie') ?? '';
      invariant(
        cookie.includes('__Host-org_brain_login='),
        'Host-only login binding cookie is missing.',
      );
      invariant(
        cookie.includes('HttpOnly') && cookie.includes('Secure'),
        'Login binding cookie is not secure.',
      );
      invariant(
        cookie.includes('Path=/') && cookie.includes('SameSite=Lax'),
        'Login binding cookie scope is invalid.',
      );
      invariant(
        !cookie.includes('Domain='),
        'Login binding cookie sets a domain.',
      );
      return 'OIDC code flow starts with S256 PKCE, state, nonce and a secure browser binding.';
    }),
  );

  if (options.bearerToken) {
    checks.push(
      await timedCheck('mapped-identity', async () => {
        const response = await fetchTarget('/api/v1/session', {
          headers: { authorization: `Bearer ${options.bearerToken}` },
        });
        invariant(
          response.status === 200,
          `Mapped identity probe returned ${response.status}.`,
        );
        const body = await json(response);
        const actor = body.actor as Record<string, unknown> | undefined;
        invariant(
          actor?.authenticationMode === 'oidc',
          'The test identity did not resolve through OIDC.',
        );
        invariant(
          typeof actor?.workspaceId === 'string',
          'The test identity has no server-owned workspace mapping.',
        );
        return 'A verified provider subject resolves to a server-owned workspace identity.';
      }),
    );
  } else {
    checks.push({
      id: 'mapped-identity',
      status: options.allowPublicOnly ? 'skipped' : 'failed',
      durationMs: 0,
      detail: options.allowPublicOnly
        ? 'Public-only mode cannot certify a real provider subject mapping.'
        : 'STAGING_TEST_BEARER_TOKEN is required for full certification.',
    });
  }

  const outcome = checks.some((check) => check.status === 'failed')
    ? 'failed'
    : checks.some((check) => check.status === 'skipped')
      ? 'incomplete'
      : 'passed';
  return {
    outcome,
    targetOrigin,
    expectedCommit: options.expectedCommit,
    checks,
  };
}
