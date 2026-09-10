# Blind human-authored retrieval evaluation

The deterministic benchmark proves repeatability, but its questions were written in code and cannot represent the full variety of language used inside an organisation. This workflow collects a separate question set without exposing scorer answer sets to the author.

## Authoring protocol

Generate the local authoring packet:

```bash
npm run benchmark:questions
```

This creates `.benchmark/human-question-authoring.json` with 25 entries. Each entry contains:

- an opaque project key;
- a client context;
- a plain-language scenario;
- canonical terms that must not appear in the question;
- an empty `question` field.

The packet deliberately excludes source records, canonical project labels, expected evidence IDs, forbidden evidence IDs and retrieval results. The `.benchmark` directory is Git-ignored so unfinished questions and author details are not accidentally published.

Give the file to a person who has not inspected the benchmark corpus or scorer answer sets. They should write one natural question per scenario, complete the `authorship` fields and set `independentlyAuthored` to `true` only when that statement is accurate. Implicit references, colloquial phrasing and organisation-specific vocabulary are useful; canonical terms listed in `avoidTerms` are prohibited.

Validate the completed file locally:

```bash
npm run benchmark:questions -- --validate .benchmark/human-question-authoring.json
```

Validation fails closed on the wrong corpus seed, incomplete authorship, missing or duplicate projects, duplicate questions, invalid lengths and prohibited canonical terms. After validation, the scorer derives actor-specific expected and forbidden evidence sets internally. Those answer sets are never added to the authoring packet.

## Semantic evaluation

A completed packet can be added to a future semantic comparison with:

```bash
npm run benchmark:semantic -- \
  --confirm-synthetic-egress \
  --human-questions .benchmark/human-question-authoring.json
```

Do not run this command without fresh, explicit approval for that transfer. The existing 2,000-input ceiling still applies: human queries reduce the number of document chunks selected so the cap cannot be exceeded. Results are reported as a separate `human-authored` cohort.

For a publishable evaluation, preserve the completed packet and raw result as immutable evaluation artefacts after the run, remove personal author information if requested, and record the model, corpus seed, input counts and date. Once published, the questions are no longer blind for subsequent model tuning and should be replaced with a new held-out set.
