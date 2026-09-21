# Architecture

## Product boundary

This repository is a reference implementation for a governed memory extension to an existing internal AI product. The product loop is:

```text
Project work
  → evidenced candidate in its original permission scope
  → review, conflict and outcome handling
  → durable scoped memory
  → proactive precedent in later work
  → new outcomes compound or correct that memory
```

`ContextRequest → ContextResponse` is the currently implemented reference path and one eventual consumer of that memory. `ContextResponse` is useful without chat: it contains interpreted entities, ranked evidence, relationships, sources, provenance, an explicit actor-visible epistemic state, deterministic synthesis and a safe execution trace. `POST /api/v1/ask` calls the same context service before optionally passing only selected authorised evidence to a chat provider.

Milestone 18 implements the portable integration seam and reference workflow. `HostProductAdapter` supplies an authoritative project/client/membership snapshot; the public repository supplies only a synthetic adapter. The real product API, schema and in-product placement are not present.

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
  → overlapping, offset-addressable PostgreSQL tsvector chunks
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

## Organisational memory domain

Milestone 17 generalises “memory” beyond hypothesis records. It defines person, project, client, domain and organisation scopes as explicit logical boundaries mapped to existing PostgreSQL access scopes.

```text
Evidence Resource(s) in scope A
  → typed candidate in scope A
  → corroborate / contradict / qualify / attach outcome
  → human-reviewed abstraction, when policy permits
  → new Memory Resource in scope B

Restricted evidence and promotion lineage remain in scope A.
```

`organisational_memories.resource_id` references the canonical `resources` table. The Resource base access scope must equal the memory visibility scope, so a separate memory table cannot bypass ordinary identity and retrieval security. Memory records retain origin and visibility independently, along with type, transfer class, sensitivity, review state, lifecycle, outcome, confidence, quality, validity, freshness and process/policy versions.

The five scopes form a lattice, not a pipeline. Version 1 keeps person memory owner-only, forbids direct project-to-project copies, disables project-to-client promotion, and retrieves organisation memory rather than copying it downward. A cross-boundary project/client-to-domain/organisation or domain-to-organisation transition can only create a new approved, reviewed, non-confidential abstraction without raw evidence. Forced RLS hides evidence, relations and promotion lineage unless the actor can access both sides.

The policy is encoded in `src/modules/organisational-memory/isolation-policy.ts` and enforced again by migrations `0018` and `0019`. The complete decision matrix and remaining host-product integration decisions are in [docs/memory-isolation-contract.md](./docs/memory-isolation-contract.md).

## Project-memory workflow

```text
HostProductAdapter(project + client + membership revision)
  → host project binding + active member roles
  → current actor-visible project content
  → debrief capture or scheduled background formation
  → leased ProjectMemoryJob + attributable CaptureRun
  → project-scoped candidate
  → Project Lead approval / rejection / correction
  → active reviewed memory
  → actor-specific KickoffPack
```

The host snapshot is the membership authority; token claims never become project roles. Formation currently uses deterministic material-signal rules and records `no-model`. A debrief becomes a canonical, versioned and provenance-linked content Resource before it can evidence a memory. Corrections create replacement Resources and explicit supersession rather than editing history. Kickoff assembly admits only active, approved project memory and already permitted domain/organisation abstractions. It never admits client memory in policy v1. Details and the remaining proprietary boundary are in [docs/project-memory-workflow.md](./docs/project-memory-workflow.md).

## External-source perception boundary

Milestone 20 adds the seam between external material and the canonical context graph without claiming a live vendor integration:

```text
API / CLI / MCP adapter contract
  → ExternalSourceConnection + immutable SyncReceipt
  → SourceObjectVersion
  → permissioned document / table / transcript / image Resource
  → deterministic PerceptionRun
  → exact-locator PerceivedObservation Resource
  → DERIVED_FROM source assertion
  → INDICATES / CHALLENGES / MEASURES governed context assertion
  → scheduled governed-concept discovery
  → untrusted hypothesis + predictions + falsification conditions
```

The included implementations are entirely synthetic. They exercise cursor idempotency, freshness, entitlement revisions, deletion modes and four modality locators while recording zero external calls and zero model tokens. Access is inherited before perception: the artifact, run, observation, relationship assertion and locator all share the artifact's access boundary. A six-hour deterministic policy may then form an untrusted candidate from multi-source public evidence. Candidate and evidence must share an exact access scope, and RLS exposes the candidate only when every evidence Resource is visible. Forced RLS removes all other inaccessible state before it reaches the UI. Details and the live-connector work still required are in [docs/simulated-source-perception.md](./docs/simulated-source-perception.md).

## Continual hypothesis and memory control plane

Milestone 8 makes learning an explicit product operation rather than a side effect of answering a question:

