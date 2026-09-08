# Scale benchmark

Milestone 7 tests the architecture against deterministic messy organisational data whose correct identities, current versions and permission boundaries are known before ingestion. It runs in a separate `Scale Benchmark` workspace and does not change the interactive Northstar Labs demo.

## Current corpus

The default seed produces:

- 10,000 logical source objects and 12,407 immutable versions;
- 50 clients and 200 projects across research, meetings, CRM, documents and messages;
- 1,880 multi-version records, 82 changed stances, 909 duplicates and 244 deletions;
- 271 ambiguous source aliases represented by 542 unresolved identity candidates;
- four access scopes and 75 actor-specific questions containing 1,525 forbidden-evidence checks.

Run it locally after migrations:

```bash
npm run benchmark:run
```

The command recreates only the isolated benchmark workspace. It does not call an embedding or chat provider.

## First measured baseline

The first 10,000-record local run loaded 12,407 versions in approximately 5.3 seconds. Across 75 permission-scoped lexical questions at a limit of 20 it measured:

- precision@20: `1.0`;
- recall@20: `0.6112`;
- mean reciprocal rank: `1.0`;
- forbidden evidence returned: `0`;
- active deleted records: `0`;
- stale-version search records: `0`;
- p50 query latency: approximately `190 ms`;
- p95 query latency: approximately `203 ms`.

These are development-machine observations, not production guarantees. Recall is bounded by the top-20 limit because each project intentionally has more than 20 relevant visible records.

The initial p95 was approximately 436 ms. Query-plan analysis showed that RLS was repeatedly traversing assertion permissions across almost the whole search table. Migration `0007_search_document_scope.sql` materialises the effective retrieval scope on each search document, reducing p95 by roughly half while retaining forced RLS and zero observed leakage. The remaining sequential security scan is now an explicit optimisation target; specialist vector infrastructure would not by itself solve it.

## What this does and does not establish

This baseline establishes deterministic ingestion, version integrity, ambiguity preservation, deletion handling, actor-scoped lexical relevance and a zero-leakage result for the current question set. It does not yet establish semantic retrieval quality, long-document chunking, update throughput, deep graph performance or production-scale latency.

Next work: incremental ingestion and chunking, a representative provider-embedding sample, larger scale tiers, and an access-path optimisation backed by the same leakage suite.
