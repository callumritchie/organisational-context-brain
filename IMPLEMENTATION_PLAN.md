# Corrected implementation plan

This plan supersedes the original horizontal roadmap. Work proceeds as sequential, demonstrable vertical slices.

## Architectural invariants

1. Canonical `Resource` is the identity used by graph edges, citations, retrieval and resource security.
2. `Entity` and `ContentObject` are exclusive Resource subtypes; a document is never duplicated as an entity.
3. Assertions retain independent provenance, confidence, validity and access scope.
4. Relationships connect Resources and are visible only through at least one actor-visible assertion.
5. All permission-sensitive repositories execute inside `withActorTransaction` using real transaction-local PostgreSQL state.
6. RLS fails closed. The normal app role neither owns protected tables nor has `BYPASSRLS`.
7. Inaccessible candidates never enter application retrieval or normal traces.
8. Offline means lexical, structured and graph retrieval—not pretend semantic embeddings.
9. Demo mutations must enter through a source connector and normal sync lifecycle.
10. Ranking models are transparent and illustrative, with evaluation-based ordering checks; `demo-ranking-v3` adds reciprocal-rank fusion to first-class signals and actor-visible graph connectivity.
11. A machine-formed learning is a provenance-linked `memory_candidate`, not trusted organisational memory; review is required before promotion to a canonical Resource.
12. Background evaluation reuses the same actor-scoped Context Service and may not broaden the monitor service identity beyond its declared access scope.
13. An open-ended discovery is an untrusted candidate until review; it must retain its exact evidence Resources, model route, prediction and falsification condition.
14. A discovered concept may propose semantic vocabulary, but only an impact-checked steward decision may publish a new immutable ontology version; hypotheses and ontology proposals are separate records.
15. Production actor identity requires a verified issuer, audience, signature, algorithm, subject and expiry; workspace, role and action capabilities are resolved from server-owned mappings, never token claims.
16. Browser authentication uses authorization code with S256 PKCE, one-time browser-bound state and nonce, hashed revocable sessions, exact-origin CSRF checks and server-owned capabilities; application sessions are never identity-provider tokens.

## Milestone 0 — Repository foundation

Status: implemented.

- Git and Next.js/TypeScript strict project.
- Tailwind and accessible component primitives.
- PostgreSQL 18, pgvector, Drizzle schema and SQL migration.
- Real `pg` interactive actor transactions.
- Vitest, Playwright and ESLint module rules.
- Docker Compose, environment template, CI and initial documentation.

## Milestone 1 — First end-to-end brain slice

Status: implemented and validated.

- Northstar Labs, Atlas Bank and Atlas Onboarding.
- Three personas, one hypothesis, three evidence resources, four research notes and one restricted note.
- Real research fixture connector and cursor-based sync run.
- Source objects/versions, canonical resources, relationships, assertions, ACL scopes and provenance.
- Permission-constrained PostgreSQL lexical retrieval.
- `POST /api/v1/context` and deterministic evidence-first synthesis.
- Ask surface, citations, entity context, scoring contributions and safe Brain Inspector.
- Security and end-to-end tests.

Stop and reassess here before expansion.

## Milestone 2 — Semantic context layer

Status: implemented and validated.

- Implemented: explicit Atlas aliases (`Atlas Bank`, `Atlas`, `atlas-bank`) with observable resolution to one Resource.
- Implemented: Meetings as the second cursor-based connector, including source versions, assertions and provenance.
- Implemented: CRM account 381 and `atlas-bank` source keys resolve to the existing Atlas Bank Resource through the normal connector lifecycle.
- Implemented: Documents as a cursor-based connector; Atlas folder ID/path keys and `Atlas client folder` resolve to the existing Atlas Bank Resource while the document remains a content Resource.
- Implemented: Messages as a cursor-based connector; channel keys resolve to Atlas Onboarding while the thread retains its own `MessageThread` content identity.
- Implemented: checksummed ontology persistence and a versioned read-only ontology view.
- Implemented: Project Lead relationship-rule editing with endpoint validation, immutable checksummed snapshots, publisher attribution and production mutation lockout.
- Implemented early from Milestone 3: a focused, permission-filtered Resource graph and graph-connected meeting-evidence eval.
- Milestone complete.

## Milestone 3 — Graph, signals and hybrid retrieval

Status: graph/signals and hybrid-retrieval foundations implemented.

