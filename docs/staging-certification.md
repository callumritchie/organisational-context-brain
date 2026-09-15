# Staging deployment and certification

Milestone 16 defines evidence for a safe staging deployment. It does not create a cloud account, buy a domain or claim that an environment exists. Those actions require the operator to choose providers, accept their terms and control their billing and credentials.

## What must be selected

Record these choices before provisioning anything:

| Boundary          | Required capability                                                                                          | Decision evidence                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Application host  | Separate web, worker, scheduler and one-shot release processes; immutable images; private service networking | Region, scaling model, deployment identity and rollback mechanism                  |
| PostgreSQL        | PostgreSQL 18, pgvector, TLS, private access, automated backups and point-in-time recovery                   | Retention, recovery-point objective, recovery-time objective and restore procedure |
| Identity provider | OIDC authorization code, S256 PKCE, stable subject, fixed issuer/audience/JWKS and test identity             | Exact URLs, client type, MFA policy and joiner/mover/leaver owner                  |
| Ingress           | Managed TLS, body limits, login throttling, request IDs and access logs                                      | Domain, certificate owner, rate limits and denial monitoring                       |
| Secrets           | Workload-scoped injection and rotation without image or repository storage                                   | Secret owners and rotation schedule                                                |
| Observability     | Restricted log/audit destination, alerts and retention                                                       | On-call owner, redaction review and alert destinations                             |

The initial staging environment must contain synthetic data only. Do not connect real organisational systems while deployment controls remain under evaluation.

## Deployment sequence

1. Create the private PostgreSQL instance, backups and PITR policy. Generate independent owner, app and ingestion credentials.
2. Configure the OIDC client with one exact callback: `https://<staging-origin>/api/v1/auth/callback`. Create a dedicated staging test subject and link it with `auth:link-identity`.
3. Put credentials and OIDC client material in the platform secret manager. The owner URL is available only to the release job.
4. Build web and operations images from the same commit. Record both image digests and the full commit SHA.
5. Run the release target once. The runner serialises migrations, records their SHA-256 checksums and applies the supplied runtime-role password rotation; an edited or unexpected applied migration fails the release.
6. Start one scheduler, one worker and the web service. Expose only the web service through managed HTTPS. Keep PostgreSQL private.
7. Confirm readiness, then run the GitHub **Staging certification** workflow against the exact deployed commit.
8. Complete the manual browser and recovery checks below. Only then invite product reviewers.

## Automated certification

Create a protected GitHub Environment named `staging` and add `STAGING_TEST_BEARER_TOKEN` as an environment secret. The short-lived token must belong to the dedicated synthetic test subject; never use a human administrator token. Run **Actions → Staging certification → Run workflow** and provide:

- the bare staging HTTPS origin;
- the bare identity-provider HTTPS origin;
- the deployed 40-character commit SHA; and
- a readiness probe count from 1 to 500.

The workflow proves:

- liveness and readiness report the expected immutable release;
- the restricted app database role and session migration boundary are active;
- browser security headers include a per-response script nonce;
- anonymous, forged demo-header and invalid-token requests are denied;
- login starts only at the expected provider using code flow, S256 PKCE, state, nonce and a secure host-only binding cookie; and
- a verified provider subject resolves through the server-owned workspace mapping.

For a public-boundary-only diagnostic, set `STAGING_PUBLIC_ONLY=true` locally. The result is deliberately `incomplete`, not certified, because it skips the mapped identity.

## Controlled load

`npm run staging:load` defaults to 50 readiness requests at concurrency two, allows at most 500 requests and at most ten workers, reports p50/p95/p99 without response content, and fails its latency or success-rate threshold.

Authenticated targets are opt-in because they consume actor rate limits and may invoke a configured embedding provider:

```bash
STAGING_LOAD_TARGET=context \
STAGING_LOAD_CONFIRM=controlled-staging-load \
STAGING_LOAD_REQUESTS=50 \
npm run staging:load
```

This is a bounded deployment check, not a capacity claim. Establish a workload model and cost budget before increasing traffic.

## Restore drill

Restore a recent backup into a new isolated database. Never point the verifier at the source database. Configure owner and `org_brain_app` URLs for the restored target, require TLS, then run:

```bash
NODE_ENV=production \
RECOVERY_DRILL_CONFIRM=isolated-restore-read-only \
DATABASE_URL_RECOVERY_OWNER='postgresql://…?sslmode=verify-full' \
DATABASE_URL_RECOVERY_APP='postgresql://org_brain_app:…?sslmode=verify-full' \
npm run recovery:verify
```

The verifier is read-only. It checks every migration checksum, both non-bypass runtime roles, forced RLS on critical tables, the browser-session boundary and non-sensitive row counts. Record the restore point, elapsed restore time and verifier output, then destroy the isolated copy through the provider console.

## Manual acceptance

- Complete a real browser login and logout; confirm the session cannot be reused after logout.
- Attempt login with an unlinked provider subject; confirm denial without leaking workspace names.
- Confirm login throttling at the ingress and an alert for repeated denials.
- Pause and resume the monitor and discovery schedules; confirm scheduler and worker logs carry the deployed commit.
- Trigger one synthetic evidence change; confirm a hypothesis evaluation, durable delta and notification appear exactly once.
- Export the security audit to its restricted destination and verify content/retention policy.
- Perform the restored-backup drill and record measured RPO/RTO.
- Review the [deployment threat model](./deployment-threat-model.md), then obtain an independent security review before any real data.

## Not established by this milestone

Passing certification does not prove penetration resistance, provider availability, capacity at organisational scale, connector correctness against real systems, identity lifecycle automation or safe processing of real confidential data. It establishes a repeatable staging gate; those broader claims require independent evidence.
