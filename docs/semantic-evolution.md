# Governed semantic evolution

Milestone 12 separates two forms of learning that must not be conflated:

- A **hypothesis** is a testable claim about the organisation.
- An **ontology proposal** asks to change the governed language used to classify Resources and connect them.

The background system may create either kind of proposal. Neither is trusted merely because a machine produced it.

## Demonstrated flow

The synthetic Verdant discovery contains five cross-source records about suppliers and vendors. The current ontology has a Project and its documents but no Supplier concept. The semantic proposal therefore contains one atomic, additive change set:

1. add the entity type `Supplier`;
2. add `Supplier --IS_ONBOARDED_THROUGH→ Project`;
3. map the source alias `vendor` to `Supplier`.

Before review, the system validates dependencies and reports the evidence Resources, related assertions and hypotheses, breaking-change count, base ontology version and replay action. The proposal is still inactive.

Only the Project Lead can approve or reject in the local demo. Approval holds a workspace ontology lock, verifies that the proposal's base version is still current, and atomically creates a checksummed version plus its mapping rules. If the base changed first, the proposal becomes superseded; it is never silently rebased. Rejection retains the evidence and decision.

Historical discovery runs now retain the ontology version used to produce them. Active discovery policies advance to the approved version, and an activation receipt records the affected permission-scoped context and replay result. Existing canonical Resources are not mutated as a side effect.

## What this proves

- Semantic changes can be proposed and reviewed independently of hypothesis review.
- A new type, relation and alias can be activated without editing application logic.
- Old ontology snapshots and old run semantics remain attributable.
- Direct ontology publication through the API is no longer available.
- Production mutations remain disabled until real authentication and steward roles exist.

## What this does not prove

The prepared demo does not establish that a model can reliably invent useful ontologies from arbitrary domains. It does not yet provide rollback-by-new-version, broad source-mapping administration, production steward assignment or independent semantic-quality scoring. Those remain explicit gates rather than implied capabilities.
