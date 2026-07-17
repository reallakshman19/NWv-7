# NW-RANK-011H — Seven-day pilot rollup and expert decision pack

## Mission

Convert the Top Stories shadow study’s daily aggregation and 24-hour validation
artifacts into a deterministic seven-day expert-review pack.

This implementation does not modify or authorize changes to:

- ranking weights or admission thresholds;
- age windows or event classification;
- source, section, geography or cluster diversity;
- Main-page projection;
- RSS/source acquisition;
- persistence or hysteresis;
- generated news data or deployment.

## Fixed study window

The committed study configuration now defines:

```text
pilotStartDate: 2026-07-17
pilotWindowDays: 7
pilotEndDate: 2026-07-23
pilotDecisionNotBefore: 2026-07-24T02:30:00Z
```

The rollup may execute before the window closes, but it must report
`INSUFFICIENT`. It cannot extrapolate missing dates or claim a seven-day result
from a partial study.

## Evidence inputs

For every configured UTC day, the rollup expects one canonical pair:

```text
daily_report.json
aggregation_manifest.json

operational_validation.json
validation_manifest.json
```

The daily report supplies operational coverage, stability distributions,
visible-rail counts, funnel reasons, compact displayed identities and
input-change analytics.

The 24-hour validation artifact supplies the technical decision:

```text
PASS
PASS_WITH_WARNINGS
INSUFFICIENT
FAIL
```

Only `PASS` and `PASS_WITH_WARNINGS` days with an `OBSERVED` daily report are
usable for editorial review.

## Daily evidence amendments

### Compact displayed identity evidence

Each canonical daily observation now includes:

```text
displayedEditorialIdentities
displayedResolvedIdentityCount
displayedUnresolvedIdentityCount
displayedIdentityStateCounts
```

Only resolved editorial identities enter continuity and residence metrics.
Article bodies, excerpts and source-row payloads are not added.

### Input-change separation

Each daily report now separates pair populations into:

```text
unchangedInput
changedInput
unknownInput
```

for:

```text
15-minute overlapping
15-minute canonical non-overlapping
60-minute overlapping
60-minute canonical non-overlapping
```

The split uses only canonical `inputDigest` equality. It does not infer publisher
or feed changes and does not recreate ranking.

## Artifact acquisition

`scripts/download_top_stories_pilot_artifacts.mjs` queries only GitHub Actions
REST endpoints under:

```text
https://api.github.com/repos/<owner>/<repo>/actions/...
```

It collects artifacts from:

```text
top_stories_shadow_aggregate.yml
top_stories_shadow_validate_24h.yml
```

The acquisition manifest preserves:

- workflow run IDs and attempts;
- artifact IDs and names;
- workflow conclusions and head SHAs;
- downloaded byte sizes;
- runs with no matching artifact.

No news, RSS, publisher, website or generated-data endpoint is accessed.

## Integrity and canonicalization

The pilot artifact reader validates:

1. exact report and manifest schemas;
2. unique file descriptors;
3. declared byte sizes;
4. SHA-256 hashes;
5. study identity;
6. report date;
7. validation decision consistency.

When reruns produce multiple artifacts for one study/date/type, canonical
precedence is:

```text
schema-valid artifact
then higher workflow attempt
then higher artifact ID
```

Superseded, invalid, unassigned and foreign-study artifacts remain visible in
`pilot_input_manifest.json`.

## Rollup decision states

### FAIL

Used for technical evidence defects, including:

- invalid canonical day artifact;
- 24-hour validation `FAIL`;
- incompatible version segment;
- unassigned artifact evidence;
- foreign-study artifact contamination;
- schema or hash failure.

The recommendation becomes:

```text
OPERATIONAL_REPAIR_REQUIRED
```

### INSUFFICIENT

Used when the configured window or minimum evidence is incomplete.

Initial minimum evidence:

```text
7 represented calendar dates
6 usable days
4 calm-evidence days
80 canonical calm 15-minute comparisons
30 canonical calm 60-minute comparisons
```

The recommendation remains:

```text
CONTINUE_OBSERVATION
```

### READY_FOR_EXPERT_REVIEW

Used only when the technical and evidence thresholds are satisfied. This state
allows an expert recommendation but never authorizes an automatic production
change.

## Recommendation policy

