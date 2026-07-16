# NW-RANK-011A — Top Stories projection and evaluator trace

## Mission

Introduce the behavior-neutral observability foundation required before any
recurring Top Stories shadow study. This work does **not** alter ranking
weights, thresholds, event classification, age windows, diversity policy, or
the Main UI.

## Certified production path

The current Main path is:

1. `sectionsDataset.load()` loads enabled sections and normalizes section rows.
2. Section rows are deduplicated and clustered.
3. `rankTopStories()` produces `frontPage`, bounded by the ranker policy limit.
4. The Main dataset projects `frontPage` into `projectedNewsData.frontPage`.
5. Optional travel prioritization and custom read/view ordering can change the
   order supplied to the Main page.
6. `MainPage` passes `latestStories` directly to `NewsSection`.
7. `NewsSection` initially displays `news.slice(0, 10)` and retains the
   remaining ranked rows behind expansion.

Therefore the initial user-visible population is not always a raw
`rankTopStories(...).slice(0, 10)`. It is the first ten rows after the Main
ViewModel projection. The future shadow runner must record the settings and
projection mode or explicitly operate as a non-personalized repository replay.

## Added evaluator contract

`evaluateTopStories(input, options)` now returns:

```text
rawInputCount
candidates
scoredCandidates
admittedCandidates
selected
displayed
candidateBuildTrace
selectionTrace
policySnapshot
rankedCount
displayDepth
displayedCount
rankedIds
displayedTopNIds
nowMs
```

`rankTopStories(input, options)` delegates to
`evaluateTopStories(input, options).selected`.

The selected objects are produced by the same scoring, sorting, admission, and
diversity functions. Trace fields are generated after or alongside those
decisions and do not participate in ranking.

## Source-row build trace

Every input row terminates as one of:

```text
PROMOTED_TO_CANDIDATE
COLLAPSED_AS_DUPLICATE
INVALID_INPUT
```

This permits the conservation invariant:

```text
rawInputCount
= promoted rows
+ duplicate-collapsed rows
+ invalid rows
```

## Candidate selection trace

Every scored candidate terminates as exactly one of:

```text
REJECTED_BY_ADMISSION
ELIGIBLE_NOT_SELECTED
RANKED_NOT_DISPLAYED
DISPLAYED
```

Each candidate includes stage records for:

```text
admission
selection
display
```

Selection reason codes include:

```text
duplicate_identity
max_per_source
max_per_section
max_per_geo
max_per_cluster
outside_ranker_limit
outside_display_limit
```

Admission rejection preserves the authoritative
`_topStoryRank.admissionReason`.

## Ranked versus displayed population

The evaluator records these separately:

```text
rankedCount
displayDepth
displayedCount
rankedIds
displayedTopNIds
```

Default `displayDepth` is 10. Changing display depth cannot alter scoring,
ranking, or selected output.

## Clock contract

One `nowMs` value is resolved for the complete evaluation and passed through
candidate enrichment and scoring. Tests trap `Date.now()` when a frozen
`nowMs` is supplied.

## Equivalence and safety tests

The certification suite verifies:

- deep equality between `rankTopStories()` and
  `evaluateTopStories().selected`;
- ranked/displayed population separation;
- one terminal disposition per candidate;
- source-row conservation;
- admission, diversity, rank-limit, and display-limit reasons;
- frozen-clock operation;
- non-mutation of frozen inputs;
- stable output under source input permutation;
- current Main initial-display contract: `latestStories`, depth 10, and
  `NewsSection` slicing.

## Explicit non-goals

This work does not add:

- a scheduled workflow;
- artifact storage;
- cross-run aggregation;
- stability or residence metrics;
- identity resolution beyond the existing ranking identity;
- persistence or hysteresis;
- production ranking changes.

Those remain gated behind the subsequent NW-RANK-011 work packages.
