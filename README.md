# Organisational Context Brain

Most AI agents search organisational data independently.

This project explores a different model: a governed memory extension for an existing internal AI product. It turns project work into evidence-backed, permission-scoped precedent that can improve later work without leaking one client or person's context into another.

```text
Project work → Debrief/observation → Scoped memory → Review/outcomes → Proactive reuse
```

Question answering is one consumer of that memory, not the product boundary. The longer-term payoff is proactive: when a new engagement begins, the system can surface relevant decisions, approaches, risks, adaptations and anti-patterns from permitted precedent, then strengthen, qualify or retire them as outcomes arrive.

The completed Milestones 0–6 are intentionally small but real. Independent research, meeting, CRM, document, and message connectors ingest Northstar Labs knowledge about Atlas Bank, store immutable source versions, resolve aliases and source identity keys to canonical resources, create assertion-level provenance, apply forced PostgreSQL row-level security, retrieve evidence, expand a permission-safe resource graph, and expose the result through `POST /api/v1/context` and an evidence-first interface. The same response includes connector health, a checksummed ontology, first-class signal snapshots, transparent hybrid ranking, and an explicit evidence state.

Milestone 8 adds a continual hypothesis and memory control plane. Every connector emits the same permission-scoped change event, PostgreSQL-backed workers lease replay-safe jobs, scheduled or manual runs reuse the Context Service, and durable hypothesis records distinguish administrative lifecycle from current evidence state. Each run records its model-routing decision and token/cost ledger; the default background policy is deterministic-only and sends nothing to an external provider. Material deltas create reviewable, attributable memory candidates and in-app notifications. Acceptance promotes a provenance-linked canonical Hypothesis Resource rather than changing model weights or silently rewriting organisational truth.

Milestone 9 adds a first open-ended discovery slice. Five unlabeled records from an unfamiliar synthetic supplier-onboarding scenario are ingested through separate research, meeting, CRM, document and message sources. Governed concept rules require cross-source corroboration before proposing a hypothesis, and every proposal includes exact evidence references, a prediction and a falsification condition. The proposal lives in a clearly marked untrusted inbox; accepting it creates a canonical Hypothesis Resource and a continual monitor. This path is deterministic and records zero external tokens by default.

Milestone 10 makes that discovery path continual. Project-scoped policies subscribe to connector changes and schedules; PostgreSQL workers lease replay-safe jobs, retry failures and preserve immutable observations of each candidate. Repeated evidence updates an unreviewed candidate rather than duplicating it, absent patterns become superseded only after repeated sweeps, and returning patterns are explicitly reactivated for review. The local interface exposes schedule state, pause/resume and a manual scan without adding another page.

Milestone 11 adds a deliberately adversarial quality harness. Its 100 zero-egress cases separate ordinary positives, contradiction-rich evidence and negative controls, then produce independent-authoring and blind-review packets. The current deterministic baseline detects and grounds its configured concepts but fails to surface contradictions in 20/20 contested cases. That gap is reported directly rather than averaged into the passing contract checks.

Milestone 11 is now pinned at that external-quality gate. Milestone 12 adds governed semantic evolution: discoveries can propose new types, relationships and aliases, but those proposals remain inactive until a steward reviews their evidence and impact. Approval creates a new immutable ontology version, version-bound mapping rules and a replay receipt; it never edits an existing ontology snapshot or silently reclassifies canonical data.

Milestone 13 replaces the API's production trust boundary. All routes now require verified OIDC bearer identity in production, then resolve workspace membership, role and explicit action capabilities from server-owned database mappings. The synthetic persona header remains available only for local development. This is an API authentication boundary, not yet a finished browser sign-in or a claim that the app is deployment-ready.

Milestones 14–16 add the deployment control plane around that boundary: interactive authorization-code + S256 PKCE sign-in, hashed revocable browser sessions, capability-authorised production operations, separately supervised web/worker/scheduler/release containers, and an exact-commit staging certification gate. Releases are serialised and recorded in a checksum ledger; an isolated restored backup can be verified read-only before traffic moves. This is deployment-ready application machinery, not evidence that a live environment has been provisioned or independently approved.

Milestone 17 grounds the extension in an explicit organisational-memory domain. Person, project, client, domain and organisation scopes are enforceable governance boundaries; initial learning remains in its origin scope. Broader reuse can only create a new reviewed abstraction, never widen the source memory or expose its restricted evidence and lineage. The client-wide layer is intentionally disabled until the host product supplies authoritative client-membership semantics. See the [memory isolation contract](./docs/memory-isolation-contract.md).