- Implemented: bounded graph expansion and focused `@xyflow/react` UI.
- Implemented: RLS-protected signal observations/snapshots for authority, freshness, engagement, affinity and epistemic confidence.
- Implemented: optional genuine OpenAI provider embeddings with model/content-hash provenance and explicit indexing; offline mode creates no placeholder vectors.
- Implemented: permission-filtered exact pgvector retrieval with safe lexical fallback.
- Implemented: reciprocal-rank fusion and graph contribution explanations in `demo-ranking-v3`.
- Remaining: broader signal producers and evaluation before considering approximate vector indexing.

## Milestone 4 — Full permission demonstration

Status: implemented and validated.

- Materially different project, client and source-object access for Alex, Jamie and Morgan.
- Dedicated non-login Sync Service actor, so ingestion no longer impersonates a human persona.
- Actor-scoped autocomplete endpoint using the same transaction-local PostgreSQL permissions.
- Complete leakage matrix across retrieval, context, deterministic answer, evidence, graph, trace, autocomplete and API.
- No privileged diagnostic path was needed; normal traces remain actor-filtered.

## Milestone 5 — The brain learned something

Status: implemented and validated.

- Project Lead-controlled, local-only research mutation endpoint with strict prepared input and production lockout.
- Research connector advances to a new cursor and observes the eligibility-guidance finding idempotently.
- Normal sync creates its immutable source version, evidence Resource, assertions, provenance, search document and `CONTRADICTS` edge.
- Signal observations and the current signal snapshot are created through the same ingestion transaction.
- Every subsequent ContextResponse explicitly reports supported, contested or insufficient actor-visible evidence.
- Deterministic synthesis changes to a contested assessment when the contradiction is visible.
- End-to-end coverage proves permission denial, mutation idempotency, provenance and the changed downstream response.

## Milestone 6 — AI synthesis

Status: implemented and validated.

- Added a provider-neutral `ChatProvider` boundary and an optional OpenAI Responses API adapter.
- Added `POST /api/v1/ask`, which calls the same context application service as `POST /api/v1/context`.
- The provider receives only the selected, actor-authorised evidence packet; it performs no retrieval and receives no inaccessible candidates.
- Structured provider output requires one or more valid evidence UUIDs for every claim.
- Server validation rejects unknown citations and contested answers that omit all contradicting evidence.
- Provider errors or failed grounding return the deterministic answer without exposing provider details.
- Offline mode remains the default and requires no API key.
- The UI distinguishes grounded provider synthesis from deterministic fallback and exposes the answer stage after the durable context trace.

## Milestone 7 — Scale and messiness validation

Status: in progress.

- Implemented: deterministic, configurable corpus generation with 10,000 logical records by default.
- Implemented: five source-system shapes, canonical clients/projects, source-specific references, immutable versions, stance changes, duplicates, deletions, ambiguous aliases and four permission scopes.
- Implemented: actor-specific evaluation questions with explicit expected and forbidden evidence sets.
- Implemented: isolated PostgreSQL benchmark workspace with batched source histories, canonical entities, assertions, provenance, search documents and successful sync-run records.
- Implemented: ambiguity is preserved as scored resolution candidates; only unambiguous identities are promoted to canonical identity keys.
- Implemented: lexical precision, recall, reciprocal-rank, latency, stale/deleted-record and permission-leakage measurements at 10,000 records.
- Implemented: sentence-aware, overlapping long-document chunks with exact source-text offsets and evidence-level result deduplication.
- Implemented: synchronisation retires every older search chunk for an evidence Resource, while the embedding indexer retires vectors belonging to inactive chunks.
- Implemented: a narrowly scoped permission-aware lexical function preserves fail-closed access checks while allowing PostgreSQL to use the text index. With maintained indexes and fresh planner statistics, the current exact-name 10,000-record p95 is approximately 2.73 ms, with zero observed leakage.
- Implemented: a deterministic 500-record incremental batch mixes 450 revisions with 50 deletions, advances source cursors and content provenance, retires old chunks, updates identity provenance and is safe to replay. The measured local run sustained approximately 802 records/second.
- Implemented: a capped, stratified sample sent 1,975 synthetic chunks and 25 synthetic queries to `text-embedding-3-small`, recording 227,377 input tokens, measured vector storage, indexing time and actor-scoped lexical, semantic and hybrid quality/latency.
- Implemented: resource-level fusion prevents different lexical and semantic chunks from duplicating one evidence Resource; both candidate functions fail closed and enforce document plus parent-Resource scopes.
- Finding: on exact-name benchmark questions, lexical precision@20 was 1.0 while semantic and hybrid precision were approximately 0.865 and 0.87, with no recall gain. Exact-vector p95 was approximately 74 ms over 1,975 vectors. PostgreSQL remains sufficient for this measured slice.
- Implemented: 75 paired vocabulary-mismatch questions expose lexical brittleness without injecting canonical project names into retrieval. In a capped 1,950-vector follow-up, semantic retrieval achieved approximately 0.545 precision@20, 0.385 recall@20 and 0.805 MRR on that cohort, with zero observed leakage.
- Implemented: a blind human-question authoring packet excludes scorer answer sets and canonical project labels; validation requires authorship attestation and fails closed on missing, duplicated or label-leaking questions. The semantic runner accepts a validated packet while preserving its 2,000-input ceiling.
- Remaining: collect genuinely independently authored held-out questions, then benchmark a full vector corpus before deciding whether approximate pgvector or specialist graph/vector infrastructure is warranted.

