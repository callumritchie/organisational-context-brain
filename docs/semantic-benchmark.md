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

This run does not justify making semantic retrieval dominant or adding a specialist vector database. The benchmark questions contain exact client and project names, so lexical search is exceptionally well matched to them. Semantic candidates added false positives without improving top-20 recall, and exact vector search added roughly 72 ms at p95.

PostgreSQL remains the appropriate datastore for the measured slice. Genuine embeddings stay supported, but hybrid ranking remains experimental rather than empirically optimised.

A fixed, manually specified vocabulary-mismatch cohort is now implemented alongside the original questions. Its local lexical baseline is intentionally poor: precision, recall and MRR are all zero across 75 actor-scoped questions, with zero permission leakage. This cohort has not yet been sent to an embedding provider, so there is no semantic or hybrid result for it yet. It is deterministic and reviewable, but it is not a blind, independently authored human evaluation.

The next authorised semantic run will reserve 50 unique query inputs and select at most 1,950 document chunks, retaining the 2,000-input cap. It will report exact-name and vocabulary-mismatch metrics separately. A later evaluation should add blind human-authored questions, implicit references and real-world terminology distributions. A full 10,000-chunk vector latency run is also still required before deciding whether approximate pgvector indexing is warranted. Results from the existing 1,975-vector sample must not be extrapolated as a production guarantee.

## Running it

The command deliberately requires an egress confirmation flag:

```bash
npm run benchmark:semantic -- --confirm-synthetic-egress
```

Run it only after reviewing the synthetic corpus and authorising that specific transfer to the configured embedding provider. A previous run's approval should not be reused. It rebuilds only the isolated benchmark workspace; the Northstar Labs demo workspace is separate.
