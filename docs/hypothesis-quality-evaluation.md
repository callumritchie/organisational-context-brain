# Hypothesis quality evaluation

Milestone 11 separates three different claims that must not be conflated:

1. **Safety and contract correctness:** candidates are grounded in supplied evidence, negative controls do not create candidates, and no external data is sent.
2. **Prepared-vocabulary performance:** the deterministic rules detect concepts represented by their configured vocabulary.
3. **Independent human quality:** people who did not build the system judge whether outputs are genuinely grounded, novel, useful, falsifiable, contradiction-aware and actionable.

Only the first two can be measured by the repository alone. The third remains pending until independently authored cases and at least two blind reviewer files are supplied.

## Generated baseline

Run:

```bash
npm run benchmark:hypothesis-quality
```

The command creates 100 deterministic cases: 60 ordinary positive cases, 20 contradiction-rich positive cases and 20 negative controls. The current baseline is:

| Measure | Result |
| --- | ---: |
| Expected candidates detected | 80/80 |
| Negative controls rejected | 20/20 |
| Grounded candidates | 80/80 |
| Expected primary concepts | 80/80 |
| Contradictions surfaced in the candidate | 0/20 |
| External tokens and cost | 0 |

The 0/20 contradiction result is an intentional, visible baseline failure. The current deterministic matcher notices recurring configured concepts but does not yet interpret evidence that disputes the causal explanation. Milestone 12 or 13 must improve this; it is not hidden by the otherwise perfect prepared-vocabulary scores.

## Independent case authoring

The command writes `.benchmark/hypothesis-quality-independent-cases.json`. Give this file to someone who has not inspected the implementation or generated cases. They must:

- write at least 20 natural cases spanning research, meetings, CRM, documents and messages;
- include ordinary, ambiguous or contradictory, and no-material-pattern cases;
- avoid explicit `SUPPORTS`, `CONTRADICTS` or `hypothesis` labels;
- adjudicate the expected behaviour and applicable governed concept IDs;
- complete the authorship attestation.

Validate and run those cases with:

```bash
npm run benchmark:hypothesis-quality -- \
  --independent-cases .benchmark/completed-independent-cases.json
```

Invalid authorship, duplicated cases, missing source types, unknown concepts, short records and stance-labelled text fail closed.

## Blind review

The evaluation writes `.benchmark/hypothesis-quality-blind-review.json`. It contains source records and system output, but removes expected behaviours and concept labels. It also writes a reviewer score template.

At least two different reviewers independently score candidate outputs from 1–5 for:

- grounding;
- novelty;
- usefulness;
- falsifiability;
- contradiction handling;
- actionability.

When no candidate exists, quality fields stay `null`; the reviewer records only whether a material pattern was missed. Reviewers also flag unsupported candidates. Completed files are aggregated with:

```bash
npm run benchmark:hypothesis-quality -- \
  --independent-cases .benchmark/completed-independent-cases.json \
  --scores .benchmark/reviewer-a.json,.benchmark/reviewer-b.json
```

The provisional quality gate—fixed before scoring—requires mean grounding ≥4, usefulness ≥3.5, falsifiability ≥4, contradiction handling ≥3.5, unsupported candidates ≤5%, missed material patterns ≤10%, confidence calibration MAE ≤0.2, and at least 75% of reviewer scores within one point. These thresholds are an initial product decision and should be revised only prospectively, never to make a completed run pass.

## External-data boundary

This evaluation calls no model or embedding provider. A full 10,000-document vector benchmark would exceed the previously approved 2,000-input synthetic egress ceiling and therefore remains disabled pending separate explicit approval.