## Milestone 8 — Continual hypotheses and durable memory

Status: control-plane implementation complete; semantic-quality validation remains.

- Implemented: an explicit monitor policy with hypothesis, owner, restricted service actor, source-change trigger, materiality rule, mandatory review policy and stop conditions.
- Implemented: a separate Hypothesis Monitor identity that can read workspace-wide evidence but has none of the Sync Service’s internal or user-private grants.
- Implemented: all five connectors commit a normalized, permission-scoped event in the same transaction as their source versions; active policies subscribe by source and exact access scope.
- Implemented: PostgreSQL workers lease jobs with `SKIP LOCKED`, expiry, retry limits, dead-letter state and idempotency. Daily schedules and manual runs enqueue the same job contract.
- Implemented: permission-scoped context snapshots and evidence deltas retain the before/change/after explanation for each monitor run.
- Implemented: a deterministic formation rule turns newly supporting or contradicting evidence into an attributable memory candidate; the prepared contradiction forms a counter-hypothesis rather than silently rewriting the original claim.
- Implemented: Project Lead review can dismiss a candidate or promote it to a canonical Hypothesis Resource with a source-version-backed assertion and provenance span. Production review writes remain disabled until genuine authentication exists.
- Implemented: the fixed-viewport prototype exposes the whole loop through progressive disclosure in the existing answer trace rather than adding another page or tab.
- Implemented: the evaluator is policy-driven rather than Atlas-specific; another governed Hypothesis Resource can declare its query, scope, owner, service actor, connector subscriptions and interval.
- Implemented: administrative lifecycle, immutable revisions, predictions, falsification conditions, evaluations, epistemic transitions, staleness scanning, explicit supersession/retirement and monitor shutdown primitives.
- Implemented: permission-scoped notification outbox plus local Project Lead pause, resume, run-now and mark-read operations. Production writes remain disabled until genuine authentication exists.
- Implemented: provider-neutral model routing with deterministic-only, economy, balanced and high-assurance policies; approved-provider and budget checks; durable invocation and token/cost ledgers. Background monitoring defaults to deterministic-only and zero external tokens.
- Implemented: a deterministic 10,000-record hypothesis-monitor contract benchmark covering every source type, 200 projects, versioned stance changes, duplicates, permission leakage and routing spend.
- Remaining: independently authored evaluation for open-ended hypothesis quality, an explicitly approved/configured provider for raw-content hypothesis discovery, external notification delivery, production job supervision and production authentication.

## Milestone 9 — Open-ended hypothesis discovery

Status: first deterministic vertical slice implemented; human-quality validation remains.

- Implemented: a deliberately unfamiliar Verdant supplier-onboarding scenario with five unlabeled records across research, meetings, CRM, documents and messages.
- Implemented: normal Source, SyncRun, immutable SourceObjectVersion, canonical Content Resource, relationship, assertion and provenance records for every discovery input.
- Implemented: governed concept rules and a minimum three-source diversity threshold that form a candidate without prepared hypotheses or stance labels.
- Implemented: durable discovery policies, runs and candidates protected by forced row-level security.
- Implemented: every candidate retains its concepts, exact evidence Resource IDs, source URIs, prediction, falsification condition, confidence, novelty and deterministic model-route record.
- Implemented: a single-view unprompted hypothesis inbox that visually separates raw inputs, system processing, untrusted output, human review and continual monitoring.
- Implemented: Project Lead acceptance creates a canonical Hypothesis Resource and standard continual monitor; dismissal preserves the audit trail. Production writes remain disabled without genuine authentication.
- Implemented: a 50-case generated contract benchmark for candidate formation, primary concept selection, evidence grounding, source diversity, falsifiability and zero external spend, plus an ignored human-scoring packet.
- Remaining: blind independent human scoring, model-assisted concept induction if justified, contradiction-rich held-out inputs and production operations.

