# Security policy

## Supported versions

This project is an early public prototype. Security fixes are applied to the latest revision on `main`.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository rather than opening a public issue. Include the affected component, reproduction steps, and likely impact. Do not include real organisational data or credentials.

## Deployment warning

The included personas, data, database names, and local/CI passwords are synthetic development fixtures. The `x-demo-actor` header remains a local UI demonstration mechanism and is ignored as identity in production. Production API reads now require a signed OIDC bearer token with configured issuer, audience and HTTPS JWKS verification. The verified subject is mapped to workspace, user, role and capabilities by server-owned database records; those values are never accepted from token claims.

Interactive production sign-in uses authorization code with S256 PKCE, browser-bound one-time state, nonce and a verified ID token. The resulting browser session is opaque, revocable and retained only as a hash. Cookie-authenticated writes require an exact production origin and CSRF proof. Authentication is not blanket authorisation: review and operation services require explicit server-owned capabilities. These governed operations may run in production after this boundary succeeds; the prepared synthetic research-learning mutation remains disabled. The Hypothesis Monitor uses a dedicated service identity without internal or user-private grants. Events route only between exactly matching access scopes, and lifecycle, job, schedule, routing, usage, semantic-governance, session, rate-limit, audit and notification tables use forced row-level security under non-owning roles. Do not expose this application or its PostgreSQL service to the public internet without:

- configuring and testing the selected identity provider, exact redirect and joiner/mover/leaver process;
- periodically reviewing server-side identity links, sessions and capabilities;
- rotating every database credential and placing them in a managed secret store;
- restricting database network access; and
- configuring ingress login throttling and central audit export; and
- completing a deployment-specific security review, backups, and recovery testing.

A public GitHub repository exposes source code, not the running application or local `.env.local`. The ignored `.env.local` file must never be committed.

The production container contract enforces a separate release process for the owning database credential. Web, worker and scheduler processes fail startup if that credential is present, if runtime database URLs use a loopback host or disposable password, or if PostgreSQL transport does not require TLS. These checks complement rather than replace a cloud secret manager, private network, ingress policy and deployment review. See the [production operations runbook](./docs/production-operations.md).

Milestone 16 adds a nonce-based script CSP, exact-commit staging certification, checksum-locked serial migrations, bounded load probes and a read-only isolated-restore verifier. A passing automated check is not a substitute for the provider-specific controls, manual abuse cases and independent review in the [deployment threat model](./docs/deployment-threat-model.md).

## Optional AI provider

AI synthesis is off by default. When deliberately enabled, selected actor-authorised evidence excerpts and the user's question are sent to the configured provider. The provider is given no retrieval tools, calls request non-persistence, and generated claims are accepted only when they cite evidence UUIDs from that same authorised packet. This application-level `store: false` setting does not replace reviewing the provider account's data controls, retention policy, regional processing, contractual terms, and model availability before using non-synthetic organisational data.

Background model routing is separately controlled from answer synthesis. Its default policy is `deterministic-only`, with no approved providers and zero token/cost budgets. Economy or high-assurance execution requires an explicit provider allow-list, positive budgets and a registered gateway. Every skip, route and budget block is recorded. The implementation deliberately has no cross-actor or cross-scope model-output cache.
