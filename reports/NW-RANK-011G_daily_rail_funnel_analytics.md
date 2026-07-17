# NW-RANK-011G — Daily rail-count and eligibility-funnel analytics

## Mission

Preserve the existing immutable snapshot evidence needed to answer two distinct
questions during the Top Stories shadow pilot:

1. How often does the user-visible rail collapse below its configured depth?
2. At which population stage and for which recorded reasons does that collapse
   occur?

This work is observability-only. It does not change ranking, admission,
diversity, event classification, source acquisition, UI behavior, persistence
or hysteresis.

## Evidence already present in each snapshot

Every `nw-top-stories-run-snapshot/v1` artifact already records:

```text
rankedCount
displayDepth
displayedCount
candidateBuildTrace
selectionTrace
funnel
sourceHealth
inputDigest
```

Before this Work Pack, the daily aggregator retained stability and operational
coverage but did not summarize these rail and funnel fields. A seven-day report
could therefore identify churn without explaining repeated 2–3 story rails.

## Integration

The existing `dailyAggregation.mjs` remains unchanged and continues to own:

- canonical duplicate-slot resolution;
- target-day coverage;
- interval pairing;
- stability distributions;
- period classification;
- residence episodes.

A new wrapper:

```text
scripts/top-stories-shadow/dailyEvidenceAggregation.mjs
```

calls the existing aggregator and appends:

```text
report.railAndFunnel
```

The production aggregation CLI now calls this wrapper. Existing report fields
and schema identifiers are preserved.

## Visible rail populations

Only canonical observations whose `scheduledAt` is inside the target UTC day
are included. Context-window observations remain available to pairing but do
not enter rail-count or funnel distributions.

The report records:

```text
observationCount
rankedCount distribution
displayedCount distribution
underfilledAgainstDisplayDepth
belowSoftReviewDepth
```

The initial soft review depth is eight. It is an analytical marker, not a
ranking minimum and not an automatic fill requirement.

### Displayed-count buckets

The user-visible rail is classified into:

```text
0
1-3
4-7
8-9
10
other
```

The `1-3` bucket directly captures the rail-collapse condition raised during
review. The configured `displayDepth` remains recorded per observation.

## Population-unit funnel

Funnel stages are aggregated without subtracting unlike populations.

Supported units remain explicit:

```text
SOURCE_ROW
RANKING_CANDIDATE
RANKED_ITEM
DISPLAYED_ITEM
```

For every unique combination of stage, input unit and output unit, the report
records:

```text
observationCount
inputCount distribution
outputCount distribution
totalInputCount
totalOutputCount
reasonCounts
```

A `SOURCE_ROW → RANKING_CANDIDATE` transition is therefore not treated as if it
were the same cardinality population as a later candidate admission stage.

## Reason evidence

The analytics preserve four separate reason populations:

```text
candidateBuildDispositionCounts
candidateBuildReasonCounts
finalDispositionCounts
finalReasonCounts
```

Stage-specific selection reasons are also retained for:

```text
admission
selection
display
```

Reason codes are grouped for review into:

```text
invalid_input
duplicate
timestamp
age
evidence
threshold
diversity
rank_limit
display_limit
successful_progression
other
```

The original reason code remains authoritative. Categories are summaries only.

Examples include:

```text
duplicate_identity
low_timestamp_confidence
outside_age_window
unqualified_without_independent_evidence
below_secondary_threshold
max_per_source
max_per_section
max_per_geo
max_per_cluster
outside_ranker_limit
outside_display_limit
```

## Per-observation evidence

Each canonical target-day observation contributes a compact row containing:

```text
observationId
scheduledAt
runAt
inputDigest
completenessState
analyticalEligibility
sourceHealthState
rankedCount
displayDepth
displayedCount
railBucket
underfilled
belowSoftReviewDepth
funnelStageCounts
candidateBuildDispositionCounts
finalDispositionCounts
dominantReasonCodes
```

These rows allow a reviewer to distinguish:

- a small input population;
- source-row duplicate collapse;
- admission rejection;
- diversity or selection nonselection;
- a full ranked pool truncated only by display depth;
- degraded source input.

## Markdown report

The daily Markdown now includes:

- median and minimum displayed count;
- number and fraction below eight;
- number and fraction below configured display depth;
- the five visible-rail buckets;
- dominant non-success reason codes.

The full population-unit evidence remains in `daily_report.json`.

## Operational-gate independence

The 24-hour technical validator does not consume `railAndFunnel` when deciding:

```text
PASS
PASS_WITH_WARNINGS
INSUFFICIENT
FAIL
```

Certification varies the rail from two displayed stories to ten while keeping
operational evidence fixed. The operational checks and verdict must remain
identical.

## Determinism

The wrapper uses only canonical replay observations and deterministic sorting.
Identical immutable artifacts produce byte-stable daily JSON, Markdown and
aggregation manifests through the existing CLI contract.

## Certification

Focused tests cover:

- exact 2–3 story collapse buckets;
- visible counts across 4–7, 8–9 and 10;
- ranked output greater than display depth;
- admission evidence;
- diversity evidence;
- source-row duplicate collapse;
- population-unit preservation;
- exclusion of prior-day context observations;
- deterministic repeated aggregation;
- Markdown rail summary;
- operational-validation independence.

## Next stage

After this evidence is available in the first complete-day report, the project
can begin the seven-day pilot rollup. The later expert decision must use both:

1. stability evidence—whether displayed stories persist; and
2. sufficiency evidence—whether the rail contains a useful number of stories
   and why it underfills.

No production persistence or recall-recovery policy is authorized by this Work
Pack.
