# Organisational memory isolation contract

## Purpose

The product does not simply answer questions over a shared search index. It turns evidence from project work into durable, reusable precedent while preserving the boundary in which each fact was learned.

The core loop is:

```text
Project work
  → explicit debrief or governed background observation
  → evidenced memory candidate in the same scope
  → review, corroboration and conflict checks
  → active scoped memory
  → permissioned retrieval into later work
  → observed outcome
  → strengthen, qualify, supersede or retire the memory
```

This document defines the version 1 safety boundary for that loop. It is an executable contract: the TypeScript policy expresses product decisions, while PostgreSQL constraints, triggers and forced row-level security enforce storage and visibility invariants.

## Scope lattice

The five memory layers are distinct governance boundaries, not a ladder that automatically copies knowledge upward.

| Scope        | Intended contents                                                                         | Version 1 boundary                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Person       | Explicit working preferences owned by one person                                          | Opt-in, owner-only, never promoted in or out                                                       |
| Project      | Decisions, approaches, risks, adaptations and anti-patterns learned during one engagement | Default capture scope; visible only through the project's access scope                             |
| Client       | Reusable client precedent across projects                                                 | Represented in the model, but propagation is disabled until client-membership rules are formalised |
| Domain       | Reviewed abstractions useful to a governed sector or capability                           | May receive a new abstraction; never receives raw restricted evidence                              |
| Organisation | Firm-reusable reviewed precedent                                                          | Retrieved into work, not copied down into projects                                                 |

Every project scope has a client parent. Domain and organisation scopes do not imply access to the project or client evidence from which an abstraction originated.

## Memory object

Every organisational memory is also a canonical `Resource`, so one identity is used for security, retrieval, citation and relationships. Its durable record includes:

- a typed statement: decision, approach pattern, risk response, constraint adaptation, anti-pattern, stakeholder pattern or person preference;
- separate origin and visibility scopes;
- transfer and sensitivity classifications;
- evidence links and memory-to-memory relations such as corroborates, contradicts, qualifies and supersedes;
- candidate/active/superseded/retired/rejected lifecycle and proposed/approved/rejected/correction-required review state;
- untested/supported/validated/mixed/invalidated outcome state;
- confidence, quality, validity, freshness and processing-policy provenance.

Only approved memories can become active. Candidate or audit access is a distinct review purpose; inactive memory cannot silently influence ordinary project work.

## Capture contract

Initial capture is deliberately conservative:

- the signal must be material;
- it must cite at least one evidence item and meet the configured confidence threshold;
- it is created as a candidate in the same scope in which it was observed;
- capture cannot also promote it;
- person memory is limited to an explicit owner contribution describing a person preference.

The implementation does not yet decide how a conversation contributes to shared project memory. That requires an explicit product choice about user intent, contribution controls and attribution in Milestone 18.

## Promotion matrix

"Promotion" always means creating a separately reviewed memory with a new Resource identity. It never means widening the source row's access scope.

| From            | To                     | Version 1 decision      | Requirement                                                                                                       |
| --------------- | ---------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Any scope       | Same scope             | Enrich, do not promote  | Add evidence, relation or outcome to the existing scoped memory                                                   |
| Person          | Any other scope        | Deny                    | Private memory cannot become shared memory implicitly                                                             |
| Any other scope | Person                 | Deny                    | Shared knowledge cannot be copied into private memory                                                             |
| Project         | Project                | Deny                    | Retrieve permitted precedent; never copy one project's memory into another                                        |
| Project         | Client                 | Disabled                | Await a formal client-membership model                                                                            |
| Project         | Domain or organisation | Allow a new abstraction | Approved, abstraction-reviewed, classified abstractable/firm-reusable, non-confidential, no raw evidence attached |
| Client          | Domain or organisation | Allow a new abstraction | Same reviewed-abstraction requirements; client layer itself remains disabled for propagation in v1                |
| Domain          | Organisation           | Allow a new abstraction | Must additionally be classified firm-reusable                                                                     |
| Organisation    | Lower scope            | Deny                    | Organisation memory is retrieved, not duplicated downward                                                         |

`client-confidential` substance never crosses its client boundary. A source classified merely `client-reusable` is not eligible for cross-client abstraction.

## Evidence and non-inference

A promoted abstraction may be visible to someone who cannot read its source project. That user can see the abstraction as an organisation or domain Resource, but cannot see:

- the source memory;
- restricted evidence or assertions;
- the promotion-lineage record; or
- metadata revealing that inaccessible source material exists.

Row-level policies require visibility to both sides before returning evidence, relations or promotion lineage. Database triggers additionally ensure that declared evidence scopes match the evidence Resource and that promotion lineage matches the source and destination memories.

## Compounding and correction

Compounding is evidence accumulation, not model-weight drift. Repeated work can:

1. corroborate an existing memory;
2. attach a measured outcome;
3. qualify it with context or time;
4. contradict it and make the conflict visible;
5. supersede or retire it through an attributable lifecycle event; or
6. create a separately reviewed abstraction for broader reuse.

Stale memory can be retrieved only with its time warning. Contradictory memories remain distinct and related rather than being silently merged into one confident statement.

## Enforced today

- Forced RLS on scopes, memories, evidence, relations and promotion lineage.
- Owner-only person scopes, including protection against later ACL broadening.
- Canonical Resource access must equal the memory visibility scope.
- Workspace consistency across every memory, evidence, relation and promotion record.
- Reviewed-abstraction and no-raw-evidence rules for cross-boundary propagation.
- Fail-closed behavior when actor/workspace transaction context is absent.
- A synthetic cross-project isolation test covering private, project and organisation memory plus hidden evidence and lineage.

## Deliberately not built yet

- adapters from the existing product's real project, membership, conversation and file models;
- capture/debrief UX and candidate-generation workers;
- reviewer queues, correction controls and promotion service APIs;
- proactive kickoff packs and in-workflow precedent delivery;
- a validated client-wide membership model;
- live connectors, production deployment or proof of user demand.

Before the client layer is enabled, the host product must supply an authoritative answer to: “Which people may know that these projects belong to the same client, and which people may reuse each class of client knowledge?”
