# Organisational Context Brain

Most AI agents search organisational data independently.

This project explores a different model: a shared organisational context layer that continuously resolves content, entities, relationships, permissions and signals into a reusable “brain” that any authorised agent or application can query.

```text
Sources → Canonical resources + assertions → Permissioned retrieval → Context API → Consumers
```

The completed Milestones 0–5 are intentionally small but real. Independent research, meeting, CRM, document, and message connectors ingest Northstar Labs knowledge about Atlas Bank, store immutable source versions, resolve aliases and source identity keys to canonical resources, create assertion-level provenance, apply forced PostgreSQL row-level security, retrieve evidence, expand a permission-safe resource graph, and expose the result through `POST /api/v1/context` and an evidence-first interface. The same response includes connector health, an editable checksummed ontology, first-class signal snapshots, transparent hybrid ranking, and an explicit evidence state.

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
```

Generated benchmark files are ignored by Git. The default corpus spans five source systems and includes immutable versions, changed claims, near-duplicates, deletions, ambiguous aliases, long documents and actor-specific expected/forbidden evidence sets. Generation alone does not claim retrieval quality; `benchmark:run` performs the database evaluation.

`benchmark:run` recreates only an isolated benchmark workspace, ingests the corpus without calling AI providers, and reports version integrity, identity ambiguity, retrieval quality, permission leakage and latency. See [the scale benchmark report](./docs/scale-benchmark.md) for the current baseline and its limitations.

The separately authorised `benchmark:semantic` command sends a maximum of 2,000 synthetic benchmark inputs to the configured embedding provider and compares lexical, exact-vector and hybrid retrieval, with exact-name and vocabulary-mismatch results reported separately. It requires the explicit `--confirm-synthetic-egress` flag. See [the semantic benchmark report](./docs/semantic-benchmark.md) for the measured result and decision.

Optional genuine semantic retrieval uses the OpenAI embeddings endpoint documented by [OpenAI](https://developers.openai.com/api/reference/resources/embeddings/methods/create). Put a real key only in ignored `.env.local`, set `EMBEDDING_PROVIDER=openai`, then run `npm run embeddings:sync`. With no provider or key, the app remains explicitly lexical-only; it never fabricates offline vectors.

Optional answer synthesis uses the OpenAI Responses API. Put a real key only in ignored `.env.local`, set `AI_MODE=provider`, `CHAT_PROVIDER=openai`, and explicitly choose `OPENAI_CHAT_MODEL`. The provider receives only the evidence already selected for the current actor. Calls use structured output, disable response storage, and cannot perform independent tool retrieval. Every generated claim must cite visible evidence UUIDs; invalid citations, provider errors, or missing configuration fall back to the deterministic answer.

## What to try

Ask the preset Atlas Onboarding question as each persona. Alex receives the public, internal and Alex-only executive evidence; Jamie receives the public, internal and Jamie-only fieldwork evidence; Morgan receives only the three public items. The access lens also shows Cedar Health/Cedar Renewal only to Alex and Harbour Energy/Harbour Discovery only to Jamie. Inaccessible names, sources and scores never enter another persona’s response, graph, trace or autocomplete results.

Try replacing “Atlas Bank” with `Atlas`, `atlas-bank`, `CRM account 381`, or `Atlas client folder` to see the same canonical client and its source identity keys. Ask about `Atlas onboarding channel` to resolve the messaging channel to the canonical project while retaining its thread as a separate content resource.

In the Ontology section, use Alex Chen to add the prepared `COLLABORATES_WITH` rule. The editor validates its endpoints, publishes `northstar-ontology-v2`, records Alex as publisher, and preserves v1 as superseded. Jamie and Morgan cannot publish. Run `npm run demo:setup` to restore the original fixture state.

As Alex, choose **Ingest new research finding** beneath the answer. The research connector ingests a prepared public eligibility-guidance follow-up through the normal sync path. A new source version, evidence Resource, provenance, signal snapshot and `CONTRADICTS` assertion are persisted; the next answer changes from **supported** to **contested**. Repeating the action is idempotent. Jamie and Morgan cannot trigger it. Run `npm run demo:setup` to remove this synthetic mutation and restore the initial state.

The ranking is named `demo-ranking-v3`. Its retrieval contribution uses reciprocal-rank fusion when genuine vectors are available, then combines authority, assertion confidence, freshness, engagement, affinity, epistemic confidence, and permission-filtered graph connectivity. Every contribution and retrieval rank is exposed. The weights and synthetic signal fixtures are illustrative and have not been empirically optimised.

## Current scope

Completed: Milestones 0–6. Milestone 7 scale and messiness validation is in progress; deterministic 10,000-record ingestion, ambiguity preservation, long-document chunks, current-version retirement, replay-safe incremental updates, permission-scoped lexical measurements, a genuine 1,975-vector semantic sample, and a paired vocabulary-mismatch evaluation cohort are implemented. The provider-based comparison on that new cohort and full-scale vector measurements remain. The system already includes source identity resolution, five connectors, governed ontology editing, a focused graph UI, permission-scoped signals, genuine provider embeddings, exact pgvector retrieval, resource-level reciprocal-rank fusion, four distinct access scopes, actor-safe autocomplete, a complete current-surface leakage matrix, an idempotent contradiction-ingestion scenario, and evidence-ID-grounded AI synthesis through `POST /api/v1/ask`. Deliberately deferred: broader signal producers, approximate vector indexing at scale, and production authentication/deployment hardening.

See [ARCHITECTURE.md](./ARCHITECTURE.md), [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md), and [docs/permissions.md](./docs/permissions.md).

For responsible disclosure and deployment cautions, see [SECURITY.md](./SECURITY.md).

All organisations, people, clients, projects, and artefacts in this repository are synthetic.

Released under the [MIT License](./LICENSE).