The pack may recommend:

```text
RETAIN_CURRENT_POLICY
RECALL_REPAIR_CANDIDATE
PERSISTENCE_CANDIDATE
COMBINED_RECALL_AND_PERSISTENCE_CANDIDATE
CONTINUE_OBSERVATION
OPERATIONAL_REPAIR_REQUIRED
```

### Recall signal

A recall-repair signal is present when either:

```text
median displayed count < 8
```

or:

```text
more than 20% of usable observations display fewer than 8 stories
```

This is a review signal, not a forced minimum or automatic fill policy.

### Persistence signal

A persistence candidate requires all of:

1. calm daily-median retention below the initial review threshold;
2. instability also visible while the input digest is unchanged;
3. enough unchanged-input comparisons;
4. active responsiveness observed on at least two days and in at least three
   canonical active comparisons.

This prevents calm-period churn from automatically authorizing hysteresis when
breaking-event responsiveness has not been observed.

### Combined signal

A combined candidate requires both the visible-rail recall signal and a
persistence-ready stability signal.

## Seven-day metrics

The decision pack aggregates:

### Operational

- represented and usable days;
- validation-decision counts;
- schedule-slot coverage;
- artifact-emission rate;
- complete-run rate;
- analytical-eligibility rate;
- p90 schedule delay.

### Stability

- day-level calm 15-minute and 60-minute medians;
- canonical calm comparison totals;
- calm evidence days;
- active comparison totals and active evidence days.

### Rail and funnel

- ranked and displayed count distributions;
- visible buckets `0`, `1-3`, `4-7`, `8-9`, `10`;
- underfill fractions;
- dominant original reason codes;
- reason-category totals;
- unresolved identity count.

### Input attribution

- unchanged, changed and unknown input pair counts;
- daily-median retention, Jaccard and rank displacement for each population.

### Cross-day continuity

The last compact rail of one usable day is compared with the first compact rail
of the next consecutive usable day using the existing stability metric contract.

### Residence

Resolved editorial identities form continuous residence episodes using a
45-minute maximum observation gap. The pack reports:

- episode count;
- re-entry count;
- left and right censoring;
- duration distributions;
- uncensored duration distributions.

## Output files

The deterministic CLI writes:

```text
pilot_decision.json
pilot_decision.md
pilot_input_manifest.json
pilot_manifest.json
```

The output manifest records byte sizes and SHA-256 hashes. Identical artifacts,
configuration and evaluation time must produce byte-identical results.

## Workflow

`.github/workflows/top_stories_shadow_pilot_decision.yml` runs daily at:

```text
03:47 UTC
```

It also supports manual evaluation time.

Permissions are read-only:

```yaml
permissions:
  contents: read
  actions: read
```

The workflow:

1. reads the fixed study configuration;
2. downloads daily and validation artifacts;
3. extracts each archive into an isolated directory;
4. builds the decision pack;
5. uploads evidence unconditionally;
6. fails only after upload for a technical `FAIL`.

`INSUFFICIENT` remains a successful, evidence-bearing workflow result.

## Authorization boundary

Every decision pack contains:

```text
productionChangeAuthorized: false
automaticPolicyChangeAuthorized: false
expertApprovalRecorded: false
```

A later production Work Pack must be separately scoped, reviewed and approved.

## Certification

Focused tests cover:

- stable/full rail retaining current policy;
- repeated 1–3 story rail producing a recall candidate;
- unchanged-input instability plus active evidence producing a persistence
  candidate;
- combined recall and persistence candidate;
- missing active evidence forcing continued observation;
- fixed-window timing;
- missing daily evidence;
- technical validation failure;
- foreign-study evidence;
- cross-day continuity;
- residence duration and censoring;
- compact resolved identity evidence;
- manifest hash corruption;
- valid-over-invalid rerun precedence;
- deterministic CLI output;
- structured CLI failure output;
- read-only workflow permissions;
- Actions-only acquisition and no git writes.

## Expected first decision-capable run

The first complete configured study window ends on July 23, 2026 UTC. The first
rollup eligible to become `READY_FOR_EXPERT_REVIEW` is the July 24 workflow run,
after the July 23 daily aggregation and 24-hour validation artifacts exist.

Until then, the correct result is `INSUFFICIENT`.