```text
Any connector commits SourceObjectVersion(s)
  → permission-scoped SourceChangeEvent
  → matching MonitorPolicy
  → leased, retryable MonitorJob
  → restricted service identity
  → same permission-scoped Context Service
  → compare before/after ContextSnapshots
  → durable EvidenceDelta
  → HypothesisEvaluation + state transition
  → ModelRouteDecision + token/cost ledger
  → reviewable MemoryCandidate + NotificationOutbox
  → human promotion, dismissal, supersession or retirement
```

Research, meeting, CRM, document and message syncs all use one change-event contract. Events are grouped by access scope and route only to active policies with the exact same scope and an explicit connector subscription. Workers claim jobs with `FOR UPDATE SKIP LOCKED`, a lease timeout, bounded retries, idempotency keys and a dead-letter state. Daily schedules and manual operations create events and jobs through the same path. The local demo drains after its prepared mutation so interaction remains immediate, while `monitor:schedule` and `monitor:worker` can run as separate processes.

Each configurable policy supplies its Hypothesis Resource, query, owner, service actor, access scope, connectors and interval. The evaluator no longer contains Atlas-specific IDs. `hypothesis_records` keeps administrative lifecycle (`proposed`, `active`, `superseded`, `retired`) separate from evidence state (`untested`, `insufficient`, `supported`, `contested`, `refuted`, `stale`). Immutable revisions carry predictions and falsification conditions; evaluations and transitions retain why the state changed. Lifecycle supersession or retirement stops associated monitors and strands no runnable job.

`memory_candidates.status = proposed` is deliberately not organisational truth. Acceptance creates a canonical `Hypothesis` Resource and a rule-derived, source-version-backed `Evidence SUPPORTS Hypothesis` assertion with a copied provenance span. Dismissal retains the candidate and its audit trail. This is explicit durable memory; it is not model fine-tuning, hidden prompt state or an untraceable model-weight change.

Model routing follows “no model unless needed”. Deterministic evidence deltas use `no-model`; configurable economy, balanced and high-assurance routes enforce approved providers plus daily-token and monthly-cost ceilings before a gateway can run. Every decision—including skipped and budget-blocked work—is durable. No cross-scope model-output cache exists, so cached restricted content cannot be replayed into another permission context.

The monitored-hypothesis formation rule generalises across configured hypotheses and all connector events when evidence already has a governed `SUPPORTS` or `CONTRADICTS` stance. The 10,000-record deterministic contract benchmark validates event uniqueness, connector coverage, versioned stance changes, duplicate suppression, permissions and zero-token routing.

## Open-ended hypothesis discovery

Milestone 9 adds a separate path for raw canonical content that has no prepared stance label:

```text
Unlabeled canonical content from permitted sources
  → governed concept matches
  → cross-source diversity threshold
  → untrusted HypothesisDiscoveryCandidate
  → prediction + falsification condition + exact evidence references
  → Project Lead review
  → canonical Hypothesis Resource
  → normal continual MonitorPolicy
```

Discovery policies bind one project, an access scope, source subscriptions, governed concept rules and a minimum source-diversity threshold. Candidate formation is deterministic in the current slice and records a `no-model` decision in the same usage ledger as monitoring. Candidates are not graph truth and are never silently promoted. Acceptance copies their evidence Resource IDs, predictions and falsification conditions into a governed Hypothesis Resource and creates a standard monitor; dismissal retains the audit record.

Milestone 10 puts this path behind the same kind of durable control plane as monitoring. Source-change events route to a discovery policy only when its connector, project and exact access scope match. Event, scheduled and manual work becomes a leased `hypothesis_discovery_job` with retry and dead-letter semantics. Workers scan current non-deleted canonical content, while immutable candidate observations preserve what each run saw. Re-observed candidates update in place, two consecutive absent sweeps supersede an unreviewed candidate, and a returning pattern is explicitly reactivated. A shared event is not marked processed until all associated monitor and discovery work has settled.

The five-source Verdant supplier-onboarding fixture contains no hypothesis or `SUPPORTS`/`CONTRADICTS` label. The 50-case benchmark proves policy conformance, grounding and falsifiability against generated vocabulary. Its human-quality rubric remains unscored. These boundaries prevent a deterministic golden set from being presented as evidence of causal intelligence.

## Unified hypothesis read model

The monitored and discovered paths now project into one permission-scoped read contract. Every item uses three independent axes: lifecycle (`proposed`, `active`, `superseded`, `retired`), evidence (`untested`, `insufficient`, `supported`, `contested`, `refuted`, `stale`) and review (`not-required`, `required`, `accepted`, `dismissed`). A proposed discovery is therefore visible as an untested item awaiting review, not as an active monitor. Acceptance moves it into the active lifecycle and enables its monitoring contract without erasing its discovered provenance.

`GET /api/v1/hypotheses` is the first compatibility boundary: it reads the two existing stores through their normal actor-scoped services and returns one projection for product surfaces. It does not yet merge their write paths, queues or persistence tables. That narrower migration is intentional; callers can adopt one vocabulary before durable writes are moved behind one service.

## Intelligence evaluation boundary

