# Organisational Context Brain

Most AI agents search organisational data independently.

This project explores a different model: a shared organisational context layer that continuously resolves content, entities, relationships, permissions and signals into a reusable “brain” that any authorised agent or application can query.

```text
Sources → Canonical resources + assertions → Permissioned retrieval → Context API → Consumers
```

The completed Milestones 0–6 are intentionally small but real. Independent research, meeting, CRM, document, and message connectors ingest Northstar Labs knowledge about Atlas Bank, store immutable source versions, resolve aliases and source identity keys to canonical resources, create assertion-level provenance, apply forced PostgreSQL row-level security, retrieve evidence, expand a permission-safe resource graph, and expose the result through `POST /api/v1/context` and an evidence-first interface. The same response includes connector health, an editable checksummed ontology, first-class signal snapshots, transparent hybrid ranking, and an explicit evidence state.

Milestone 8 adds a continual hypothesis and memory control plane. Every connector emits the same permission-scoped change event, PostgreSQL-backed workers lease replay-safe jobs, scheduled or manual runs reuse the Context Service, and durable hypothesis records distinguish administrative lifecycle from current evidence state. Each run records its model-routing decision and token/cost ledger; the default background policy is deterministic-only and sends nothing to an external provider. Material deltas create reviewable, attributable memory candidates and in-app notifications. Acceptance promotes a provenance-linked canonical Hypothesis Resource rather than changing model weights or silently rewriting organisational truth.

Milestone 9 adds a first open-ended discovery slice. Five unlabeled records from an unfamiliar synthetic supplier-onboarding scenario are ingested through separate research, meeting, CRM, document and message sources. Governed concept rules require cross-source corroboration before proposing a hypothesis, and every proposal includes exact evidence references, a prediction and a falsification condition. The proposal lives in a clearly marked untrusted inbox; accepting it creates a canonical Hypothesis Resource and a continual monitor. This path is deterministic and records zero external tokens by default.

Milestone 10 makes that discovery path continual. Project-scoped policies subscribe to connector changes and schedules; PostgreSQL workers lease replay-safe jobs, retry failures and preserve immutable observations of each candidate. Repeated evidence updates an unreviewed candidate rather than duplicating it, absent patterns become superseded only after repeated sweeps, and returning patterns are explicitly reactivated for review. The local interface exposes schedule state, pause/resume and a manual scan without adding another page.

Milestone 11 adds a deliberately adversarial quality harness. Its 100 zero-egress cases separate ordinary positives, contradiction-rich evidence and negative controls, then produce independent-authoring and blind-review packets. The current deterministic baseline detects and grounds its configured concepts but fails to surface contradictions in 20/20 contested cases. That gap is reported directly rather than averaged into the passing contract checks.

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

The credentials in `.env.example`, Docker Compose, and CI are deliberately disposable local-test values. Replace them with generated secrets for any non-local environment. Publishing this source repository does not deploy the application. The demo persona header is not production authentication: a network user could forge Alex’s ID and inherit Alex’s permissions. Ontology and prepared research-mutation writes are therefore blocked whenever `NODE_ENV=production`; do not expose this build directly to the public internet.

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

In the Ontology section, use Alex Chen to add the prepared `COLLABORATES_WITH` rule. The editor validates its endpoints, publishes `northstar-ontology-v2`, records Alex as publisher, and preserves v1 as superseded. Jamie and Morgan cannot publish. Run `npm run demo:setup` to restore the original fixture state.

As Alex, choose **Ingest new research finding** beneath the answer. The research connector ingests a prepared public eligibility-guidance follow-up through the normal sync path. A new source version, evidence Resource, provenance, signal snapshot and `CONTRADICTS` assertion are persisted; the next answer changes from **supported** to **contested**. Repeating the action is idempotent. Jamie and Morgan cannot trigger it. Run `npm run demo:setup` to remove this synthetic mutation and restore the initial state.

Open **Continual hypothesis + memory loop** in the persisted-state panel. The drawer shows the monitored hypothesis, permission-scoped execution contract, source trigger, before/after context snapshots, evidence delta and newly formed counter-hypothesis. Alex can accept it as durable memory or dismiss it while retaining the audit trail. These demo review writes are local-only and disabled in production.

At the top of that drawer, the **Unprompted discovery** lane shows a separate supplier-onboarding example: unlabeled source records flow through an ontology-guided pattern scan to an explicitly untrusted hypothesis candidate and human review gate. Alex can run a normal background scan, pause or resume its six-hour schedule, accept and start monitoring the result, or dismiss it. Run `npm run discovery:run` to initialise the fixture. CLI scheduling and workers can run independently with `npm run discovery:schedule` and `npm run discovery:worker`.

The same drawer now exposes monitor operations. **Run now** enqueues and drains a normal leased job; **Pause** disables scheduled work without deleting its history. Separate cards show the hypothesis lifecycle, current evidence state, queue health, model route, cumulative tokens/cost and permission-scoped notification outbox. CLI workers can be run independently with `npm run monitor:schedule` and `npm run monitor:worker`.

The ranking is named `demo-ranking-v3`. Its retrieval contribution uses reciprocal-rank fusion when genuine vectors are available, then combines authority, assertion confidence, freshness, engagement, affinity, epistemic confidence, and permission-filtered graph connectivity. Every contribution and retrieval rank is exposed. The weights and synthetic signal fixtures are illustrative and have not been empirically optimised.

## Current scope

Completed: Milestones 0–6. Milestone 7 scale and messiness validation is in progress; deterministic 10,000-record ingestion, ambiguity preservation, long-document chunks, current-version retirement, replay-safe incremental updates, permission-scoped lexical measurements, two genuine capped semantic samples, and a fail-closed blind-question authoring/validation workflow are implemented. Milestone 8 includes configurable hypothesis policies, connector-independent events, leased asynchronous jobs, schedules, repeated evaluation, lifecycle/evidence-state history, staleness and supersession primitives, reviewable latent-learning proposals, in-app notifications, monitor operations, deterministic model routing and a cost ledger. Its 10,000-record contract benchmark covers all five source shapes, detects 82/82 versioned stance changes, suppresses 909 duplicate records and reports zero permission leaks or external tokens. Milestone 9 provides governed open-ended discovery from unlabeled cross-source inputs, an untrusted review inbox, and promotion into continual monitoring. Milestone 10 adds project-agnostic discovery policy configuration, connector and scheduled triggers, leased retryable workers, immutable candidate observations, deduplication, supersession and reactivation. Milestone 11's harness now separates generated contract success from independent quality and reports the current 0/20 contradiction-surfacing result. Independent case authoring and blind review remain incomplete. Model-assisted concept induction and semantic-quality evaluation against independently authored judgements remain; the provider-neutral routing boundary exists but the background policy defaults to no model. Deliberately deferred: the unapproved full-corpus embedding run, external notification delivery, broader signal producers, approximate vector indexing at scale, production worker supervision and production authentication/deployment hardening.

See [ARCHITECTURE.md](./ARCHITECTURE.md), [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md), and [docs/permissions.md](./docs/permissions.md).

For responsible disclosure and deployment cautions, see [SECURITY.md](./SECURITY.md).

All organisations, people, clients, projects, and artefacts in this repository are synthetic.

Released under the [MIT License](./LICENSE).
