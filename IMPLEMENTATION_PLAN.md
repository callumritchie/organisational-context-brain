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

- Add a research source mutation endpoint.
- Connector observes the new eligibility finding.
- Normal sync creates its source version, evidence Resource, assertions, provenance and `CONTRADICTS` edge.
- Recalculate epistemic state and change every subsequent ContextResponse.

## Milestone 6 — AI synthesis

- Add provider interfaces and `/api/v1/ask`.
- Supply only the already-authorised ContextResponse evidence.
- Require evidence IDs in generated claims and retain deterministic/offline mode.
