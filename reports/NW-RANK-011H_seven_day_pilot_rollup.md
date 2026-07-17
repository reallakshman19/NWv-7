# NW-RANK-011H — Seven-day pilot rollup and expert decision pack

## Mission

Combine daily Top Stories shadow evidence into one deterministic expert-review
artifact without authorizing any production ranking or persistence change.

The rollup consumes:

```text
daily_report.json
operational_validation.json
config/top_stories_shadow_study.json
```

It produces:

```text
pilot_rollup.json
pilot_rollup.md
pilot_manifest.json
```

## Decision states

### INSUFFICIENT

The evidence population does not meet the frozen minimum contract. Calendar
elapsed time alone cannot satisfy this decision gate.

### CONTINUE_OBSERVATION

Operational and calm-period evidence are usable, but active responsiveness or
other episode diversity is not yet represented strongly enough to support a
policy recommendation.

### REPAIR_RECALL

The visible rail is chronically underfilled while calm-period stability remains
acceptable. Likely causes must be read from the preserved funnel reason codes.

### ADD_PERSISTENCE

The rail has useful depth, but calm-period churn is below the review target and
canonical active-event evidence confirms that responsiveness can still be
assessed.

### REPAIR_RECALL_THEN_PERSISTENCE

Both chronic underfill and calm-period instability are evidenced. Recall repair
must precede persistence tuning so that persistence does not merely freeze an
undersupplied rail.

### RETAIN_POLICY

Useful rail depth, calm stability and canonical active responsiveness all meet
the initial review thresholds.

### TECHNICAL_REMEDIATION

Unknown schemas, study/version mismatches, integrity failures or daily technical
FAIL evidence prevent editorial interpretation.

## Frozen sufficiency contract

The initial decision pack requires:

```text
7 distinct UTC days supplied
6 operationally usable days
0 unresolved technical FAIL days
4 days with canonical calm 15-minute evidence
3 days with canonical calm 60-minute evidence
30 canonical calm 15-minute pairs
12 canonical calm 60-minute pairs
```

Active responsiveness is considered represented when either:

```text
2 days/episodes contain canonical active evidence
or
4 canonical active pairs exist
```

These are evidence sufficiency gates, not production service-level objectives.

## Review thresholds

```text
median displayed count >= 8
observations below 8 <= 25%
observations in 0–3 bucket <= 10%
calm 15-minute median incumbent retention >= 90%
calm 60-minute median incumbent retention >= 80%
```

The implementation reports these thresholds but does not modify production
behavior automatically.

## Daily canonicalization

Multiple artifacts may exist for one UTC date because of workflow reruns or
manual re-aggregation. The rollup selects one daily pair deterministically:

1. higher operational decision quality;
2. deterministic source identifier ordering when quality is equal.

Superseded candidates remain visible in `supersededInputs`.

## Version and schema contract

Every included day must use:

```text
nw-top-stories-daily-stability-report/v1
nw-top-stories-24h-operational-validation/v1
nw-top-stories-shadow-study/v1
```

Each daily report must contain exactly one version segment matching:

```text
studyId
| rankerVersion
| identityVersion
| periodClassifierVersion
```

A mismatch produces `TECHNICAL_REMEDIATION`.

## Operationally usable days

Only daily validation decisions:

```text
PASS
PASS_WITH_WARNINGS
```

enter editorial metrics. `INSUFFICIENT`, `FAIL` and schema-invalid days remain
in the excluded-day evidence with their reason codes.

## Rail sufficiency

The rollup combines canonical target-day rail evidence across usable days:

```text
observation count
0 / 1–3 / 4–7 / 8–9 / 10 buckets
median of daily displayed-count medians
fraction below eight
fraction with zero to three stories
```

Daily summaries remain the decision unit; the implementation does not treat all
15-minute observations as independent experiments.

## Calm-period stability

The rollup uses only:

```text
canonicalNonOverlapping.calm
```

for 15-minute and 60-minute decision evidence. It reports:

```text
days with evidence
canonical pair count
median of daily medians
```

Overlapping pair statistics remain in the daily artifacts but are not treated
as independent decision samples.

## Active responsiveness

The final decision-pack layer uses only:

```text
canonicalNonOverlapping.active
```

Overlapping active comparisons cannot satisfy the active-responsiveness gate.
This prevents a large set of serially correlated intervals from appearing to be
multiple independent active episodes.

## Input-change separation

The decision pack preserves:

```text
15-minute unchanged-input pairs
15-minute changed-input pairs
60-minute unchanged-input pairs
60-minute changed-input pairs
```

This helps distinguish rank-score jitter under identical inputs from legitimate
rail movement caused by changed repository snapshots.

## Residence evidence

Daily residence episode counts are retained as descriptive evidence. Residence
is not currently a hard recommendation threshold because cross-day censoring and
study-boundary handling remain governed by the immutable daily/replay contracts.

## Funnel causes

The rollup aggregates original daily reason codes from:

```text
candidateBuildReasonCounts
finalReasonCounts
```

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

The original reason codes remain authoritative.

## Artifact acquisition

The workflow:

```text
.github/workflows/top_stories_shadow_pilot_rollup.yml
```

runs daily at `03:17 UTC` and supports manual start/end dates. Scheduled runs use
the latest seven complete UTC days.

It downloads successful artifacts only from:

```text
top_stories_shadow_aggregate.yml
top_stories_shadow_validate_24h.yml
```

Permissions are read-only:

```yaml
contents: read
actions: read
```

It does not access RSS feeds, publisher endpoints, generated news files or the
production application runtime.

## Input manifest

Every discovered daily and validation input records:

```text
path
byteSize
sha256
```

Missing pairs are retained with explicit exclusion reason codes. The output
manifest also records requested date bounds and hashes for the JSON and Markdown
outputs.

## Determinism

Identical files, paths and requested dates must produce byte-identical:

```text
pilot_rollup.json
pilot_rollup.md
pilot_manifest.json
```

The workflow publishes `INSUFFICIENT` and `CONTINUE_OBSERVATION` as successful
evidence. Only execution or technical-contract failure prevents a normal pack.

## Certification

Focused tests cover:

- fewer than seven days;
- technical FAIL and version mismatch;
- recall-only recommendation;
- persistence-only recommendation;
- combined recall and persistence recommendation;
- retain-policy recommendation;
- continue-observation recommendation;
- deterministic duplicate-day resolution;
- canonical active evidence versus overlapping evidence;
- unchanged-input versus changed-input pair separation;
- date-bounded CLI execution;
- byte-stable repeated outputs;
- read-only workflow permissions and artifact-only acquisition.

## Production authorization

Every decision pack sets:

```text
productionChangeAuthorized: false
persistenceChangeAuthorized: false
```

A later reviewed Work Pack is required before changing ranking, recall,
persistence, source policy, UI or deployment behavior.
