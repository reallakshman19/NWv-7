# NW-RANK-011J — Complete Top Stories evaluator trace

## Status

Implemented on an isolated branch for Version 0.3 review.

## Governing objective

Record every material gate already executed by the authoritative Top Stories evaluator without changing ranking policy, selected order, visible depth, source inputs, persistence, deployment, or UI behavior.

## Trace schema

Each scored candidate now carries a trace row using:

- schema: `nw-top-stories-candidate-trace/v2`
- snapshot root field: `candidateTraceSchemaVersion`

The ordered stage chain is:

1. `timestamp_validation`
2. `age_window`
3. `event_classification`
4. `qualification_evidence`
5. `threshold`
6. `fallback_corroboration`
7. `admission`
8. `selection`
9. `display`

Every stage records a deterministic status, reason-code array, and the evidence needed to interpret that stage where applicable.

## Compatibility contract

The existing terminal population contract is preserved:

- `REJECTED_BY_ADMISSION`
- `ELIGIBLE_NOT_SELECTED`
- `RANKED_NOT_DISPLAYED`
- `DISPLAYED`

The existing `finalStage` and `finalReasonCode` fields remain compatible with downstream analytics. Admission failures still expose `finalStage = admission`.

Two additive fields identify the actual stopping gate:

- `terminalStage`
- `terminalReasonCode`

This distinction allows an admission rejection to be attributed precisely to timestamp validation, age, qualification evidence, score threshold, or fallback corroboration without changing existing disposition aggregation.

## Rank metadata

`_topStoryRank` now exposes two values that were already computed internally:

- `ageBand`
- `admissionThreshold`

No threshold value or age-window rule was changed.

## Certified scenarios

The evaluator certification covers:

- low-confidence timestamp rejection
- outside-fallback-window rejection
- unqualified event without independent evidence
- below-band-threshold rejection
- fallback aggregator without corroboration
- complete passing path through display
- selected-output deep equivalence
- stable output under source permutation
- frozen-clock execution
- immutable input handling

The snapshot-runner certification confirms that:

- the root candidate-trace schema is published
- every trace row carries the same schema version
- all nine stages survive evidence sanitization
- terminal gate fields survive artifact generation
- byte-stable snapshot and manifest behavior remains required

## Explicit exclusions

This change does not:

- alter ranking weights, thresholds, limits, age windows, event rules, or diversity policy
- alter source acquisition, normalization, repository replay, or source-health rules
- add persistence, hysteresis, residence, or cross-run state
- alter Main-page projection, custom ordering, or visible depth
- change deployment or generated news data
- add the `EDITORIAL_IDENTITY` funnel population

`EDITORIAL_IDENTITY` remains the next isolated Version 0.3 amendment so population-unit accounting is not mixed with the evaluator trace contract.
