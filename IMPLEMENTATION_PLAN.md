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
- Implemented: a narrowly scoped permission-aware lexical function preserves fail-closed access checks while allowing PostgreSQL to use the text index. With maintained indexes and fresh planner statistics, the current measured 10,000-record p95 is approximately 3.59 ms, with zero observed leakage.
- Implemented: a deterministic 500-record incremental batch mixes 450 revisions with 50 deletions, advances source cursors and content provenance, retires old chunks, updates identity provenance and is safe to replay. The measured local run sustained approximately 762 records/second.
- Implemented: a capped, stratified sample sent 1,975 synthetic chunks and 25 synthetic queries to `text-embedding-3-small`, recording 227,377 input tokens, measured vector storage, indexing time and actor-scoped lexical, semantic and hybrid quality/latency.
- Implemented: resource-level fusion prevents different lexical and semantic chunks from duplicating one evidence Resource; both candidate functions fail closed and enforce document plus parent-Resource scopes.
- Finding: on exact-name benchmark questions, lexical precision@20 was 1.0 while semantic and hybrid precision were approximately 0.865 and 0.87, with no recall gain. Exact-vector p95 was approximately 74 ms over 1,975 vectors. PostgreSQL remains sufficient for this measured slice.
- Remaining: add independently authored paraphrase and vocabulary-mismatch questions, then benchmark a full vector corpus before deciding whether approximate pgvector or specialist graph/vector infrastructure is warranted.
