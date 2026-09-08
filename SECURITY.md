# Security policy

## Supported versions

This project is an early public prototype. Security fixes are applied to the latest revision on `main`.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository rather than opening a public issue. Include the affected component, reproduction steps, and likely impact. Do not include real organisational data or credentials.

## Deployment warning

The included personas, data, database names, and local/CI passwords are synthetic development fixtures. The `x-demo-actor` header is a UI demonstration mechanism, not authentication: any caller can send Alex Chen’s allow-listed identifier, and the server has no signed session or identity-provider proof that the caller is Alex. PostgreSQL row-level security correctly enforces the actor it receives, but cannot establish whether that actor claim is genuine.

Ontology mutation and the prepared research-learning mutation are disabled when `NODE_ENV=production` as a fail-safe. The research route accepts only a fixed mutation identifier—not arbitrary source content—and authorises the demo Project Lead before opening its ingestion transaction. Do not expose this application or its PostgreSQL service to the public internet without:

- replacing `x-demo-actor` with server-validated authentication and sessions;
- adding server-side workspace membership and role authorisation;
- adding CSRF protection to cookie-authenticated mutations;
- rotating every database credential and placing them in a managed secret store;
- restricting database network access; and
- completing a deployment-specific security review, logging, rate limiting, backups, and recovery testing.

A public GitHub repository exposes source code, not the running application or local `.env.local`. The ignored `.env.local` file must never be committed.

## Optional AI provider

AI synthesis is off by default. When deliberately enabled, selected actor-authorised evidence excerpts and the user's question are sent to the configured provider. The provider is given no retrieval tools, calls request non-persistence, and generated claims are accepted only when they cite evidence UUIDs from that same authorised packet. This application-level `store: false` setting does not replace reviewing the provider account's data controls, retention policy, regional processing, contractual terms, and model availability before using non-synthetic organisational data.
