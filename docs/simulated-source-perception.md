# Simulated source perception

Milestone 20 proves the product boundary for API, CLI and MCP sources without making a network call or requiring a credential. Every organisation, project, source and artifact in this slice is synthetic.

## What the demo exercises

```text
Synthetic API / CLI / MCP adapter
  → project-scoped connection contract
  → cursor + entitlement revision + deletion semantics
  → immutable source object version
  → permissioned canonical artifact Resource
  → deterministic modality-specific perception run
  → exact-locator observation Resource
  → graph assertion to artifact and governed context term
  → scheduled, zero-token synthesis across permitted sources
  → untrusted hypothesis with predictions and falsification conditions
  → project memory and downstream intelligence
```

The three contracts intentionally use different integration strategies:

- the research API simulates a cursor-based synchronised copy;
- the warehouse CLI simulates an authoritative governed snapshot; and
- the meetings MCP tool simulates a query-time federated source.

Together they produce one document, one image, one table and one transcript. Deterministic extractors produce six observations with page offsets, sheet/row/column coordinates, transcript segment/timecodes or image regions. The process records `model_route=no-model` and `externalCallsMade=0`.

The public API and MCP artifacts also feed a six-hour discovery policy. It forms a versioned, untrusted hypothesis only when at least two independent sources match a governed concept rule. The candidate includes its evidence set, confidence, predictions and falsification conditions, and remains explicitly pending lead review. The internal CLI artifact is excluded from that public candidate rather than having its access scope widened. This proves the observation-to-learning seam without claiming general-purpose inference or automatic truth.

The project-memory read model exposes the durable identities needed to audit this path: connection ID, canonical artifact Resource ID, immutable source-object-version ID, observation Resource ID, assertion and relationship IDs, and hypothesis candidate ID. It also returns the next scheduled evaluation and the actor-visible artifact Resources cited by the hypothesis. The Working view renders these records directly and marks the answer trust gate: an unreviewed hypothesis is inspectable but does not become an answer fact.

The candidate retains its artifact Resources as the coarse evidence boundary and stores finer observation-level evidence links beneath them. Each link identifies the exact observation Resource, semantic assertion, role and rationale. Database validation rejects a link unless the candidate, artifact, observation and assertion share the same access boundary. The current synthetic hypothesis has supporting links and no observed challenge link; the schema supports both roles without inventing counter-evidence that is not present.

The prepared research mutation also returns a propagation receipt rather than only refreshing the answer. It joins the persisted sync run, immutable source version, extracted Evidence Resource, provenance assertion, hypothesis-monitor evaluation, reviewable candidate and before/after epistemic state. Replaying the same mutation returns the same identities with `outcome=duplicate`; it does not manufacture another version or another learning.

## Security and lifecycle contract

Source connections contain labels and capabilities, never secrets. The ingestion identity receives synthetic payloads through the same adapter interface a future connector would implement. Each artifact and every derived observation carries the artifact's access scope; PostgreSQL forced row-level security filters the artifact, perception run and observation before application code receives them.

A discovery candidate must have the same exact access scope as every evidence Resource it names. Database triggers reject cross-boundary evidence and forced RLS hides a candidate unless the actor can read every evidence Resource. This prevents a visible hypothesis from leaking a restricted identifier, title or source URI through its evidence list.

Connections retain entitlement revisions, freshness SLAs and deletion modes. A source tombstone retires its canonical artifact and derived observations. Replaying an unchanged cursor produces no new artifact versions or observations. Sync receipts make the simulated transport, cursor movement and response shape auditable.

## What remains external

This does not prove compatibility with a vendor API, CLI or MCP server. A real connector still needs provider-specific authentication, pagination, throttling, retry/error classification, webhook or polling operations, entitlement reconciliation, delete/backfill behavior and contract tests against that provider. OCR, layout understanding, free-form table interpretation and model-assisted extraction are also not implemented; the current modality extractors are deterministic fixtures designed to prove the governance path.

Run `npm run source-integration:bootstrap` after migrations and project-memory setup to refresh the simulated contracts. In the product, open **Project memory** and choose **Source perception**.
