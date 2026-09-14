# Hypothesis discovery benchmark

## What this milestone tests

Milestone 9 introduces an intentionally unfamiliar supplier-onboarding scenario. Five synthetic connector records contain operational language, inconsistent labels and repeated patterns, but contain no hypothesis and no `SUPPORTS` or `CONTRADICTS` labels. A governed concept policy scans the already permission-filtered canonical content and may form an untrusted hypothesis candidate only when the same concept appears across at least three source systems.

The prepared demo candidate is separate from trusted organisational memory. It retains the contributing resource IDs and source URIs, makes explicit predictions, states what would refute it, and records the model-routing decision. A Project Lead may dismiss it or accept it. Acceptance creates a canonical Hypothesis Resource with its evidence references and starts a normal continual monitor; it does not modify model weights.

## Automated contract result

Run:

```bash
npm run benchmark:discovery
```

The local suite creates 50 deterministic unfamiliar workflows, each with noisy records across research, meetings, CRM, documents and messages. Current result:

| Check                                          | Result |
| ---------------------------------------------- | -----: |
| Cases evaluated                                |     50 |
| Candidates formed                              |  50/50 |
| Expected primary governed concept              |  50/50 |
| Evidence IDs grounded in supplied records      |  50/50 |
| Three-or-more source systems                   |  50/50 |
| Prediction and falsification condition present |  50/50 |
| External tokens                                |      0 |
| External cost                                  |      0 |

The command writes `.benchmark/hypothesis-discovery-review.json`. That ignored file contains the source records, generated candidate and blank 1–5 fields for grounding, novelty, usefulness, falsifiability and contradiction handling.

## What the result does not prove

The test proves deterministic policy conformance on generated vocabulary. It does not prove that the candidate is novel, causally correct, useful to a product team or robust to natural organisational language. The human rubric is deliberately unscored. It also does not evaluate model-assisted concept induction, free-form ontology extension or independent expert labels.

Milestone 11 now provides the stricter independent-authoring and multi-reviewer protocol in [the hypothesis quality evaluation](./hypothesis-quality-evaluation.md). No source text should be sent to a provider without explicit approval and a recorded route/budget policy.
