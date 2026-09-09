# Semantic retrieval benchmark

This Milestone 7 benchmark measures genuine OpenAI embeddings and exact pgvector retrieval on a permission-scoped sample of the deterministic synthetic corpus. It sends no real organisational data.

## Method

The 8 September 2026 run used `text-embedding-3-small` at 1,536 dimensions. The capped sample contained exactly 2,000 external inputs:

- 1,975 document chunks, including all 1,290 chunks needed for the 25 evaluated projects;
- 685 stratified distractor chunks;
- 25 unique synthetic query strings;
- 459 chunks from long documents;
- approximately even representation across five source systems and four visibility scopes.

The indexer used 32-input requests, comfortably below the API limits documented by [OpenAI's embeddings reference](https://developers.openai.com/api/reference/ruby/resources/embeddings/methods/create). The run reported 227,377 input tokens across 63 requests. At the then-current published `text-embedding-3-small` price of $0.02 per million input tokens, the estimated embedding cost was approximately $0.00455. See the [official model page](https://developers.openai.com/api/docs/models/text-embedding-3-small) for current pricing.

The stored vector columns occupied 12,142,300 bytes for 1,975 embeddings. This is measured column storage, not total table/index/database size.

## Results

Across 75 actor-scoped questions at a limit of 20:

| Mode | Precision@20 | Recall@20 | MRR | Leakage | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Lexical | 1.0000 | 0.6147 | 1.0000 | 0 | 1.65 ms | 2.17 ms |
| Semantic | 0.8647 | 0.6109 | 1.0000 | 0 | 65.90 ms | 74.33 ms |
| Hybrid RRF | 0.8700 | 0.6147 | 1.0000 | 0 | 67.71 ms | 76.11 ms |

Indexing 1,975 chunks took approximately 31.9 seconds. Embedding the 25 query strings in one request took approximately 269 ms. Exact vector retrieval used no approximate vector index.

## Decision

The first run did not justify making semantic retrieval dominant or adding a specialist vector database. The benchmark questions contained exact client and project names, so lexical search was exceptionally well matched to them. Semantic candidates added false positives without improving top-20 recall, and exact vector search added roughly 72 ms at p95.

## Vocabulary-mismatch follow-up

On 9 September 2026, a second explicitly authorised run evaluated the original 75 questions alongside 75 fixed, manually specified vocabulary-mismatch questions. It used exactly 2,000 external inputs:

- 1,950 document chunks, including all 1,290 chunks required by the evaluated projects and 660 stratified distractors;
- 50 unique synthetic query strings;
- 223,891 input tokens across 62 requests;
- 1,950 stored 1,536-dimension vectors occupying 11,988,600 bytes at the column level.

At the published price used by the benchmark, the estimated embedding cost was approximately $0.00448. Indexing took approximately 34.1 seconds and embedding the 50 query strings took approximately 494 ms.

Across the exact-name cohort:

| Mode | Precision@20 | Recall@20 | MRR | Leakage | p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Lexical | 1.0000 | 0.6147 | 1.0000 | 0 | 2.12 ms |
| Semantic | 0.8640 | 0.6105 | 1.0000 | 0 | 63.92 ms |
| Hybrid RRF | 0.8700 | 0.6147 | 1.0000 | 0 | 65.95 ms |

Across the vocabulary-mismatch cohort:

| Mode | Precision@20 | Recall@20 | MRR | Leakage | p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Lexical | 0.0000 | 0.0000 | 0.0000 | 0 | 0.37 ms |
| Semantic | 0.5447 | 0.3848 | 0.8052 | 0 | 64.73 ms |
| Hybrid RRF | 0.5447 | 0.3848 | 0.8052 | 0 | 65.00 ms |

The follow-up establishes that semantic retrieval materially improves vocabulary-mismatched questions, while exact-name lexical retrieval remains more precise and much faster. Hybrid equals semantic on the mismatch cohort because the phrase-based lexical channel returns no candidates to fuse. The measured evidence therefore supports retaining permission-scoped PostgreSQL lexical and pgvector channels, then improving query routing or fusion rather than replacing lexical retrieval or introducing a specialist vector database.

The vocabulary-mismatch cohort is deterministic and reviewable, but it is not a blind, independently authored human evaluation. A later evaluation should add blind human-authored questions, implicit references and real-world terminology distributions. A full 10,000-chunk vector latency run is also still required before deciding whether approximate pgvector indexing is warranted. Results from these 1,950–1,975-vector samples must not be extrapolated as a production guarantee.

## Running it

The command deliberately requires an egress confirmation flag:

```bash
npm run benchmark:semantic -- --confirm-synthetic-egress
```

Run it only after reviewing the synthetic corpus and authorising that specific transfer to the configured embedding provider. A previous run's approval should not be reused. It rebuilds only the isolated benchmark workspace; the Northstar Labs demo workspace is separate.