## Milestone 10 — Continual discovery runtime

Status: local control-plane implementation complete; production supervision remains.

- Implemented: a project-agnostic policy creation service configures the subject, project, exact permission scope, source subscriptions, governed concept rules, corroboration threshold and schedule without changing the discovery algorithm.
- Implemented: connector change events route to both matching hypothesis monitors and matching discovery policies. A discovery policy is eligible only when the source, project and exact access scope match.
- Implemented: PostgreSQL discovery workers use `SKIP LOCKED` leases, lease expiry, bounded retries, dead-letter state and replay-safe idempotency keys.
- Implemented: six-hour schedules, event triggers and Project Lead “Scan now” operations all enqueue the same job contract. Pause/resume disables scheduling without deleting history.
- Implemented: each job reads the current, non-deleted canonical content for its configured project and sources through the restricted background identity, then records a zero-token routing decision.
- Implemented: repeated observations update an unreviewed candidate instead of duplicating it; immutable per-run observations retain the evidence set, source systems and confidence seen at that time.
- Implemented: a missing candidate is marked superseded only after two consecutive full sweeps. If the pattern later returns, it becomes reviewable again and the reactivation is recorded.
- Implemented: source events are considered processed only after every associated monitor and discovery job settles. Terminal discovery failures create a permission-scoped operational notification.
- Implemented: the existing progressive-disclosure drawer exposes schedule state, manual scanning and pause/resume controls without adding another page.
- Verified: focused database integration covers event routing replay, run replay, evidence re-observation and candidate deduplication.
- Remaining: independent process supervision, external notification delivery, arbitrary connector administration UI, blind quality scoring and production authentication.

## Milestone 11 — Independent intelligence evaluation

Status: pinned at the external-quality gate; evaluation harness implemented, independent authoring and scoring pending.

- Implemented: a 100-case zero-egress baseline split into 60 ordinary positives, 20 contradiction-rich positives and 20 negative controls.
- Implemented: separate confusion-matrix, grounding, expected-concept and contradiction-surfacing measurements so prepared-vocabulary detection cannot masquerade as hypothesis quality.
- Finding: the deterministic discovery rule detects 80/80 expected candidates, rejects 20/20 negative controls and grounds 80/80 outputs, but surfaces the conflicting evidence in 0/20 contradiction-rich cases.
- Implemented: a fail-closed independent authoring packet requiring authorship attestation, all five source shapes, unlabeled natural records and hidden expected behaviour.
- Implemented: a blind review packet that removes expected labels and a reviewer schema for grounding, novelty, usefulness, falsifiability, contradiction handling, actionability, unsupported candidates and missed patterns.
- Implemented: multi-reviewer aggregation, distinct-reviewer enforcement, within-one-point agreement, confidence calibration error and prospectively defined provisional quality thresholds.
- Implemented: candidate-quality fields remain null when no candidate exists; those cases measure missed material patterns instead of soliciting meaningless answer scores.
- Implemented: the entire harness records zero external tokens and cost.
- Remaining: collect at least 20 genuinely independently authored cases, obtain two or more blind reviews, adjudicate disagreements, and run the already planned full-vector benchmark.
- Blocked boundary: the full 10,000-document vector run is not authorised by the earlier 2,000-input synthetic egress approval and remains disabled until separately approved.

## Milestone 12 — Governed semantic evolution

Status: first governed vertical slice implemented and validated locally.

