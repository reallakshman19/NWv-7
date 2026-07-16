# NW-RANK-011B — Identity, stability metrics, period classification, and offline replay

## Mission

Implement the pure analytical layer required before any recurring Top Stories
shadow workflow. This change is behavior-neutral and does not alter production
ranking, Main UI projection, source acquisition, generated data, or deployment.

## Delivered modules

| Module | Responsibility |
|---|---|
| `topStoriesStudyIdentity.js` | Versioned editorial identity and URL normalization |
| `topStoriesIdentityTransitions.js` | Mutation, representative substitution, split/merge, and version boundaries |
| `topStoriesStabilityMetrics.js` | Displayed-list continuity and ordered-rank displacement |
| `topStoriesObservationPairing.js` | Deterministic 15-minute and 60-minute pair construction |
| `topStoriesPeriodClassifier.js` | Frozen calm/active/uncertain classification |
| `topStoriesSequentialReplay.js` | Duplicate-slot resolution, replay, comparisons, and residence episodes |

## Identity contract

Every story can be assigned:

```text
editorialIdentity
identityMethod
identityConfidence
identityVersion
identityState
rowIdentity
sourceFamily
titleFingerprint
strongSignals
diagnostics
```

Identity method precedence is:

```text
cluster_id
canonical_id
canonical_url
event_fingerprint
title_fingerprint_fallback
```

Identity states are:

```text
IDENTITY_RESOLVED
IDENTITY_AMBIGUOUS
IDENTITY_CONFLICT
IDENTITY_UNAVAILABLE
```

Title-only identity is intentionally ambiguous and is excluded from headline
editorial churn metrics. Conflicting same-method identifiers or conflicting
cross-record cluster/canonical mappings fail closed.

The initial identity version is:

```text
nw-top-stories-identity-v1
```

A change in identity version creates a hard study segment boundary. Residence
and retention are not continued directly across that boundary.

## Canonical URL contract

URL normalization:

- lowercases and normalizes hostnames;
- removes `www.` and mobile-host prefixes;
- removes URL fragments;
- removes known tracking parameters and `utm_*` fields;
- sorts retained query parameters;
- removes trailing AMP and path slashes where safe.

The normalized URL is evidence for identity, not a guarantee that a recurring
live page represents one permanent editorial event. Future production studies
must retain identity diagnostics for reused live URLs.

## Identity transitions

The comparison layer records:

```text
representative_source_substitution
representative_row_substitution
headline_mutation
cluster_split
cluster_merge
identity_version_boundary
```

Split and merge detection uses explicit member evidence when available. It does
not infer a split or merge solely from title similarity.

## Displayed-list metric contract

The primary population is the resolved editorial identities in the displayed
Top N rail. Ambiguous, conflicting, and unavailable identities are listed as
excluded evidence.

Metrics are:

```text
incumbentRetention = retained / priorCount
newListContinuity  = retained / currentCount
jaccard             = retained / unionCount
countDelta          = currentCount - priorCount
entrantCount
exitCount
top3Retention
numberOneContinuity
normalizedWeightedRankDisplacement
```

Zero-denominator semantics use `null`:

| Prior | Current | Incumbent retention | New-list continuity | Jaccard |
|---:|---:|---:|---:|---:|
| 0 | 0 | null | null | null |
| 0 | >0 | null | 0 | 0 |
| >0 | 0 | 0 | null | 0 |

Therefore a ten-story rail collapsing to three retained stories reports:

```text
incumbentRetention = 0.30
newListContinuity = 1.00
countDelta = -7
```

It cannot be reported as perfect retention.

## Ordered-rank displacement

The ordered metric uses the union of prior and current identities. Missing
identities receive a rank one position below the longer rail. Rank importance
uses:

```text
weight(rank) = 1 / log2(rank + 1)
```

The weighted absolute rank change is normalized by the longer rail length and
bounded to `[0, 1]`. Entrants and exits therefore contribute displacement, while
identical ordered lists return zero.

## Pairing contract

The standard windows are:

```text
15-minute horizon: 8–30 minutes
60-minute horizon: 45–75 minutes
```

For every eligible anchor and horizon:

1. consider only subsequent observations in the configured window;
2. require the same study/ranker/identity/period-classifier segment;
3. choose the candidate nearest to the target horizon;
4. break ties by earlier run time and then stable input order.

The output contains:

```text
all overlapping pairs
canonical non-overlapping sensitivity pairs
pair exclusions
pair configuration
serial-correlation notice
```

Overlapping pairs are explicitly not treated as independent experiments.

## Period classifier

The classifier executes before stability metrics are interpreted. It receives
candidate, source-health, and identity evidence; it does not receive churn
magnitude as a classification input.

Precedence:

```text
uncertain
  incomplete observation, incomplete source evidence, identity conflict,
  or identity-version boundary

active
  new admitted and independently qualified critical candidate,
  admitted cold-start critical candidate,
  or material update to an existing critical candidate

calm
  no new qualified critical event
```

The initial policy defines critical event types, independent-evidence
requirements, admitted-candidate requirements, source-health requirements, and
material score/source-count thresholds. The policy version and deterministic
digest are returned with every classification.

## Run completeness and analytical eligibility

The replay contract keeps the dimensions separate:

```text
completenessState
  COMPLETE
  PARTIAL_INPUT
  PARTIAL_TRACE
  FAILED

analyticalEligibility
  ELIGIBLE
  IDENTITY_UNCERTAIN
  PERIOD_UNCERTAIN
  INPUT_CHANGED_UNINTERPRETABLE
  INELIGIBLE
```

This slice consumes these fields but does not yet create production workflow
snapshots.

## Duplicate slots and reruns

Canonical observation selection uses:

```text
studyId + scheduledAt
```

Resolution precedence is:

1. schema-valid attempt;
2. higher completeness state;
3. higher workflow run attempt.

Superseded attempts remain in operational records but are excluded from
analytical pairing.

## Immutable and derived evidence

The replay input represents immutable observation facts. The replay produces
separate derived collections:

```text
adjacentComparisons
pairComparisons
residenceEpisodes
operationalRecords
```

No first-seen, previous-rank, entrant, exit, or residence field is written back
to an input snapshot.

## Residence episodes

Residence is continuous only when:

- the editorial identity remains displayed;
- the study segment remains unchanged;
- the gap does not exceed the configured maximum, initially 45 minutes.

The ledger records:

```text
episodeNumber
startedAt
lastObservedAt
endedAt
observationCount
leftCensored
rightCensored
```

A re-entry creates a new episode. Study start and study end are represented by
left and right censoring rather than invented residence durations.

## Offline replay certification

The certification sequence contains more than 100 observations and includes:

- stable rail observations;
- a new independently corroborated critical event;
- rail collapse to zero;
- source outage and partial rail;
- a missing scheduled observation;
- delayed execution;
- cluster split and merge;
- strong-identity conflict;
- representative source and headline substitution;
- duplicate scheduled slot and higher rerun attempt;
- identity-version boundary;
- ranker-version boundary.

The same input sequence must produce deeply equal replay output on repeated
execution. Deeply frozen inputs must be accepted without mutation.

## Explicit non-goals

This work does not add:

- GitHub Actions scheduling;
- artifact upload or retrieval;
- production snapshot acquisition;
- deployed-asset equivalence;
- production persistence or hysteresis;
- ranking threshold changes;
- automatic pass/fail stability decisions.

The next implementation gate is the stateless immutable snapshot runner and
study configuration, followed by workflow/artifact publication only after the
observation source is named accurately.
