# Organisational Context Brain

Most AI agents search organisational data independently.

This project explores a different model: a shared organisational context layer that continuously resolves content, entities, relationships, permissions and signals into a reusable “brain” that any authorised agent or application can query.

```text
Sources → Canonical resources + assertions → Permissioned retrieval → Context API → Consumers
```

The current Milestone 2 slice is intentionally small but real. Independent research, meeting, CRM, and document connectors ingest Northstar Labs knowledge about Atlas Bank, store immutable source versions, resolve aliases and source identity keys to canonical resources, create assertion-level provenance, apply forced PostgreSQL row-level security, retrieve lexical evidence, expand a permission-safe resource graph, and expose the result through `POST /api/v1/context` and an evidence-first interface. The same response includes a checksummed ontology version and connector health.

No LLM or API key is required.

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

The credentials in `.env.example`, Docker Compose, and CI are deliberately disposable local-test values. Replace them with generated secrets for any non-local environment. The demo persona header is not production authentication; do not expose this build directly to the public internet.

Useful checks:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## What to try

Ask the preset Atlas Onboarding question as Alex Chen, then switch to Morgan Reed. Alex receives four evidence items across Research and Meetings; Morgan receives the three public items. The internal operations note never enters Morgan’s response, graph, or trace. Try replacing “Atlas Bank” with `Atlas`, `atlas-bank`, `CRM account 381`, or `Atlas client folder` to see the same canonical client and its source identity keys.

The ranking is named `demo-ranking-v1`. Its weights are illustrative and have not been empirically optimised.

## Current scope

Completed: Milestones 0 and 1, plus the bounded Milestone 2 slice covering Atlas aliases, Meetings, CRM and Documents connectors, source identity keys including document-folder identity, a versioned ontology view, focused graph UI, and graph-connected retrieval evaluation. Deliberately deferred: ontology editing, a Messages connector, graph-assisted ranking, first-class signals, the contradiction ingestion scenario, and provider-backed AI synthesis.

See [ARCHITECTURE.md](./ARCHITECTURE.md), [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md), and [docs/permissions.md](./docs/permissions.md).

For responsible disclosure and deployment cautions, see [SECURITY.md](./SECURITY.md).

All organisations, people, clients, projects, and artefacts in this repository are synthetic.

Released under the [MIT License](./LICENSE).
