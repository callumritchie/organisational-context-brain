# Hypothesis monitor benchmark

Run `npm run benchmark:hypotheses` to evaluate the deterministic control-plane contract over the generated 10,000-record corpus. The command is local, makes no provider calls and does not modify the demo database.

The current fixed-seed result covers five source-system shapes and 200 projects. It evaluates 12,407 immutable versions, detects all 82 expected stance changes, suppresses 909 known duplicates, produces 10,000 unique event keys, observes zero forbidden-evidence routing and selects `no-model` with zero external tokens and zero estimated cost.

This is a contract benchmark, not a claim that generated hypotheses are intelligent. It tests whether known evidence changes would route, remain permission-safe, update a hypothesis state and respect the model budget. Measuring open-ended hypothesis novelty, usefulness and falsifiability requires independently authored raw inputs and human judgments; that work remains.
