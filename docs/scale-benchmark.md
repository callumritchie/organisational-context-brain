# Scale benchmark

Milestone 7 tests the architecture against deterministic messy organisational data whose correct identities, current versions and permission boundaries are known before ingestion. It runs in a separate `Scale Benchmark` workspace and does not change the interactive Northstar Labs demo.

## Current corpus

The default seed produces:

- 10,000 logical source objects and 12,407 immutable versions;
- 50 clients and 200 projects across research, meetings, CRM, documents and messages;
- 1,880 multi-version records, 82 changed stances, 909 duplicates and 244 deletions;
- 271 ambiguous source aliases represented by 542 unresolved identity candidates;
- 323 long documents split into 10,646 overlapping, offset-addressable search chunks;
- four access scopes and 150 actor-specific questions containing 3,050 forbidden-evidence checks: 75 exact-name questions and 75 fixed vocabulary-mismatch questions.

Run it locally after migrations:

```bash
npm run benchmark:run
```

The command recreates only the isolated benchmark workspace, performs an initial load, then applies a deterministic 500-record incremental batch containing 450 revisions and 50 deletions. It does not call an embedding or chat provider. `--updates` and `--deletion-every` configure the incremental batch.

## Current measured baseline

The current 10,000-record local run loaded 12,407 versions and 10,646 search chunks in approximately 5.9 seconds. It then applied 500 changes in approximately 623 ms, or 802 records/second:

- 450 new immutable source/content versions and 474 replacement chunks;
- 50 source tombstones;
- replaying the identical batch adds no duplicate versions, assertions, provenance or chunks;
- 12,857 immutable versions after the update;
- 10,328 active and 792 inactive chunks;
- active chunks attached to deleted Resources: `0`;
- active chunks attached to superseded content versions: `0`;
- invalid current-version pointers: `0`.

Across the 75 permission-scoped exact-name questions after the update, at a limit of 20, it measured:

- precision@20: `1.0`;
- recall@20: `0.6147`;
- mean reciprocal rank: `1.0`;
- forbidden evidence returned: `0`;
- active deleted records: `0`;
- stale-version search records: `0`;
- p50 query latency: approximately `2.22 ms`;
- p95 query latency: approximately `2.73 ms`;
- maximum query latency: approximately `5.97 ms`.

Across the paired 75 vocabulary-mismatch questions, lexical precision, recall and mean reciprocal rank were all `0`, with `0` forbidden records returned. The questions keep the client reference but replace canonical project terms—for example, account opening instead of onboarding—and lexical search receives the actual question rather than a hidden canonical project name. This deliberately difficult cohort now provides a fair test of whether semantic or hybrid retrieval adds value. Its provider-embedding comparison has not yet been run.

These are development-machine observations, not production guarantees. Recall is bounded by the top-20 limit because each project intentionally has more than 20 relevant visible records.

The initial unchunked p95 was approximately 436 ms. Materialising the effective retrieval scope reduced it to approximately 203 ms. Adding chunks then exposed the same security-barrier scan more sharply and initially regressed p95 to approximately 1,421 ms. Migration `0009_permissioned_lexical_search.sql` moves the narrow candidate selection behind a fail-closed function that checks actor, workspace, document scope and parent Resource scope before returning only IDs and scores. This lets PostgreSQL use the GIN text index while later reads remain protected by forced RLS. The benchmark vacuums the repeatedly rebuilt search index and refreshes planner statistics before measurement so results do not depend on autovacuum timing or dead index entries from an earlier local run.

## What this does and does not establish

This baseline establishes deterministic ingestion, version integrity, ambiguity preservation, deletion handling, long-document chunking, evidence-level result deduplication, replay-safe incremental update behavior, local update throughput, actor-scoped lexical relevance and a zero-leakage result for both query cohorts. It also establishes that exact-name lexical results must not be treated as evidence of robust retrieval under vocabulary mismatch. It does not yet establish semantic retrieval quality on the new cohort, deep graph performance or production-scale latency.

Next work: an explicitly authorised provider-embedding comparison on both cohorts, larger scale tiers, and exact-pgvector measurements before considering specialist vector or graph infrastructure.
