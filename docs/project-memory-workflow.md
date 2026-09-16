# Project-memory workflow

## Product purpose

This slice tests a concrete product loop: work already happening in a project becomes reviewable memory, and reviewed memory becomes useful context at the next project kickoff. Question answering can consume the same memory but is not required to create it.

```text
EXISTING PRODUCT                      CONTEXT BRAIN                     PRODUCT OUTPUT
project + files + conversations  →   candidate formation          →   kickoff precedent
authoritative memberships             evidence + provenance            actor-specific
explicit debriefs                     review + correction              approved only
```

The header's **Project memory** workspace presents this flow in one fixed viewport. Amber denotes host-product input, indigo denotes Context Brain processing, and green denotes a delivered output. Selecting a memory reveals its record and, for an authorised Project Lead, its review controls.

## Integration contract

`HostProductAdapter.readProject` returns:

- stable external project, canonical project and canonical client identifiers;
- an authoritative membership revision;
- active or removed members with lead, contributor, viewer or service roles.

The bundled `SyntheticHostProductAdapter` is a public fixture. It demonstrates the boundary but does not connect to the consultancy's proprietary product. A real adapter must map the existing product's projects, files, shared project conversations and membership changes without importing private user chats.

`host_project_bindings` ties that snapshot to the canonical project Resource, project memory scope and ordinary access scope. Project operations require an active imported membership as well as the relevant server-owned capability. The two checks are complementary: an identity token supplies neither project role nor workspace authority.

## Capture and formation

An explicit debrief stores a SourceObject, immutable SourceObjectVersion, `ProjectDebrief` Resource, ContentVersion, `BELONGS_TO` assertion and exact provenance span. Only then does it form a project-scoped candidate.

Background formation reads current, non-deleted project content through the same actor-scoped graph and access boundary. General rules recognise material decisions, approaches, risks, constraint adaptations and anti-patterns. Candidates retain exact evidence Resource IDs, formation rationale, confidence, a prediction and a falsification condition. They are not trusted memory until reviewed.

The default route is `no-model`. It sends zero content and zero tokens to an external provider. Model-assisted formation can be added behind the existing routing/budget gateway only after independent evaluation justifies the cost and data egress.

## Asynchronous operation

`project_memory_schedules` creates due work in `project_memory_jobs`. Workers claim with `SKIP LOCKED`, commit the lease before formation, recover expired leases, retry with bounded backoff and move exhausted jobs to dead-letter state. Scheduled and manual scans execute the same formation engine. The standard operations service drains this queue alongside monitor and discovery work.

Local commands:

```bash
npm run project-memory:bootstrap
npm run project-memory:schedule
npm run project-memory:worker
```

## Review, correction and kickoff

A Project Lead with `memory.review` may approve, reject or correct a candidate. Correction creates a new approved Memory Resource, copies its attributable evidence, marks the old memory superseded and retains a review record. History is not rewritten.

Kickoff generation includes only active, approved memories visible to the requesting member. Project precedent can be combined with already visible domain or organisation abstractions. The pack stores relevance and an inclusion rationale so delivery is inspectable.

Client-wide memory is represented but disabled twice: policy denies project-to-client promotion, and `host_project_bindings.client_memory_enabled` has a database constraint that permits only `false`. It must remain off until the host product can answer and enforce relationship-level client access, including joiner/mover/leaver behavior.

## Built versus not built

Built in this repository:

- the host adapter interface and synthetic reference adapter;
- durable project/membership binding and RLS controls;
- versioned debrief capture and provenance;
- general-purpose deterministic formation;
- leased schedules/jobs with retries and dead-letter state;
- approval, rejection, correction and supersession;
- actor-specific kickoff pack assembly;
- one connected, fixed-viewport product workspace.

Still external or unvalidated:

- the proprietary product adapter and actual in-product placement;
- private/shared conversation contribution controls for that product;
- relationship-level client membership and client-wide memory;
- external notification delivery;
- independent user evaluation of candidate quality and kickoff usefulness;
- a provisioned and independently reviewed production deployment.