- Implemented: ontology changes and organisational hypotheses have separate durable proposal records, review states and audit trails.
- Implemented: a generic additive change-set engine supports new Resource types, relationship rules and semantic aliases without changing its application code for each domain.
- Implemented: the unfamiliar supplier-onboarding discovery produces an explicitly untrusted semantic proposal grounded in its five exact evidence Resources.
- Implemented: pre-activation impact analysis records affected Resources, hypotheses, assertions, breaking-change count and replay action.
- Implemented: only the Project Lead steward may approve or reject. Direct API publication is retired, production review writes remain locked, and stale-base proposals become superseded rather than rebased silently.
- Implemented: approval atomically publishes a checksummed ontology version, writes version-bound mapping rules, advances discovery policies and preserves prior discovery runs against the ontology version that produced them.
- Implemented: every activation has a replay receipt showing which permission-scoped context was reconsidered and explicitly records that existing canonical Resources were not silently mutated.
- Implemented: the existing Connect meaning drawer visualises observed pattern → untrusted change set → impact check → human gate → version activation, without adding a page or requiring page scrolling.
- Remaining: model-assisted free-form semantic induction, steward assignment beyond the demo Project Lead, arbitrary connector mapping administration, rollback-by-new-version, and quality evaluation of proposed ontologies on independent domains.

## Milestone 13 — Production identity and action authorisation

Status: production API identity boundary implemented; interactive sign-in and deployment hardening remain.

- Implemented: every read and mutation API now resolves its actor through one request-identity boundary rather than reading `x-demo-actor` directly.
- Implemented: production accepts only bearer JWTs verified against an explicitly configured HTTPS JWKS URL, exact issuer and audience, an allow-list of RS256/ES256 algorithms, and required subject and expiry.
- Implemented: token claims do not choose workspace, local user, role or capabilities. A narrow `SECURITY DEFINER` database function maps the verified issuer/subject/audience to an active server-owned identity link.
- Implemented: identity-provider, external-identity and user-capability tables are unavailable to the normal app and ingestion roles; only the narrow resolver is executable by the app role.
- Implemented: hypothesis review, monitor operation and ontology review use explicit server-owned capabilities instead of a hard-coded Alex user ID. The local fixture grants those capabilities to Alex only.
- Implemented: `/api/v1/session` exposes the resolved actor contract to a future authenticated UI, while an explicit-confirmation administrative script links an IdP subject to an existing workspace user and optional capabilities.
- Implemented: development and test retain the synthetic persona header only when no bearer token is supplied. Production rejects it and fails closed when OIDC configuration is absent or invalid.
- Implemented: the prepared research mutation and current review/operation writes remain production-disabled despite the new read identity boundary; authentication alone does not imply deployment readiness.
- Remaining: authorisation-code/PKCE browser sign-in, secure session cookies and CSRF controls if cookie mutations are introduced, identity lifecycle provisioning/deprovisioning, rate limiting, audit export, managed secrets, deployment network controls and a deployment-specific security review.

## Milestone 14 — Interactive identity and deployment control plane

Status: application identity/session vertical slice implemented; infrastructure-specific deployment gate remains.

- Implemented: provider-neutral authorization-code browser sign-in with S256 PKCE, one-time state, nonce, browser binding, fixed endpoints and exact redirect configuration.
- Implemented: ID-token verification against the fixed issuer, client audience, HTTPS JWKS, RS256/ES256 allow-list, expiry, subject and exact transaction nonce before the subject enters the server-owned workspace mapping.
- Implemented: opaque browser sessions whose token and CSRF values are retained only as hashes; eight-hour absolute expiry, 30-minute idle expiry, user-agent binding, revocation and fail-closed provider/identity deactivation.
- Implemented: Secure host-only HTTP-only session cookies, a separate Strict CSRF cookie, exact-origin validation and double-submit proof for cookie-authenticated writes.
- Implemented: capability-authorized production hypothesis/discovery review, monitor/discovery operations and ontology review. Bearer clients remain supported; the prepared synthetic research mutation remains production-disabled.
- Implemented: database-backed per-actor production limits of 120 reads and 30 mutations per minute, plus private append-only authentication, mutation-authorization, identity-lifecycle and rate-limit audit events.
- Implemented: explicit administrative link/re-link, deprovision-and-revoke and JSONL audit-export commands. Re-linking invalidates existing sessions and applies the declared capability set exactly.
- Implemented: the fixed-viewport UI resolves its current session, shows the mapped production identity, supplies CSRF proof automatically and presents a clear sign-in boundary when no session exists.
- Remaining: choose a hosting and identity provider; configure managed secrets, TLS/proxy/WAF, login-endpoint throttling, database network isolation, worker supervision, backups/recovery and central audit shipping; implement provider-specific automatic joiner/mover/leaver events; complete a deployment threat model and independent security review.
