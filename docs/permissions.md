# Permission semantics

## Resources and assertions

A Resource has a base access scope controlling whether its identity and content are visible. Each assertion has its own access scope. Public knowledge about Atlas Bank remains public even when a confidential assertion also concerns Atlas Bank.

A relationship is visible when:

- both endpoint Resources are visible; and
- at least one assertion establishing the relationship is visible.

Restricted assertions are invisible, including their predicate, score, provenance, source URI and existence within normal application traces.

Ontology versions are workspace-scoped. In the local demo, only the allow-listed Project Lead may publish a validated relationship addition. Publication supersedes the prior current version inside one transaction, records the actor, and inserts a checksummed snapshot whose content is protected from later updates by a database trigger. Production mutation is disabled until the demo actor header is replaced by real authentication.

Source identity keys are visible only when their canonical Resource is visible, so a restricted entity cannot leak through alias or source-key resolution.

Signal observations and snapshots carry an access scope and Resource reference. Forced RLS requires both to be actor-visible before a signal can join retrieval. Graph-connectivity scoring queries the already-filtered relationships table, so inaccessible edges cannot contribute to a score or appear as a side channel.

Stored embeddings also carry both access scope and canonical Resource identity. Forced RLS filters the vector table before exact similarity ranking, so inaccessible vectors cannot become candidates or affect reciprocal ranks. Query text leaves the local machine only when an embedding provider and key are explicitly configured.

For a future derived content Resource synthesised from several inputs, its base scope will conservatively allow only actors who can read every input actually used. This rule applies to that derived Resource; it does not retroactively restrict the canonical entities it mentions.

## Actor transaction

Every permission-sensitive repository call must receive a `PoolClient` from `withActorTransaction`:

```text
BEGIN
SET LOCAL app.actor_id
SET LOCAL app.workspace_id
verify settings
query RLS-protected relations
COMMIT or ROLLBACK
```

Missing settings produce zero visible protected rows. A pooled connection cannot retain the actor after commit because the settings are transaction-local.

## Roles

- Database owner: migrations and destructive local fixture reset only.
- `org_brain_ingest`: non-owning `NOBYPASSRLS` role with workspace-scoped connector write policies.
- `org_brain_app`: non-owning `NOBYPASSRLS` role with narrowly granted reads and trace writes.

Protected tables use `FORCE ROW LEVEL SECURITY`. Connector transactions establish an internal actor and workspace before writing, so ingestion follows explicit policies rather than relying on ownership bypass.

The internal actor is a dedicated Sync Service user that is not included in the selectable demo-persona allow-list. It has explicit manage grants for all fixture scopes. Human personas therefore need only their real read grants: Alex-only, Jamie-only, shared internal, or workspace-wide.

The intended public API derives its actor from authentication. The current prototype uses an allow-listed `x-demo-actor` header solely as a clearly labelled synthetic persona mechanism and rejects `actorId` in request bodies. Allow-listing prevents arbitrary database IDs but does not authenticate the caller; anyone who can reach the route can impersonate any listed persona.

## Inspector

The ordinary Brain Inspector is produced from the already-scoped pipeline. It displays permitted counts and selected IDs only. A future privileged diagnostic mode must use a separate route, role and visual treatment.

`GET /api/v1/autocomplete?q=…` resolves its demo actor from the same header allow-list and executes within the same actor transaction. The permission matrix tests assert that private client/project names return no result for other personas.
