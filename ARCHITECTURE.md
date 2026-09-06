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
└── ContentObject: ResearchNote, MeetingNote
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
  → ResearchFixtureConnector or MeetingFixtureConnector
  → SyncRun and immutable SourceObjectVersion
  → semantic mapping
  → canonical content/evidence resources
  → resource relationship + assertion
  → provenance span and ACL scope
  → PostgreSQL tsvector representation
  → actor-scoped alias resolution and lexical retrieval
  → bounded actor-visible graph expansion
  → demo-ranking-v1
  → ContextResponse
  → Ask view and Brain Inspector
```

Cursor advancement occurs only after mapping succeeds. Replaying an unchanged cursor is idempotent.

## Permission boundary

Permission-sensitive work must use `withActorTransaction`. It obtains a real `pg` connection, starts an interactive transaction, applies `SET LOCAL app.actor_id` and `SET LOCAL app.workspace_id`, verifies both settings, performs all reads, then commits or rolls back.

The application role does not own protected tables and has `NOBYPASSRLS`. With no actor transaction, protected queries return no rows. Connector writes use the separate non-owning `org_brain_ingest` role with workspace-scoped policies. Protected tables use `FORCE ROW LEVEL SECURITY`. See [docs/permissions.md](./docs/permissions.md).

## Retrieval and ranking

The current slice intentionally implements lexical, structured query interpretation, alias resolution, and permission-constrained graph expansion only. It does not mislabel deterministic test vectors as semantic embeddings.

`demo-ranking-v1` combines normalised lexical rank, source authority, assertion confidence, and freshness. Every contribution is returned. These weights are illustrative; tests verify expected fixture ordering rather than optimisation claims.

## Brain Inspector

The normal inspector is built only from permitted candidates. It does not know or report excluded candidate titles, names, URIs, snippets, or scores. It reports eligible resource count and permitted channel counts.

## Module boundaries

Domain work lives under `src/modules`; the application and API may depend on those modules, while domain modules may not import the UI/application layer. ESLint enforces this direction.

## Next milestones

The remainder of Milestone 2 adds ontology editing and additional connectors. Milestone 3 adds graph-assisted ranking, provider-semantic retrieval, and first-class signals. Milestone 4 expands the complete permission matrix. Milestone 5 adds the contradiction through the normal research connector. Milestone 6 adds optional AI synthesis over the authorised context packet.
