# Architecture

## Product boundary

The central product operation is:

```text
ContextRequest → ContextResponse
```

`ContextResponse` is useful without chat. It contains interpreted entities, ranked evidence, relationships, sources, provenance, a deterministic synthesis, and a safe execution trace. A future `/ask` endpoint will call this same context service.

## Canonical resource

`resources` is the canonical graph, citation, retrieval and security identity. Exactly one subtype row exists in either `entities` or `content_objects`.

```text
Resource
├── Entity: Person, Client, Project, Hypothesis, Evidence
└── ContentObject: ResearchNote, MeetingNote, Document, MessageThread
```

Documents are content resources, not duplicate document entities. Graph relationships always connect resource IDs.

## Assertions

A canonical fact and assertions about it are separate:

```text
Relationship: Evidence SUPPORTS Hypothesis
  ├── source-backed assertion from Research Note A
  └── AI-inferred assertion from another source (future)
```

An assertion stores its own access scope, source version, provenance span, assertion kind, process/version, confidence, and validity. A relationship is visible only when at least one actor-visible assertion establishes it. A restricted assertion about an otherwise public entity does not make the entity itself restricted.

Assertion kinds are `source-backed`, `rule-derived`, and `AI-inferred`.

## Current execution path

```text
TypeScript fixture
  → ResearchFixtureConnector, MeetingFixtureConnector, CrmFixtureConnector,
    DocumentFixtureConnector or MessageFixtureConnector
  → SyncRun and immutable SourceObjectVersion
  → semantic mapping
  → canonical content/evidence resources
  → resource relationship + assertion
  → provenance span and ACL scope
  → PostgreSQL tsvector representation
  → actor-scoped alias/source-key resolution and lexical retrieval
  → bounded actor-visible graph expansion
  → signal snapshot join + actor-visible graph feature
  → demo-ranking-v2
  → ContextResponse
  → Ask view and Brain Inspector
```

Cursor advancement occurs only after mapping succeeds. Replaying an unchanged cursor is idempotent.

CRM account `381`, the `atlas-bank` CRM slug, document folder `fld-atlas-381`, and `/clients/atlas-bank` folder path are stored as traceable identity keys backed by their source-object versions. They resolve to the existing Atlas Bank Resource rather than creating duplicate client or folder entities. The document itself remains a canonical content Resource.

Messaging channel `chn-atlas-onboarding` and its `atlas-onboarding` slug resolve to the existing Atlas Onboarding Project. Thread `thr-2026-08-30-synthesis` resolves to a separate `MessageThread` content Resource, avoiding a channel/thread/project identity collapse. The ontology is persisted as an immutable, checksummed version and returned from the actor-scoped context service.

## Ontology governance

The local editor accepts one relationship addition with an existing source and target Resource type. Only the demo Project Lead may publish. A transaction locks ontology publication, marks the current version superseded, inserts the next checksummed version, and records its publisher. A database trigger prevents mutation of snapshot content or invalid status transitions. The write route is disabled in production because `x-demo-actor` identifies a selectable persona rather than an authenticated human.

## Permission boundary

Permission-sensitive work must use `withActorTransaction`. It obtains a real `pg` connection, starts an interactive transaction, applies `SET LOCAL app.actor_id` and `SET LOCAL app.workspace_id`, verifies both settings, performs all reads, then commits or rolls back.

The application role does not own protected tables and has `NOBYPASSRLS`. With no actor transaction, protected queries return no rows. Connector writes use the separate non-owning `org_brain_ingest` role with workspace-scoped policies. Protected tables use `FORCE ROW LEVEL SECURITY`. See [docs/permissions.md](./docs/permissions.md).

## Retrieval and ranking

The current slice intentionally implements lexical, structured query interpretation, alias resolution, and permission-constrained graph expansion only. It does not mislabel deterministic test vectors as semantic embeddings.

`signal_observations` retains traceable point-in-time measurements for authority, freshness, engagement, affinity, and epistemic confidence. `signal_snapshots` materialises the current values used during retrieval. Both carry the evidence Resource’s access scope, use forced RLS, and are filtered before entering application memory.

`demo-ranking-v2` reranks a bounded lexical candidate pool using those five snapshot signals, assertion confidence, and an actor-visible graph-connectivity feature. Every raw signal and weighted contribution is returned. These weights are illustrative; tests verify expected fixture ordering and graph influence rather than optimisation claims. Provider embeddings and reciprocal-rank fusion remain deferred until a genuine provider is configured.

## Brain Inspector

The normal inspector is built only from permitted candidates. It does not know or report excluded candidate titles, names, URIs, snippets, or scores. It reports eligible resource count and permitted channel counts.

## Module boundaries

Domain work lives under `src/modules`; the application and API may depend on those modules, while domain modules may not import the UI/application layer. ESLint enforces this direction.

## Next milestones

Milestone 2 is complete. Milestone 3 now has first-class signals and graph-assisted ranking; its remaining work is genuine provider-semantic retrieval, reciprocal-rank fusion, and broader signal producers. Milestone 4 expands the complete permission matrix. Milestone 5 adds the contradiction through the normal research connector. Milestone 6 adds optional AI synthesis over the authorised context packet.