No LLM or API key is required. Optional provider synthesis is a disposable consumer of the permissioned context packet, not a second retrieval system.

## Quick start

Requirements: Node.js 22+ and PostgreSQL 18 with pgvector. Docker is optional.

```bash
cp .env.example .env.local
docker compose up -d       # omit when using another PostgreSQL instance
npm install
npm run demo:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The credentials in `.env.example`, Docker Compose, and CI are deliberately disposable local-test values. Replace them with generated secrets for any non-local environment. Publishing this source repository does not deploy the application. The demo persona header is never accepted as production identity. Governed production operations require both verified identity and server-owned capabilities; the prepared synthetic research mutation remains blocked in production.

For a future deployment, configure the fixed OIDC issuer, audience, JWKS, authorization/token endpoints, client, callback and public origin. Then link a verified provider subject to an existing workspace member using the owner-only, explicit-confirmation `auth:link-identity` command. Never put role, workspace or capability authority in token claims. The trust chain is documented in the [production identity guide](./docs/production-identity.md), [browser authentication guide](./docs/browser-authentication.md), [production operations runbook](./docs/production-operations.md), [staging certification guide](./docs/staging-certification.md) and [deployment threat model](./docs/deployment-threat-model.md). Hosting-specific controls and an independent security review are still required.

Useful checks:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Generate and validate the deterministic Milestone 7 benchmark corpus without changing the demo database:

```bash
npm run benchmark:generate
npm run benchmark:generate -- --records 50000 --output .benchmark/corpus.json
npm run benchmark:run
npm run benchmark:run -- --records 50000 --updates 2500
npm run benchmark:questions
npm run benchmark:questions -- --validate .benchmark/human-question-authoring.json
npm run benchmark:hypotheses
npm run benchmark:discovery
npm run benchmark:hypothesis-quality
```

Generated benchmark files are ignored by Git. The default corpus spans five source systems and includes immutable versions, changed claims, near-duplicates, deletions, ambiguous aliases, long documents and actor-specific expected/forbidden evidence sets. Generation alone does not claim retrieval quality; `benchmark:run` performs the database evaluation.

`benchmark:discovery` evaluates 50 generated, unlabeled cross-source scenarios for grounding, governed-concept selection, source diversity and falsifiability, then writes an unscored human-review packet. See [the hypothesis discovery benchmark](./docs/hypothesis-discovery-benchmark.md) for what this result does and does not establish.

`benchmark:hypothesis-quality` evaluates positive, contested and negative-control cases without external calls, creates an independent case-authoring template and removes expected labels from a separate blind-review packet. See [the hypothesis quality protocol](./docs/hypothesis-quality-evaluation.md) for reviewer validation, aggregation and the current contradiction-handling gap.

`benchmark:run` recreates only an isolated benchmark workspace, ingests the corpus without calling AI providers, and reports version integrity, identity ambiguity, retrieval quality, permission leakage and latency. See [the scale benchmark report](./docs/scale-benchmark.md) for the current baseline and its limitations.

`benchmark:questions` creates or validates a Git-ignored blind-question authoring packet that excludes scorer answer sets and canonical project labels. See [the human evaluation protocol](./docs/human-evaluation.md).

The separately authorised `benchmark:semantic` command sends a maximum of 2,000 synthetic benchmark inputs to the configured embedding provider and compares lexical, exact-vector and hybrid retrieval, with exact-name and vocabulary-mismatch results reported separately. It requires the explicit `--confirm-synthetic-egress` flag. See [the semantic benchmark report](./docs/semantic-benchmark.md) for the measured result and decision.

Optional genuine semantic retrieval uses the OpenAI embeddings endpoint documented by [OpenAI](https://developers.openai.com/api/reference/resources/embeddings/methods/create). Put a real key only in ignored `.env.local`, set `EMBEDDING_PROVIDER=openai`, then run `npm run embeddings:sync`. With no provider or key, the app remains explicitly lexical-only; it never fabricates offline vectors.

Optional answer synthesis uses the OpenAI Responses API. Put a real key only in ignored `.env.local`, set `AI_MODE=provider`, `CHAT_PROVIDER=openai`, and explicitly choose `OPENAI_CHAT_MODEL`. The provider receives only the evidence already selected for the current actor. Calls use structured output, disable response storage, and cannot perform independent tool retrieval. Every generated claim must cite visible evidence UUIDs; invalid citations, provider errors, or missing configuration fall back to the deterministic answer.

## What to try

Ask the preset Atlas Onboarding question as each persona. Alex receives the public, internal and Alex-only executive evidence; Jamie receives the public, internal and Jamie-only fieldwork evidence; Morgan receives only the three public items. The access lens also shows Cedar Health/Cedar Renewal only to Alex and Harbour Energy/Harbour Discovery only to Jamie. Inaccessible names, sources and scores never enter another persona’s response, graph, trace or autocomplete results.

Try replacing “Atlas Bank” with `Atlas`, `atlas-bank`, `CRM account 381`, or `Atlas client folder` to see the same canonical client and its source identity keys. Ask about `Atlas onboarding channel` to resolve the messaging channel to the canonical project while retaining its thread as a separate content resource.

Open **Connect meaning** and inspect the separate semantic-change inbox. The supplier discovery has proposed `Supplier`, `IS_ONBOARDED_THROUGH`, and the `vendor → Supplier` alias, with five affected Resources and zero breaking changes shown before activation. Alex can approve or reject; other personas can inspect but cannot review. Approval publishes `northstar-ontology-v2`, records the mapping and replay receipt, and preserves v1. Run `npm run demo:setup` to restore the original fixture state.

As Alex, choose **Ingest new research finding** beneath the answer. The research connector ingests a prepared public eligibility-guidance follow-up through the normal sync path. A new source version, evidence Resource, provenance, signal snapshot and `CONTRADICTS` assertion are persisted; the next answer changes from **supported** to **contested**. Repeating the action is idempotent. Jamie and Morgan cannot trigger it. Run `npm run demo:setup` to remove this synthetic mutation and restore the initial state.

Open **Continual hypothesis + memory loop** in the persisted-state panel. The drawer shows the monitored hypothesis, permission-scoped execution contract, source trigger, before/after context snapshots, evidence delta and newly formed counter-hypothesis. Alex can accept it as durable memory or dismiss it while retaining the audit trail. These demo review writes are local-only and disabled in production.

At the top of that drawer, the **Unprompted discovery** lane shows a separate supplier-onboarding example: unlabeled source records flow through an ontology-guided pattern scan to an explicitly untrusted hypothesis candidate and human review gate. Alex can run a normal background scan, pause or resume its six-hour schedule, accept and start monitoring the result, or dismiss it. Run `npm run discovery:run` to initialise the fixture. CLI scheduling and workers can run independently with `npm run discovery:schedule` and `npm run discovery:worker`.

The same drawer now exposes monitor operations. **Run now** enqueues and drains a normal leased job; **Pause** disables scheduled work without deleting its history. Separate cards show the hypothesis lifecycle, current evidence state, queue health, model route, cumulative tokens/cost and permission-scoped notification outbox. CLI workers can be run independently with `npm run monitor:schedule` and `npm run monitor:worker`.

The ranking is named `demo-ranking-v3`. Its retrieval contribution uses reciprocal-rank fusion when genuine vectors are available, then combines authority, assertion confidence, freshness, engagement, affinity, epistemic confidence, and permission-filtered graph connectivity. Every contribution and retrieval rank is exposed. The weights and synthetic signal fixtures are illustrative and have not been empirically optimised.

## Current scope

Completed foundations: Milestones 0–10. Milestone 11 is pinned after its harness exposed a 0/20 contradiction-surfacing result; independent case authoring, blind review and the separately unauthorised full-vector run remain incomplete. Milestones 12–16 supply governed semantic evolution, production identity, browser sign-in, portable operations and release certification. Milestone 17 adds the real-product memory domain and executable isolation contract. Still deliberately deferred: host-product adapters, debrief capture, background general-purpose memory formation, reviewer operations, kickoff delivery, a live provider deployment, model-assisted ontology induction, independent quality evaluation, external notification delivery and an independent deployment security review.

See [ARCHITECTURE.md](./ARCHITECTURE.md), [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md), and [docs/permissions.md](./docs/permissions.md).

For responsible disclosure and deployment cautions, see [SECURITY.md](./SECURITY.md).

All organisations, people, clients, projects, and artefacts in this repository are synthetic.

Released under the [MIT License](./LICENSE).
