# Security policy

## Supported versions

This project is an early public prototype. Security fixes are applied to the latest revision on `main`.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository rather than opening a public issue. Include the affected component, reproduction steps, and likely impact. Do not include real organisational data or credentials.

## Deployment warning

The included personas, data, database names, and local/CI passwords are synthetic development fixtures. The `x-demo-actor` header remains a local UI demonstration mechanism and is ignored as identity in production. Production API reads now require a signed OIDC bearer token with configured issuer, audience and HTTPS JWKS verification. The verified subject is mapped to workspace, user, role and capabilities by server-owned database records; those values are never accepted from token claims.

The prepared research-learning mutation, ontology review, memory-candidate review and monitor/discovery operations remain disabled when `NODE_ENV=production` as an additional fail-safe. Authentication is not treated as blanket authorisation: review and operation services require explicit server-owned capabilities. The Hypothesis Monitor uses a dedicated service identity without internal or user-private grants. Events route only between exactly matching access scopes, and lifecycle, job, schedule, routing, usage, semantic-governance and notification tables use forced row-level security under non-owning roles. Do not expose this application or its PostgreSQL service to the public internet without:

- completing an authorisation-code/PKCE browser login and secure session design;
- provisioning, deprovisioning and periodically reviewing server-side identity links and capabilities;
- adding CSRF protection to cookie-authenticated mutations;
- rotating every database credential and placing them in a managed secret store;
- restricting database network access; and
- completing a deployment-specific security review, logging, rate limiting, backups, and recovery testing.

A public GitHub repository exposes source code, not the running application or local `.env.local`. The ignored `.env.local` file must never be committed.

## Optional AI provider

AI synthesis is off by default. When deliberately enabled, selected actor-authorised evidence excerpts and the user's question are sent to the configured provider. The provider is given no retrieval tools, calls request non-persistence, and generated claims are accepted only when they cite evidence UUIDs from that same authorised packet. This application-level `store: false` setting does not replace reviewing the provider account's data controls, retention policy, regional processing, contractual terms, and model availability before using non-synthetic organisational data.

Background model routing is separately controlled from answer synthesis. Its default policy is `deterministic-only`, with no approved providers and zero token/cost budgets. Economy or high-assurance execution requires an explicit provider allow-list, positive budgets and a registered gateway. Every skip, route and budget block is recorded. The implementation deliberately has no cross-actor or cross-scope model-output cache.
