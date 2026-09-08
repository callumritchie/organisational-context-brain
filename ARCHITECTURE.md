# Architecture

## Product boundary

The central product operation is:

```text
ContextRequest → ContextResponse
```

`ContextResponse` is useful without chat. It contains interpreted entities, ranked evidence, relationships, sources, provenance, an explicit actor-visible epistemic state, a deterministic synthesis, and a safe execution trace. `POST /api/v1/ask` calls this same context service before optionally passing only its selected authorised evidence to a chat provider.

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
  → optional genuine provider query embedding + exact pgvector retrieval
  → reciprocal-rank fusion (or explicit lexical-only fallback)
  → bounded actor-visible graph expansion
  → signal snapshot join + actor-visible graph feature
  → demo-ranking-v3
  → supported / contested / insufficient epistemic assessment
  → ContextResponse
  → deterministic answer or grounded ChatProvider synthesis
  → Ask view and Brain Inspector
```

Cursor advancement occurs only after mapping succeeds. Replaying an unchanged cursor is idempotent.

The Milestone 5 learning demonstration advances the research connector from its initial cursor to a prepared eligibility-guidance follow-up. It uses the same ingestion transaction and mapping path to persist a new immutable source version, content and evidence Resources, assertion, provenance, search document, signals and `CONTRADICTS` relationship. Subsequent actor-scoped context requests reassess only their selected visible evidence. The mutation route is Project Lead-controlled in the demo and entirely disabled in production until genuine authentication exists.

CRM account `381`, the `atlas-bank` CRM slug, document folder `fld-atlas-381`, and `/clients/atlas-bank` folder path are stored as traceable identity keys backed by their source-object versions. They resolve to the existing Atlas Bank Resource rather than creating duplicate client or folder entities. The document itself remains a canonical content Resource.

Messaging channel `chn-atlas-onboarding` and its `atlas-onboarding` slug resolve to the existing Atlas Onboarding Project. Thread `thr-2026-08-30-synthesis` resolves to a separate `MessageThread` content Resource, avoiding a channel/thread/project identity collapse. The ontology is persisted as an immutable, checksummed version and returned from the actor-scoped context service.

## Ontology governance

The local editor accepts one relationship addition with an existing source and target Resource type. Only the demo Project Lead may publish. A transaction locks ontology publication, marks the current version superseded, inserts the next checksummed version, and records its publisher. A database trigger prevents mutation of snapshot content or invalid status transitions. The write route is disabled in production because `x-demo-actor` identifies a selectable persona rather than an authenticated human.

## Permission boundary

Permission-sensitive work must use `withActorTransaction`. It obtains a real `pg` connection, starts an interactive transaction, applies `SET LOCAL app.actor_id` and `SET LOCAL app.workspace_id`, verifies both settings, performs all reads, then commits or rolls back.

The application role does not own protected tables and has `NOBYPASSRLS`. With no actor transaction, protected queries return no rows. Connector writes use the separate non-owning `org_brain_ingest` role with workspace-scoped policies. Protected tables use `FORCE ROW LEVEL SECURITY`. See [docs/permissions.md](./docs/permissions.md).

The fixture includes four scopes: workspace-wide, internal delivery team, Alex-only and Jamie-only. A non-login Sync Service user has explicit manage grants for ingestion, avoiding the earlier shortcut where connector writes used Jamie's identity. Alex can discover Cedar Health/Cedar Renewal and one executive source; Jamie can discover Harbour Energy/Harbour Discovery and one fieldwork source; Morgan can discover neither and cannot access internal evidence. The same boundary applies to autocomplete, retrieval, context, graph and trace assembly.

## Retrieval and ranking

The application always supports lexical retrieval. When `EMBEDDING_PROVIDER=openai` and a server-side key are configured, an explicit indexing command stores genuine 1,536-dimensional provider vectors with provider, model, content hash, Resource and access-scope provenance. Query-time exact pgvector similarity and lexical ranks are combined by reciprocal-rank fusion. Provider failure or an empty index degrades to an explicitly reported lexical-only path; offline mode never creates placeholder embeddings.

`signal_observations` retains traceable point-in-time measurements for authority, freshness, engagement, affinity, and epistemic confidence. `signal_snapshots` materialises the current values used during retrieval. Both carry the evidence Resource’s access scope, use forced RLS, and are filtered before entering application memory.

`demo-ranking-v3` reranks the fused candidate pool using retrieval fusion, those five snapshot signals, assertion confidence, and an actor-visible graph-connectivity feature. Every rank, raw signal and weighted contribution is returned. These weights are illustrative; tests verify expected ordering and graph influence rather than optimisation claims.

## Brain Inspector

The normal inspector is built only from permitted candidates. It does not know or report excluded candidate titles, names, URIs, snippets, or scores. It reports eligible resource count and permitted channel counts.

## Disposable answer synthesis

The chat provider sits after context assembly and has no retrieval tools. Its input is a compact projection of the selected `ContextResponse` evidence: evidence UUID, title, summary, stance, confidence, source type and authorised excerpt, plus the query and epistemic assessment. It does not receive the actor identity, hidden candidates, graph, access profile, source inventory or raw database access.

Provider output is structured as claims with evidence UUIDs. The answer service rejects claims with missing or unknown citations. When the context is contested, at least one contradicting evidence UUID must be represented. Provider failures and invalid grounding return the existing deterministic answer. Offline mode is the default, answer outputs are not persisted, and the OpenAI adapter requests `store: false`.

## Module boundaries

Domain work lives under `src/modules`; the application and API may depend on those modules, while domain modules may not import the UI/application layer. ESLint enforces this direction.

## Current milestone state

Milestones 0–6 are complete. The next work should focus on production authentication and deployment hardening, broader evaluation, or a larger synthetic corpus rather than adding another retrieval path inside the model layer.