Milestone 11 treats evaluation as a separate system boundary. A generated 100-case suite mixes ordinary positives, contradiction-rich positives and negative controls. Machine checks measure candidate detection, false positives, grounding and configured-concept selection, while contradiction surfacing is reported independently. The current deterministic path scores 0/20 on that last measure: it detects the recurring concept but does not preserve evidence that disputes its causal interpretation.

Independent quality uses two separated artifacts. A case-authoring packet contains hidden expected outcomes and requires an attestation that its author did not inspect the implementation. The derived blind-review packet contains source records and system output but no expected labels. Two or more distinct reviewers score grounding, novelty, usefulness, falsifiability, contradiction handling and actionability; absent candidates are assessed only for missed material patterns. Aggregation records reviewer agreement, unsupported and missed-pattern rates, and the difference between system confidence and human grounding.

This harness has no provider dependency and records zero external spend. The full-vector 10,000-document run remains a separate, explicitly authorised egress decision.

CRM account `381`, the `atlas-bank` CRM slug, document folder `fld-atlas-381`, and `/clients/atlas-bank` folder path are stored as traceable identity keys backed by their source-object versions. They resolve to the existing Atlas Bank Resource rather than creating duplicate client or folder entities. The document itself remains a canonical content Resource.

Messaging channel `chn-atlas-onboarding` and its `atlas-onboarding` slug resolve to the existing Atlas Onboarding Project. Thread `thr-2026-08-30-synthesis` resolves to a separate `MessageThread` content Resource, avoiding a channel/thread/project identity collapse. The ontology is persisted as an immutable, checksummed version and returned from the actor-scoped context service.

## Ontology governance

The local editor accepts one relationship addition with an existing source and target Resource type. Only the demo Project Lead may publish. A transaction locks ontology publication, marks the current version superseded, inserts the next checksummed version, and records its publisher. A database trigger prevents mutation of snapshot content or invalid status transitions. The write route is disabled in production because `x-demo-actor` identifies a selectable persona rather than an authenticated human.

## Permission boundary

Permission-sensitive work must use `withActorTransaction`. It obtains a real `pg` connection, starts an interactive transaction, applies `SET LOCAL app.actor_id` and `SET LOCAL app.workspace_id`, verifies both settings, performs all reads, then commits or rolls back.

The application role does not own protected tables and has `NOBYPASSRLS`. With no actor transaction, protected queries return no rows. Connector writes use the separate non-owning `org_brain_ingest` role with workspace-scoped policies. Protected tables use `FORCE ROW LEVEL SECURITY`. See [docs/permissions.md](./docs/permissions.md).

The fixture includes four scopes: workspace-wide, internal delivery team, Alex-only and Jamie-only. A non-login Sync Service user has explicit manage grants for ingestion, avoiding the earlier shortcut where connector writes used Jamie's identity. Alex can discover Cedar Health/Cedar Renewal and one executive source; Jamie can discover Harbour Energy/Harbour Discovery and one fieldwork source; Morgan can discover neither and cannot access internal evidence. The same boundary applies to autocomplete, retrieval, context, graph and trace assembly.

## Retrieval and ranking

The application always supports lexical retrieval. Long source text is split on sentence or word boundaries into overlapping chunks with exact character offsets. A new source version retires all prior chunks for that evidence Resource, and retrieval deduplicates chunks back to the best evidence-level result. Lexical candidates are selected by a security-definer database function that manually enforces actor, workspace, document-scope and parent-resource-scope checks before returning only IDs and scores; this permits indexed filtering without weakening the fail-closed RLS boundary used by subsequent joins.

When `EMBEDDING_PROVIDER=openai` and a server-side key are configured, an explicit indexing command stores genuine 1,536-dimensional provider vectors with provider, model, content hash, Resource and access-scope provenance. Permission-aware lexical and semantic functions select the best chunk per Resource before reciprocal-rank fusion, preventing two channel-specific chunks from duplicating one evidence item. Query-time exact pgvector similarity and lexical ranks are combined by reciprocal-rank fusion. Provider failure or an empty index degrades to an explicitly reported lexical-only path; offline mode never creates placeholder embeddings. Vectors attached to retired chunks are marked non-current before indexing.

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

Milestones 0–10 are implemented. Milestone 11 has an independent-evaluation harness and a measured contradiction-handling gap, but is pinned until external authors and reviewers supply genuine judgements. Milestones 12–16 provide governed ontology evolution, production identity, browser authentication, portable runtime operations and exact-release certification. Milestones 17–18 provide the broader organisational-memory domain, executable isolation contract and reference project-memory workflow. Milestones 19–20 add the minimum shared context-asset contract, governed metric semantics, dependency graph, deterministic quality receipts and a simulated multimodal source-perception boundary for the onboarding-diagnosis scenario.

The repository still does not contain the proprietary host product adapter, real product placement, client-wide access model, external notification delivery, live metric execution or a live deployment. The synthetic ports prove integration contracts and behavior, not compatibility with an API, CLI, MCP server or analytics source that has not been supplied. The context-asset and perception foundations are not yet a general runtime extraction harness.
