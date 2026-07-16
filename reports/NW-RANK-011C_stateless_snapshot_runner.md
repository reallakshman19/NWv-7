# NW-RANK-011C — Fixed study configuration and stateless snapshot runner

## Mission

Provide the manual, behavior-neutral observation runner required before any
recurring Top Stories stability workflow.

This slice does not claim that repository data is identical to the asset served
to users. Its observation mode is explicitly:

```text
repository-snapshot-replay
```

## Implemented components

### Fixed study configuration

`config/top_stories_shadow_study.json` defines:

```text
studyId
schemaVersion
observationMode
runnerVersion
rankerVersion
identityVersion
periodClassifierVersion
inputContractVersion
displayDepth
rankerLimit
expiryAt
owner
approver
```

The configuration has no default study ID. Missing or invalid values fail
closed.

Validation rejects:

```text
missing study identity
unsupported observation mode
study schema drift
repository input-contract drift
identity-version drift
period-classifier-version drift
invalid display/ranker limits
expired studies
```

The executable identity and period-classifier constants are checked directly.

### Repository replay input contract

The runner accepts an explicit JSON bundle containing:

```text
sectionItems
topFeedItems
settings
sourceHealth
inputSource
inputSnapshotGeneratedAt
optional completeness and eligibility state
optional input diagnostics
```

`inputSource` must begin with `repository-`. The runner therefore cannot label a
repository replay as a user-visible observation.

The runner does not import or call RSS/network fetching code.

### Frozen observation clock

`runAt` is mandatory and becomes the only ranking `nowMs` value. The runner does
not call `Date.now()` during evaluation.

`scheduledAt` is also mandatory. Negative schedule delay is rejected.

### Authoritative ranking path

The runner calls:

```js
evaluateTopStories(input, {
  limit,
  displayDepth,
  nowMs
})
```

It does not reconstruct scoring, admission, diversity or selection.

The snapshot records the full ranked output and displayed population separately:

```text
rankedCount
rankedIds
ranked
displayDepth
displayedCount
displayedTopNIds
displayed
```

### Study identity

Identity is resolved once over the complete scored-candidate population. Ranked
and displayed rows reuse those identity results, preventing a conflict from
appearing differently in smaller subsets.

### Immutable run snapshot

The output snapshot contains observation facts only. It intentionally excludes:

```text
first seen
previous rank
entrant or exit state
residence
retention
Jaccard
replacement classification
```

Those remain derived cross-run products handled by the 011B analysis layer.

### Funnel contract

The snapshot records stages with explicit units:

```text
raw_input
  output unit: SOURCE_ROW

candidate_build
  SOURCE_ROW -> RANKING_CANDIDATE

admission
  RANKING_CANDIDATE -> RANKING_CANDIDATE

ranker_selection
  RANKING_CANDIDATE -> RANKED_ITEM

display_projection
  RANKED_ITEM -> DISPLAYED_ITEM
```

Each stage records input count, output count and reason counts.

### Provenance and digests

Required observation metadata:

```text
repositorySha
workflowRunId
workflowRunAttempt
scheduledAt
runAt
```

Snapshot provenance includes:

```text
studyConfigDigest
inputDigest
settingsDigest
topFeedDigest
policyDigest
inputSource
inputSnapshotGeneratedAt
scheduleDelaySeconds
```

Canonical JSON sorts object keys. Ranking-input arrays are canonicalized for
order-independent digesting. Declared volatile diagnostics such as fetch time
and fetch duration are excluded from the ranking input digest.

Meaningful story changes alter the digest.

### Data minimization

Story evidence is whitelisted. The artifacts exclude:

```text
article body
full content
HTML
cookies
authorization headers
tokens
secrets
passwords
user identifiers
read/view state
personalisation state
```

The artifact retains the title, URL/identity, publisher, section/geography,
publication timestamp and authoritative ranking evidence needed for review.

### Completeness versus analytical eligibility

The snapshot records independent fields:

```text
completenessState
analyticalEligibility
```

Examples:

```text
partial source input
  completenessState = PARTIAL_INPUT
  analyticalEligibility = INELIGIBLE

complete observation during source-health failure
  completenessState = COMPLETE
  analyticalEligibility = INPUT_CHANGED_UNINTERPRETABLE
```

### Artifact bundle

Successful execution produces:

```text
snapshot.json
manifest.json
```

Failed execution produces:

```text
failure.json
manifest.json
```

The manifest records:

```text
file name
schema version
content type
byte size
SHA-256
integrity scope
```

The integrity scope is explicitly limited to accidental corruption and transfer
completeness. The producer creates both the content and hash, so this is not an
independent attestation.

The manifest does not hash itself. `selfHashExcluded` is recorded.

A successful snapshot is limited to 5 MB.

## Manual CLI

```bash
node scripts/run_top_stories_shadow_snapshot.mjs \
  --config config/top_stories_shadow_study.json \
  --input /path/to/repository-replay-input.json \
  --output /path/to/one-observation-directory \
  --scheduled-at 2026-07-16T17:07:00.000Z \
  --run-at 2026-07-16T17:22:00.000Z \
  --repository-sha <sha> \
  --workflow-run-id <explicit-id> \
  --workflow-run-attempt 1
```

All arguments are mandatory. The CLI performs no live acquisition.

## Certification

Focused tests cover:

```text
fixed config validation
no silent study default
schema and executable-version drift
study expiry
canonical digest ordering
volatile-field exclusion
meaningful input change detection
repository-only input source
story and diagnostics minimization
frozen Date.now trap
ranker output preservation
ranked/displayed separation
absence of cross-run fields
population-unit funnel
success manifest hash and byte size
5 MB budget
completeness/eligibility separation
invalid config/input/timing failure artifact
byte-stable repeated execution
CLI success directory
CLI failure directory
static absence of live network acquisition
```

## Deliberate exclusions

This PR does not add:

```text
GitHub Actions schedule
artifact upload or cross-run retrieval
production asset/deployment equivalence
live source fetch
cross-run aggregation
residence or interval comparison
persistence or hysteresis
production ranking changes
Main UI changes
```

## Next gate

The next work package may add workflow execution and artifact publication only
after reviewers accept `repository-snapshot-replay` as the pilot observation
mode or provide a certified deployed-asset acquisition contract.
