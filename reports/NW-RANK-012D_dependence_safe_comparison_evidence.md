# NW-RANK-012D — Dependence-safe canonical comparison evidence

## Mission boundary

Mission NW-RANK-012D publishes deterministic comparison-level evidence for the existing Top Stories shadow replay. It does not introduce a second pairing, period-classification, metric, ranking, selection, threshold, date, recommendation, workflow, browser, deployment, or generated-data path.

Governing authorities:

- Issue #462.
- Owner Amendment 1, issue comment 5021905656.
- Owner Amendment 2, issue comment 5022428968.

The root daily and pilot schemas remain unchanged:

```text
nw-top-stories-daily-stability-report/v1
nw-top-stories-seven-day-pilot-decision/v1
```

The additive comparison schema is:

```text
nw-top-stories-comparison-evidence/v1
```

## Canonical selector correction

The sole selector remains `buildCanonicalNonOverlappingPairs()` in `topStoriesObservationPairing.js`.

It preserves the existing deterministic sorted-greedy order:

```text
anchorAt ascending
currentAt ascending
```

A pair is retained only when:

1. `anchorAt` does not violate the existing occupied interval boundary.
2. Neither `anchorId` nor `currentId` has appeared in a previously retained pair for that horizon.

Thus:

```text
A → B
B → C
C → D
```

becomes:

```text
retain A → B
reject B → C
retain C → D
```

The 15-minute and 60-minute selectors execute independently. Cross-horizon observation reuse remains permitted and is explicitly marked unpooled.

## Comparison identity

Each comparison ID is the SHA-256 digest of the canonical JSON form of exactly:

```text
studyId
horizon
segmentKey
anchorObservationId
currentObservationId
targetHorizonMs
```

The identity excludes:

```text
array position
artifact metadata
generation time
metric values
period class
input class
rank
title
workflow metadata
randomness
```

The same shared identity function is used by generation, validation and certification fixtures.

## Record construction

`comparisonEvidence.mjs` joins the already-computed replay authorities one-to-one:

```text
replay.pairSets.<horizon>.pairs
replay.pairSets.<horizon>.canonicalPairs
replay.pairComparisons.<horizon>
```

It does not rerun pairing, canonical selection, period classification or metric calculation.

Each record publishes:

```text
comparisonId
horizon
anchorObservationId
currentObservationId
anchorScheduledAt
currentScheduledAt
anchorAt
currentAt
ownerDate
intervalMs
targetHorizonMs
intervalErrorMs
segmentKey
periodClass
inputClass
eligibleForHeadlineKpi
comparisonEligibilityReasons[]
metrics
```

Metric null semantics are copied from the existing comparison output.

## Daily ownership

Daily ownership is derived only from the UTC date of `anchorScheduledAt`.

A cross-midnight pair such as:

```text
anchor:  2026-07-17T23:52:00Z
current: 2026-07-18T00:07:00Z
```

appears only in the 2026-07-17 report.

## Explicit accounting

The daily evidence publishes sorted `comparisonRecords[]` and sorted `canonicalComparisonIds[]`.

```text
comparisonRecords.length
= overlapping15mCount + overlapping60mCount

canonicalComparisonIds.length
= canonical15mCount + canonical60mCount

accountingDelta = 0
accountingConserved = true
```

All counts are derived from explicit rows and references. No subtraction-based independent-sample estimate is used.

## Canonical proof

Validation proves per horizon:

- every canonical ID resolves to an existing same-horizon comparison record;
- canonical records are a subset of overlapping records;
- IDs and anchor/current pairs are unique;
- intervals do not overlap;
- anchor/current observation IDs are not reused;
- records remain within one compatible segment;
- 15-minute and 60-minute domains remain separate.

Pilot validation repeats these checks globally across all represented dates and rejects cross-day duplicates, overlaps, observation reuse, owner-date drift and segment incompatibility.

## Shared summary authority

The daily report derives these fields directly from the evidence records through shared pure functions:

```text
coverage.valid15mPairs
coverage.valid60mPairs
coverage.canonical15mPairs
coverage.canonical60mPairs
stability.<horizon>.overlapping
stability.<horizon>.canonicalNonOverlapping
inputChange.<horizon>.overlapping
inputChange.<horizon>.canonicalNonOverlapping
segmentSummaries[].eligibleComparisonCounts
```

The shared functions preserve:

- existing linear quantile interpolation;
- existing finite-value filtering and null semantics;
- existing incumbent-retention threshold fractions;
- existing consecutive calm low-retention calculation;
- existing period and input classes.

The validator recomputes these fields from records and fails on any divergence.

## Operational behavior

An observed daily report fails closed for:

```text
comparison_evidence_missing
comparison_evidence_schema_unsupported
comparison_evidence_invalid
comparison_evidence_summary_mismatch
comparison_identity_duplicate
comparison_owner_date_mismatch
canonical_comparison_reference_unknown
canonical_comparison_overlap
canonical_observation_reuse
canonical_segment_incompatible
```

Existing operational thresholds and editorial independence remain unchanged.

## Pilot behavior

Historical daily artifacts without v1 evidence remain readable and inventory-visible as:

```text
MISSING_LEGACY
```

Present valid evidence is `VALID`; present corrupt or unsupported evidence is `INVALID`.

Any represented observed day with missing or invalid evidence becomes a technical failure for a new pilot decision.

Before decision metrics, the pilot validates all canonical records globally by horizon. Stability and input-change comparison counts and daily medians are recomputed from validated canonical records. Overlapping records remain descriptive and cannot satisfy readiness thresholds or directly trigger a recommendation.

The pilot publishes only a deterministic summary, not duplicate daily rows:

```text
decisionEvidence: {
  schemaVersion,
  fifteenMinute: {
    comparisonCount,
    usableDayCount,
    comparisonIdsDigest
  },
  sixtyMinute: {
    comparisonCount,
    usableDayCount,
    comparisonIdsDigest
  },
  crossHorizonPooled: false,
  accountingConserved: true
}
```

## Current pilot validity impact

Previously generated historical daily reports do not contain the additive comparison evidence. They remain inventory-visible, but a new seven-day decision over those artifacts is technically ineligible until valid newly generated evidence exists. This mission does not backfill, extend, restart or substitute the pilot window.

## Compatibility

Unchanged behavior includes:

```text
overlapping pair population
pair windows and interval tolerances
anchor/current candidate selection
normalization and version eligibility
period classification
comparison metric formulas
ranking and selection
quantile interpolation
null semantics
daily median weighting
thresholds and dates
recommendation rules
authorization flags
```

Canonical counts may decrease only because Owner Amendment 1 intentionally eliminates same-horizon observation reuse.

## Scope verdict

The implementation is confined to the consolidated Issue #462 and Owner Amendment 2 allowlist. No workflow, package, UI, browser, deployment, public or generated-data file is modified. The following roadmap mission is not started.

## Known limitations

- No historical artifact is rewritten or backfilled.
- Canonical comparisons remain a deterministic greedy subset, not a new estimator or effective-sample-size model.
- The two horizons are valid separate evidence domains, not one pooled independent sample.
- This mission does not establish G3 browser-visible production equivalence or authorize production changes.
