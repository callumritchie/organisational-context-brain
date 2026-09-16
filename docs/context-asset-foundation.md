# Context asset foundation

Milestone 19 introduces a common governed envelope for the context that the
system uses at runtime. It does not replace canonical `Resource` identity,
ontology versions, the knowledge graph, organisational memory or source
provenance. It connects those capabilities through one contract.

## Demonstrated scenario

The deliberately narrow scenario is **diagnose onboarding failure before
recommending an intervention**. Three certified assets are supplied:

1. `onboarding.abandonment` — the governed business term;
2. `metric.onboarding-abandonment-rate` — its formula, grain, dimensions,
   exclusions, observation window and declared source of truth;
3. `skill.diagnose-onboarding-failure` — the procedure that must use the term,
   metric, permissioned evidence and contradiction assessment.

The metric depends on the term. The diagnostic skill depends on both. These
are explicit dependency records rather than explanatory UI copy.

## Shared contract

Each context asset uses its canonical Resource UUID and records:

- a stable key and portable semantic URI;
- asset kind and scope;
- owner and authority class;
- lifecycle and version;
- confidence and validity window;
- last verification and next review;
- typed specification;
- source Resources and dependencies.

The current database supports terms, taxonomy concepts, ontology components,
metrics, policies, norms, skills and memories. This milestone only certifies
the minimum term/metric/skill set needed by the prepared diagnosis. Adding a
kind to the contract is not a claim that its full lifecycle is implemented.

## Quality gate

`context-quality-v1` deterministically assesses:

- accountable ownership;
- provenance or governed authority;
- freshness;
- confidence;
- kind-specific completeness;
- dependency integrity;
- one current candidate/certified version per stable key.

Missing ownership, invalid metric or skill semantics, an expired validity
window, stale certification, unresolved dependencies and competing current
versions block the asset. Assessments are immutable receipts tied to an input
digest. A high numeric score cannot override a blocking issue.

## Security boundary

The new tables use forced PostgreSQL row-level security. An application actor
can read an asset only when they can read its canonical Resource. A provenance
or dependency row is visible only when both Resources are visible. This means
the shared asset can remain discoverable without exposing a restricted source
or its lineage. Dependencies additionally require the exact same access scope;
this prevents a visible asset or global quality receipt from implying that a
hidden dependency exists.

## Run locally

After migration 0021 and the ordinary demo seed:

```bash
npm run demo:setup
```

To replay only the idempotent foundation bootstrap against an already-seeded
database:

```bash
npm run context-foundation:bootstrap
```

The project-memory workspace exposes the working dependency chain under
**Context contract**. This is a foundation view, not yet the Milestone 23
runtime context-assembly harness.

## Explicitly not built here

- enterprise-wide glossary or taxonomy administration;
- automatic certification of extracted terms or metrics;
- calculation execution against a real analytics warehouse;
- change approval, impact replay or supersession workflows;
- general-purpose procedural-skill execution;
- dynamic task-specific context assembly.

Those remain later milestones so this foundation is not mistaken for a
complete enterprise context layer. Replaying the bootstrap preserves the
existing certification date; it does not make stale context fresh merely
because a setup command was rerun.
