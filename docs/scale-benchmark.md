# Scale benchmark

Milestone 7 tests the architecture against deterministic messy organisational data whose correct identities, current versions and permission boundaries are known before ingestion. It runs in a separate `Scale Benchmark` workspace and does not change the interactive Northstar Labs demo.

## Current corpus

The default seed produces:

- 10,000 logical source objects and 12,407 immutable versions;
- 50 clients and 200 projects across research, meetings, CRM, documents and messages;
- 1,880 multi-version records, 82 changed stances, 909 duplicates and 244 deletions;
- 271 ambiguous source aliases represented by 542 unresolved identity candidates;
- 323 long documents split into 10,646 overlapping, offset-addressable search chunks;
- four access scopes and 75 actor-specific questions containing 1,525 forbidden-evidence checks.

Run it locally after migrations:

```bash
npm run benchmark:run
```

The command recreates only the isolated benchmark workspace, performs an initial load, then applies a deterministic 500-record incremental batch containing 450 revisions and 50 deletions. It does not call an embedding or chat provider. `--updates` and `--deletion-every` configure the incremental batch.

## Current measured baseline

The current 10,000-record local run loaded 12,407 versions and 10,646 search chunks in approximately 5.9 seconds. It then applied 500 changes in approximately 656 ms, or 762 records/second:

- 450 new immutable source/content versions and 474 replacement chunks;
- 50 source tombstones;
- replaying the identical batch adds no duplicate versions, assertions, provenance or chunks;
- 12,857 immutable versions after the update;
- 10,328 active and 792 inactive chunks;
- active chunks attached to deleted Resources: `0`;
- active chunks attached to superseded content versions: `0`;
- invalid current-version pointers: `0`.

Across 75 permission-scoped lexical questions after the update, at a limit of 20, it measured:

- precision@20: `1.0`;
- recall@20: `0.6147`;
- mean reciprocal rank: `1.0`;
- forbidden evidence returned: `0`;
- active deleted records: `0`;
- stale-version search records: `0`;
- p50 query latency: approximately `2.29 ms`;
- p95 query latency: approximately `3.59 ms`;
- maximum query latency: approximately `6.11 ms`.

These are development-machine observations, not production guarantees. Recall is bounded by the top-20 limit because each project intentionally has more than 20 relevant visible records.

The initial unchunked p95 was approximately 436 ms. Materialising the effective retrieval scope reduced it to approximately 203 ms. Adding chunks then exposed the same security-barrier scan more sharply and initially regressed p95 to approximately 1,421 ms. Migration `0009_permissioned_lexical_search.sql` moves the narrow candidate selection behind a fail-closed function that checks actor, workspace, document scope and parent Resource scope before returning only IDs and scores. This lets PostgreSQL use the GIN text index while later reads remain protected by forced RLS. The benchmark vacuums the repeatedly rebuilt search index and refreshes planner statistics before measurement so results do not depend on autovacuum timing or dead index entries from an earlier local run.

## What this does and does not establish

This baseline establishes deterministic ingestion, version integrity, ambiguity preservation, deletion handling, long-document chunking, evidence-level result deduplication, replay-safe incremental update behavior, local update throughput, actor-scoped lexical relevance and a zero-leakage result for the current question set. It does not yet establish semantic retrieval quality, deep graph performance or production-scale latency.

Next work: a representative provider-embedding sample, larger scale tiers, and exact-pgvector measurements before considering specialist vector or graph infrastructure.
