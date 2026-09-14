# Browser authentication and deployment control plane

Milestone 14 turns the production API identity boundary into an interactive browser trust chain. It remains provider-neutral: the deployment operator supplies one fixed OpenID Connect provider and links its stable subjects to existing workspace members.

## Sign-in flow

1. `GET /api/v1/auth/login` creates one-time state, nonce, PKCE verifier and a separate browser-binding secret.
2. Only hashes and the PKCE material are retained in the private `oidc_login_attempts` table. The browser receives a five-minute, HTTP-only binding cookie.
3. The provider receives an authorization-code request with an S256 PKCE challenge, state and nonce.
4. `GET /api/v1/auth/callback` atomically consumes the browser-bound attempt, exchanges the code at the fixed token endpoint and verifies the returned ID token against the fixed issuer, client audience, HTTPS JWKS, algorithm allow-list, expiry, subject and exact nonce.
5. The verified subject is mapped through the existing server-owned identity link. Provider role, workspace and capability claims remain untrusted.
6. The browser receives an opaque eight-hour session cookie. Only its SHA-256 hash is stored. Sessions expire after 30 minutes of inactivity and are bound to the browser user-agent hash.

This follows current OAuth security guidance: use authorization code with PKCE, S256, transaction-specific state/nonce and exact redirect destinations. See [OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/info/rfc9700/), [PKCE](https://www.rfc-editor.org/info/rfc7636/) and [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html).

## Required configuration

All values are deployment configuration. Do not commit real values.

```text
AUTH_OIDC_ISSUER=https://issuer.example/
AUTH_OIDC_AUDIENCE=organisational-context-brain-api
AUTH_OIDC_JWKS_URL=https://issuer.example/.well-known/jwks.json
AUTH_OIDC_AUTHORIZATION_URL=https://issuer.example/authorize
AUTH_OIDC_TOKEN_URL=https://issuer.example/token
AUTH_OIDC_CLIENT_ID=organisational-context-brain-web
AUTH_OIDC_CLIENT_SECRET=<managed secret, omit for a public-client registration>
AUTH_OIDC_REDIRECT_URI=https://brain.example.com/api/v1/auth/callback
AUTH_PUBLIC_ORIGIN=https://brain.example.com
```

Production requires HTTPS for every identity endpoint, redirect and public origin. The public origin must exactly match the redirect origin. Register the redirect URI exactly with the identity provider.

## Cookie writes and CSRF

The session cookie is HTTP-only, Secure, SameSite=Lax, host-only and high priority. A separate Secure, SameSite=Strict token supports the double-submit CSRF check. Cookie-authenticated mutations must carry that value in `x-csrf-token` and have an `Origin` exactly matching `AUTH_PUBLIC_ORIGIN`.

Bearer API clients do not use browser cookies and therefore do not require the browser CSRF token. They still pass token verification, server-owned capability checks and production rate limiting.

The following governed actions are now available in production to authenticated actors with the required capability:

- hypothesis and discovery review: `hypothesis.review`;
- monitor and discovery operations: `monitor.operate`; and
- semantic proposal review: `ontology.review`.

The prepared synthetic research mutation remains production-disabled.

## Identity lifecycle

Link or replace an identity with an exact capability set:

```bash
npm run auth:link-identity -- --confirm
```

Re-linking revokes existing browser sessions. Disable an identity and immediately revoke all of its sessions:

```bash
npm run auth:disable-identity -- --confirm
```

Set `AUTH_DISABLE_SUBJECT` and `AUTH_DISABLE_WORKSPACE_ID` first. Capabilities are retained for administrative review because they belong to the local user, not to a particular provider link. Automatic SCIM or provider-event provisioning is not included.

## Operations

Production enforces fixed one-minute database-backed limits of 120 read operations and 30 mutations per actor. Login endpoints must additionally be protected by the deployment ingress/WAF because they run before an actor exists.

Authentication, logout, identity lifecycle, mutation authorization denials and rate-limit denials are written to the private `security_audit_events` table. Export workspace events as JSON Lines from a trusted administrative environment:

```bash
npm run auth:export-audit
```

Set `AUTH_AUDIT_WORKSPACE_ID`; optionally set `AUTH_AUDIT_SINCE` to an ISO timestamp. The normal app and ingestion roles cannot read identity, login-attempt, session, rate-limit or audit tables.

## Remaining deployment gate

This code supplies the application identity/session boundary; it cannot configure a hosting provider. Before exposing a deployment, select infrastructure and complete managed secret storage and rotation, TLS/proxy configuration, WAF/login throttling, database network isolation, worker supervision, backups and recovery testing, central audit shipping, a deployment threat model and an independent security review. Automatic joiner/mover/leaver integration also remains to be built for the selected identity provider.
