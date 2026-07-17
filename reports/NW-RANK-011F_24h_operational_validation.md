# NW-RANK-011F — 24-hour operational validation gate

## Mission

Validate whether one complete UTC day of Top Stories shadow observations is
technically usable for later editorial analysis. This gate evaluates workflow,
artifact, schema, timing, completeness and pairing evidence only.

It does not change or approve:

- ranking weights or thresholds;
- event classification;
- Main-page projection;
- source acquisition;
- persistence or hysteresis;
- any production editorial policy.

## Inputs

The validator consumes the artifact produced by `Top Stories Shadow Aggregate`:

```text
daily_report.json
daily_report.md
aggregation_manifest.json
download_manifest.json
```

It also reads the committed fixed study configuration:

```text
config/top_stories_shadow_study.json
```

The validation workflow does not download individual observation artifacts and
does not fetch news, RSS, publisher or generated-data inputs.

## Output files

```text
operational_validation.json
operational_validation.md
validation_manifest.json
```

The manifest records deterministic byte sizes and SHA-256 hashes for the JSON
and Markdown evidence.

## Decision states

### PASS

A full observed UTC day meets all frozen operational readiness thresholds and
contains no technical failure or warning condition.

### PASS_WITH_WARNINGS

The day is technically usable, but one or more non-critical operational metrics
fall within the warning range. Examples include moderate schedule loss, delayed
runs, degraded input health, or a small number of runs that did not publish an
artifact.

### INSUFFICIENT

The evidence does not support an operational conclusion. This is expected for:

- a partial first day;
- an empty or explicitly insufficient daily report;
- schedule coverage below the minimum evidence floor;
- too few 15-minute or 60-minute pairs;
- unavailable denominator metrics.

`INSUFFICIENT` is not a technical failure and does not fail the validation
workflow.

### FAIL

A technical contract is broken. Examples include:

- unknown schema;
- study or report-date mismatch;
- aggregate-report hash or byte-size mismatch;
- duplicate or malformed manifest descriptors;
- invalid artifacts;
- version fragmentation;
- impossible count relationships;
- mismatch between downloaded artifacts and daily started-run evidence.

A `FAIL` result is uploaded first and then causes the workflow to fail.

## Frozen initial thresholds

| Metric | PASS | Warning / sufficient floor |
|---|---:|---:|
| Schedule-slot coverage | `>= 0.90` | `>= 0.75` |
| Artifact-emission rate | `>= 0.90` | `>= 0.75` |
| Complete-run rate | `>= 0.90` | `>= 0.75` |
| Analytical-eligibility rate | `>= 0.90` | `>= 0.75` |
| Valid 15-minute pairs | `>= 70` | `>= 53` |
| Canonical 15-minute pairs | `>= 30` | `>= 23` |
| Valid 60-minute pairs | `>= 60` | `>= 45` |
| Canonical 60-minute pairs | `>= 16` | `>= 12` |
| p90 schedule delay | `<= 600 s` | `<= 1200 s` |

Values below the sufficient floor produce `INSUFFICIENT`, not a production
ranking failure.

## Acquisition accounting

The download manifest covers the target day plus the aggregation context window.
The validator therefore recalculates target-day workflow runs rather than using
the top-level context-window count.

Downloaded runs are assigned to the report day using the nominal-slot key in the
artifact name:

```text
YYYYMMDDTHHMMZ
```

This avoids assigning a delayed `23:52` observation to the following day merely
because its workflow started after midnight. Run creation time is used only as a
fallback when an artifact does not contain a nominal-slot key.

The gate reports:

```text
workflowRunCount
downloadedRunCount
missingArtifactRunCount
artifactEmissionRate
```

## Count conservation

For a schema-valid day, these invariants must hold:

```text
completeRuns <= successfulRuns
analyticallyEligibleRuns <= successfulRuns
successfulRuns + failureRuns <= startedRuns
downloadedRunCount == startedRuns
```

A violation is a technical `FAIL`, because the daily report and acquisition
manifest no longer describe the same evidence population.

## Integrity checks

The CLI validates the aggregate manifest before applying thresholds:

1. `files` must be an array;
2. descriptor names must be valid and unique;
3. `daily_report.json` must be described;
4. `daily_report.md` must be described;
5. declared byte sizes must match;
6. declared SHA-256 hashes must match.

The pure validator then checks exact schemas, study identity, report date,
invalid-artifact counts and version segments.

## Version contract

An observed day must have exactly one segment matching:

```text
studyId
| rankerVersion
| identityVersion
| periodClassifierVersion
```

A partial day may have no segment. A present segment must still match the fixed
study configuration.

## Editorial independence

The validation evidence carries these observations for reviewer convenience:

```text
calm 15-minute median incumbent retention
calm 60-minute median incumbent retention
```

They are not inputs to the operational decision. Certification changes both
values from high retention to zero and requires the operational checks and
verdict to remain unchanged.

## Workflow

`.github/workflows/top_stories_shadow_validate_24h.yml` runs after a successful:

```text
Top Stories Shadow Aggregate
```

It also supports manual dispatch using an aggregate workflow run ID.

Permissions are read-only:

```yaml
permissions:
  contents: read
  actions: read
```

Execution sequence:

1. download only the triggering aggregate artifact;
2. resolve the four expected input files;
3. create placeholders when download evidence is missing so a structured
   technical `FAIL` can still be produced;
4. run the deterministic validator;
5. upload validation evidence unconditionally;
6. fail the workflow only after upload when the decision is `FAIL`.

`PASS_WITH_WARNINGS` and `INSUFFICIENT` remain successful evidence-bearing
workflow runs.

## First-run interpretation

A report for a day during which the shadow workflow was installed partway
through the UTC day should produce `INSUFFICIENT`. The first decision-capable
run is the aggregate report for the first complete UTC day after installation.
The gate does not extrapolate missing slots or pretend that a partial day is a
24-hour study.

## Certification

Focused tests prove:

- full-day `PASS`;
- degraded `PASS_WITH_WARNINGS`;
- partial-day `INSUFFICIENT`;
- integrity and version `FAIL`;
- null zero-denominator handling;
- nominal-slot acquisition assignment;
- count conservation;
- editorial-metric independence;
- byte-stable repeated CLI output;
- structured failure output before nonzero exit;
- post-aggregation trigger;
- read-only permissions;
- aggregate-artifact-only download;
- unconditional validation artifact upload.

## Next stage

After the first complete-day validation artifact is available:

1. inspect the operational decision and reason codes;
2. repair only genuine implementation defects;
3. retain the ranking policy unchanged;
4. continue the seven-day observational pilot only when the evidence is
   operationally usable.
