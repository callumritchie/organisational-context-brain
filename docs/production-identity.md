# Production API identity boundary

Milestone 13 replaces direct trust in `x-demo-actor` for production API reads. It does not add a browser login screen or make the application ready for internet deployment.

## Trust chain

1. The API requires an `Authorization: Bearer …` token in production.
2. `jose` verifies its signature using one explicitly configured HTTPS JWKS endpoint. Verification also requires the exact issuer, audience, an allowed RS256/ES256 algorithm, a non-empty subject and an expiry.
3. Only the verified issuer, subject and configured audience enter the identity resolver.
4. A narrow `SECURITY DEFINER` database function maps that tuple to an active local user and workspace.
5. Role and action capabilities come from local administrative records. JWT role, group, workspace and capability claims are ignored.
6. The resolved local actor then opens the same transaction-local PostgreSQL RLS boundary used throughout the application.

This follows the standard requirement to validate token issuer and audience as well as the signature. The implementation uses the maintained [`jose` JWT verification API](https://github.com/panva/jose/blob/main/src/jwt/verify.ts) and its [remote JWKS resolver](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md). The broader browser login flow must follow [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0-18.html), including state/nonce and authorization-code handling; that flow is not implemented here.

## Configuration

Set these deployment secrets/configuration values without committing them:

```text
AUTH_OIDC_ISSUER=https://issuer.example/
AUTH_OIDC_AUDIENCE=organisational-context-brain-api
AUTH_OIDC_JWKS_URL=https://issuer.example/.well-known/jwks.json
```

The issuer and JWKS URL must use HTTPS. Configuration is fixed by the operator rather than discovered from an untrusted request.

To link an already-created workspace user, set the one-time administrative values below and run the explicit-confirmation command from a trusted environment with the owner database credential:

```text
AUTH_LINK_SUBJECT=<stable IdP subject>
AUTH_LINK_USER_ID=<local user UUID>
AUTH_LINK_WORKSPACE_ID=<local workspace UUID>
AUTH_LINK_CAPABILITIES=ontology.review,hypothesis.review,monitor.operate
```

```bash
npm run auth:link-identity -- --confirm
```

Capabilities are optional and explicit. A role label alone grants no production action capability. The normal app and ingestion roles cannot select from identity-provider, external-identity or capability tables; the app may execute only the narrow post-verification resolver.

## Fail-closed behaviour

- Production rejects a demo header without a bearer token.
- Missing or non-HTTPS OIDC configuration prevents authenticated resolution.
- Invalid signature, issuer, audience, algorithm, subject or expiry returns an authentication failure.
- A valid token with no active server-side link returns forbidden.
- Disabling either the provider or identity link prevents resolution.
- Existing production mutation locks remain in place.

## Still required before deployment

- authorization-code with PKCE browser sign-in and logout;
- secure session rotation and cookie controls if the UI uses cookies;
- CSRF protection for cookie-authenticated mutations;
- automated identity provisioning and deprovisioning;
- managed secrets, TLS termination, database network isolation and credential rotation;
- rate limiting, security audit export, backups and recovery tests; and
- a deployment-specific threat model and penetration test.
