# NW-RANK-011D — Repository Shadow Publication

## Mission

Implement the first recurring Top Stories observation workflow without changing production ranking or Main-page behavior.

The workflow replays committed repository snapshots, runs the authoritative stateless evaluator introduced by NW-RANK-011A/011C, and publishes immutable GitHub Actions artifacts every fifteen minutes on an offset schedule.

## Observation classification

The workflow records:

```text
observationMode = repository-snapshot-replay
```

It does not claim that the repository snapshot is the exact asset served through the production deployment or CDN.

## Production path evidence

The current Main browser refresh ranks priority sections:

```text
world
india
chennai
trichy
local
```

Static snapshot ingestion maps:

```text
chennai -> tn
local   -> muscat
```

The current `NewsContext.refreshNews()` call does not provide `topFeedItems` to `rankTopStories()`. The shadow adapter therefore records:

```text
topFeedItems = []
topFeedMode  = explicit-empty-current-main-runtime-contract
```

The current Top Stories scoring path does not consume the settings object. The adapter records:

```text
settings = {}
settingsMode = explicit-empty-current-ranker-contract
```

These are explicit contracts, not inferred fallbacks.

## Repository input adapter

Module:

```text
scripts/top-stories-shadow/repositoryReplayAdapter.mjs
```

Inputs:

```text
public/newsdata/sections_latest.json
public/newsdata/source_health.json
explicit nowMs
```

Behavior:

- accepts sections snapshot schema 1 or 2;
- requires both repository inputs;
- maps Main priority aliases;
- selects no more than ten rows per requested section;
- normalizes title, summary, URL, source, timestamps and section identity;
- uses the explicit observation clock for item freshness;
- preserves stale rows only as a declared stale fallback when no fresh row exists;
- reports missing sections, failed sources, warning sources and snapshot age;
- performs no live acquisition;
- does not mutate source snapshots.

Repository age contracts:

```text
snapshot maximum age: 12 hours
item maximum age:     36 hours
section row limit:    10
```

A stale repository snapshot remains observable but is marked analytically uninterpretable by the existing 011C state contract.

## Nominal-slot contract

Module:

```text
scripts/top-stories-shadow/nominalSlot.mjs
```

UTC grid:

```text
07, 22, 37, 52 minutes past each hour
```

The resolver selects the latest grid slot at or before the explicit `runAt` value. It handles hour and day rollover and never calls `Date.now()`.

Output includes:

```text
scheduledAt
runAt
scheduleDelaySeconds
slotKey
method
gridMinutes
```

The nominal slot is inferred from the fixed cron grid because GitHub scheduled workflows do not provide a guaranteed exact trigger timestamp to the job. Delayed and missing runs are measured; missing observations are never reconstructed.

## Stateless repository runner

CLI:

```text
scripts/run_top_stories_repository_shadow.mjs
```

Required arguments:

```text
--config
--sections
--source-health
--output
--run-at
--repository-sha
--workflow-run-id
--workflow-run-attempt
```

The runner:

1. resolves the nominal slot;
2. reads committed repository JSON files;
3. builds the validated 011C input bundle;
4. calls `createTopStoriesRunArtifacts()`;
5. writes the immutable observation files;
6. writes operational evidence;
7. writes a publication manifest;
8. returns non-zero after evidence is written when the observation is invalid.

Success directory:

```text
snapshot.json
manifest.json
operational.json
publication_manifest.json
```

Failure directory:

```text
failure.json
manifest.json
operational.json
publication_manifest.json
```

## Operational evidence

Module:

```text
scripts/top-stories-shadow/operationalRecord.mjs
```

Recorded facts include:

- study ID;
- repository SHA;
- workflow run ID and attempt;
- nominal and actual times;
- schedule delay;
- adapter state;
- repository snapshot age;
- source-health summary;
- success or failure state;
- observation ID when available;
- artifact file hashes and byte sizes.

The record explicitly states:

```text
crossRunMetricsIncluded = false
```

It contains no retention, continuity, entrant, exit, residence or Jaccard calculations.

## Publication integrity

`publication_manifest.json` lists every published file except itself with:

```text
name
byteSize
sha256
```

Integrity scope remains:

```text
accidental-corruption-and-transfer-completeness-only
```

The producer creates both data and hashes, so these hashes are not independent cryptographic attestation.

## GitHub Actions workflow

Workflow:

```text
.github/workflows/top_stories_shadow.yml
```

Schedule:

```yaml
cron: '7,22,37,52 * * * *'
```

Operational controls:

- manual dispatch enabled;
- `contents: read` only;
- no repository writes;
- no concurrency group;
- no active-run cancellation;
- ten-minute timeout;
- one frozen UTC clock per run;
- observation step allowed to fail temporarily so evidence upload can run;
- artifact upload uses `if: always()`;
- invalid observations fail the workflow after upload;
- artifact retention is thirty days.

The workflow does not invoke RSS collectors, section fetch scripts, `curl`, `wget`, git commit, or git push.

## Artifact identity

Artifact names contain:

```text
top-stories-shadow
studyId
nominalSlotKey
workflowRunId
workflowRunAttempt
```

This distinguishes reruns and duplicate nominal slots while preserving later canonical-resolution options for the aggregator.

## Certification

Focused tests prove:

- Main section aliases are mapped correctly;
- every section is limited to ten rows;
- freshness uses the injected observation clock;
- stale fallback is explicit;
- stale and partial source states are recorded;
- Top Feed rows remain explicitly empty;
- the output passes the NW-RANK-011C input contract;
- deep-frozen source snapshots are not mutated;
- nominal slots handle exact, delayed, hourly and daily rollover cases;
- invalid run timestamps fail closed;
- operational evidence excludes cross-run metrics;
- success publication hashes and byte sizes validate;
- failure evidence is written before non-zero exit;
- workflow permissions and schedule are safe;
- workflow artifact upload is unconditional;
- workflow contains no repository write or live-feed acquisition path.

## Deliberate exclusions

This Work Pack does not add:

- cross-run artifact retrieval;
- duplicate-slot canonicalization;
- interval pairing;
- retention or residence calculations;
- daily summaries;
- statistical confidence intervals;
- persistence or hysteresis;
- production ranking changes;
- deployment-asset equivalence.

Those remain the scope of NW-RANK-011E and later expert review.

## Expected next gate

NW-RANK-011E should implement the read-only cross-run artifact aggregator with:

- workflow-run discovery by study ID;
- artifact download and schema/hash validation;
- rerun and duplicate-slot resolution;
- immutable aggregation input manifest;
- valid 15-minute and 60-minute pairing;
- overlapping and canonical non-overlapping result sets;
- operational coverage counts;
- deterministic JSON and Markdown summaries.
