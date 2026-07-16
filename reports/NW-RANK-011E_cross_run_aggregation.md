# NW-RANK-011E — Cross-run aggregation and daily stability reports

## Mission

Convert immutable Top Stories shadow-run artifacts into reproducible daily
operational and editorial-stability evidence without changing production
ranking, UI projection, source acquisition, or persistence behavior.

## Delivered components

| Component | Responsibility |
|---|---|
| `artifactReader.mjs` | Discover and validate extracted observation artifacts |
| `dailyAggregation.mjs` | Coverage, replay, pair statistics, distributions and input manifest |
| `dailyReportMarkdown.mjs` | Human-readable daily report |
| `download_top_stories_shadow_artifacts.mjs` | Repository-scoped Actions artifact acquisition |
| `aggregate_top_stories_shadow.mjs` | Deterministic local aggregation CLI |
| `top_stories_shadow_aggregate.yml` | Daily read-only aggregation workflow |

## Trust boundary

The collector accesses only GitHub Actions REST endpoints under:

```text
https://api.github.com/repos/<owner>/<repository>/actions/...
```

It does not acquire RSS, publisher, website, API, or generated-news inputs.
The workflow permissions are:

```yaml
permissions:
  contents: read
  actions: read
```

The aggregation workflow never writes to the repository.

## Acquisition window

The daily workflow runs at `02:17 UTC` and defaults to the previous UTC day.
The artifact query adds 90 minutes before and after the target day. This allows
pairing around midnight while keeping target-day operational coverage isolated
from context observations.

The downloader records:

- workflow run ID and attempt;
- run timestamps and conclusion;
- head SHA;
- artifact ID, name and creation time;
- downloaded byte size;
- runs with no matching artifact and their exclusion reason.

The result is `download_manifest.json`.

## Artifact integrity

Every extracted observation directory must contain:

```text
publication_manifest.json
manifest.json
operational.json
snapshot.json OR failure.json
```

Validation checks:

1. exact publication-manifest schema;
2. unique described file names;
3. byte size for every described file;
4. SHA-256 for every described file;
5. exact core-manifest schema;
6. exactly one core payload;
7. exact snapshot or failure schema;
8. exact operational-record schema;
9. cross-file study ID, scheduled time and run time consistency.

A validation failure returns `INVALID_ARTIFACT`. It remains in the daily input
manifest with a reason but is never passed to editorial replay.

Hashes protect against incomplete transfer and accidental corruption. They are
not independent cryptographic attestation because the producer creates the
content and hashes.

## Canonical observation selection

This slice reuses `analyzeTopStoriesSequence()` from NW-RANK-011B. It does not
reimplement duplicate-slot or rerun policy.

Canonical precedence remains:

1. schema-valid attempt;
2. higher completeness state;
3. higher workflow run attempt.

Superseded attempts remain operational evidence and are excluded from pairing.
Failure artifacts remain operational evidence and are excluded from editorial
stability metrics.

## Daily operational coverage

The report records:

```text
scheduledRuns
scheduledSlots
observedSlotCount
scheduleSlotCoverage
discoveredArtifacts
contextArtifactCount
unassignedInvalidArtifacts
startedRuns
validArtifacts
invalidArtifacts
successfulRuns
failureRuns
failedInputRuns
completeRuns
analyticallyEligibleRuns
uncertainRuns
delayedOverFiveMinutes
scheduleDelaySeconds
canonicalObservationCount
supersededDuplicateCount
valid15mPairs
valid60mPairs
canonical15mPairs
canonical60mPairs
unchangedInput15mPairs
unchangedInput60mPairs
uncertain15mPairs
uncertain60mPairs
excludedPairsByReason
artifactExclusionReasons
```

There are 96 nominal slots per complete UTC day.

## Stability populations

The report distinguishes:

- all overlapping 15-minute pairs;
- canonical non-overlapping 15-minute sensitivity pairs;
- all overlapping 60-minute pairs;
- canonical non-overlapping 60-minute sensitivity pairs.

Overlapping pairs are explicitly serially correlated and are not treated as
independent experiments.

For each population and period class, the report calculates:

```text
count
median
p10
p25
p75
p90
minimum
maximum
fractionBelowThreshold
maximumConsecutiveCalmLowRetention
```

Metrics include:

- incumbent retention;
- new-list continuity;
- Jaccard overlap;
- normalized weighted rank displacement;
- count delta;
- entrants;
- exits.

The initial review thresholds remain hypotheses:

```text
15-minute calm incumbent retention: 0.90
60-minute calm incumbent retention: 0.80
```

They are reported, not enforced as production gates.

## Context isolation

Artifacts in the 90-minute boundary context are available to the replay engine
for cross-midnight pairs. They do not increase:

- target-day started-run count;
- target-day successful-run count;
- target-day slot coverage;
- target-day invalid-artifact count.

Every input-manifest row includes `withinReportDay`.

## Empty and insufficient days

Daily report status is:

```text
EMPTY
  no target-day artifact evidence

INSUFFICIENT
  target-day evidence exists but fewer than two canonical snapshots are present

OBSERVED
  at least two target-day canonical snapshots are present
```

An empty day is valid operational evidence. The system does not fabricate
missing observations or reconstruct absent slots.

## Deterministic output

The aggregation CLI writes:

```text
daily_report.json
daily_report.md
aggregation_manifest.json
```

The aggregation manifest records output byte sizes and SHA-256 hashes. Repeated
aggregation of the same extracted artifact set and study configuration must
produce byte-identical output.

## Workflow

`.github/workflows/top_stories_shadow_aggregate.yml`:

- runs daily at `02:17 UTC`;
- supports manual report-date dispatch;
- derives the study ID from the fixed study configuration;
- downloads observation artifacts through the Actions API;
- extracts each archive into an isolated directory;
- aggregates the target day;
- copies the acquisition manifest into the report bundle;
- uploads reports for 30 days;
- performs no git commit or push.

## Certification

Focused tests cover:

- valid success and failure artifacts;
- corrupted payload hash rejection;
- unsupported schema rejection;
- duplicate-slot and rerun precedence;
- failure exclusion from editorial replay;
- target-day coverage isolation from context;
- overlapping and canonical pair populations;
- deterministic repeated output;
- empty-day reporting;
- read-only workflow permissions;
- Actions-API-only acquisition;
- artifact-only publication.

## Explicit non-goals

This work does not:

- change ranking weights, thresholds, windows or event rules;
- modify Main UI or runtime refresh behavior;
- modify RSS/source policy;
- alter generated news data;
- claim deployment/CDN user-visible equivalence;
- introduce production persistence or hysteresis;
- automatically approve a ranking-policy change.

The next step is a 24-hour operational validation, followed by the seven-day
observational pilot and expert decision report.
