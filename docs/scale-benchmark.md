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

The command recreates only the isolated benchmark workspace. It does not call an embedding or chat provider.

## Current measured baseline

The current 10,000-record local run loaded 12,407 versions and 10,646 current search chunks in approximately 6.2 seconds. Across 75 permission-scoped lexical questions at a limit of 20 it measured:

- precision@20: `1.0`;
- recall@20: `0.6112`;
- mean reciprocal rank: `1.0`;
- forbidden evidence returned: `0`;
- active deleted records: `0`;
- stale-version search records: `0`;
- p50 query latency: approximately `3.2 ms`;
- p95 query latency: approximately `3.9 ms`;
- maximum query latency: approximately `7.6 ms`.

These are development-machine observations, not production guarantees. Recall is bounded by the top-20 limit because each project intentionally has more than 20 relevant visible records.

The initial unchunked p95 was approximately 436 ms. Materialising the effective retrieval scope reduced it to approximately 203 ms. Adding chunks then exposed the same security-barrier scan more sharply and initially regressed p95 to approximately 1,421 ms. Migration `0009_permissioned_lexical_search.sql` moves the narrow candidate selection behind a fail-closed function that checks actor, workspace, document scope and parent Resource scope before returning only IDs and scores. This lets PostgreSQL use the GIN text index while later reads remain protected by forced RLS. The benchmark explicitly refreshes planner statistics after its bulk load so the result does not depend on autovacuum timing.

## What this does and does not establish

This baseline establishes deterministic ingestion, version integrity, ambiguity preservation, deletion handling, long-document chunking, evidence-level result deduplication, actor-scoped lexical relevance and a zero-leakage result for the current question set. It does not yet establish semantic retrieval quality, incremental update throughput, deep graph performance or production-scale latency.

Next work: incremental ingestion measurements, a representative provider-embedding sample, larger scale tiers, and exact-pgvector measurements before considering specialist vector or graph infrastructure.
