# NW-RANK-012B — Normalization replay segmentation

## Mission

Enforce the published normalization version and digest as fail-closed analytical governance across observation pairing, sequential replay, daily evidence, operational validation, and seven-day pilot decisions.

## Governing contract

`normalizationVersion` is a behavioral-compatibility and replay-segment boundary. `normalizationDigest` is exact per-observation normalized-population evidence. Digest equality is not required for pairing.

The shared segment tuple is owned only by:

```text
src/services/topStories/topStoriesVersionSegment.js
```

Its fixed field order is:

```text
studyId
rankerVersion
identityVersion
periodClassifierVersion
normalizationVersion
```

The supported executable normalization contract remains:

```text
nw-top-stories-normalization-v1
```

## Study configuration

The authoritative study configuration now requires the supported `normalizationVersion`. The existing study ID, repository-snapshot replay mode, ranker version, identity version, period-classifier version, pilot dates, seven-day window, decision not-before timestamp, and expiry are unchanged.

Missing or incompatible normalization configuration fails closed. No CLI override is provided.

## Observation eligibility and pairing

An observation is analytically normalization-eligible only when it has:

- the supported normalization version;
- the expected configured normalization version;
- a valid SHA-256 hexadecimal digest.

The implementation emits explicit reasons for missing, unsupported, mismatched, or invalid normalization evidence. Same-version observations with different valid digests remain pairable. Cross-version pairs are rejected with `normalization_version_boundary` when the boundary prevents pair selection.

Pair horizon selection, distance ordering, source-order tie-breaking, canonical non-overlapping selection, and serial-correlation notice are preserved.

## Sequential replay and residence

All observations remain visible in canonical and adjacent diagnostic evidence. Invalid normalization evidence makes comparisons headline-ineligible and publishes explicit comparison eligibility reasons.

Active residence episodes close when:

- the normalization version changes;
- an invalid normalization observation intervenes;
- another existing segment boundary or maximum residence gap occurs.

An invalid observation cannot bridge an episode. A later valid observation begins a new episode.

Ranking evidence, editorial identities, period classification, display stability calculations, and replacement classification remain unchanged.

## Daily evidence

Daily aggregation now requires validated study configuration. It publishes:

- five-field `versionSegments`;
- normalization evidence coverage counts;
- explicit per-segment summaries;
- eligible comparison counts by segment;
- top-level headline-KPI eligibility and reason codes;
- normalization-related pair exclusion counts.

Operational and input manifests retain historical, invalid, and analytically excluded observations. Mixed normalization versions are represented additively as separate segment summaries and cannot be described as one homogeneous headline KPI.

## Operational validation

An observed day fails when normalization configuration or evidence is missing, unsupported, mismatched, malformed, mixed, incomplete, or headline-ineligible. Such a day cannot receive `PASS` or `PASS_WITH_WARNINGS`.

Existing operational thresholds and editorial-metric independence are preserved.

## Pilot decision

Every observed usable daily artifact must prove:

- the expected five-field segment;
- complete normalization evidence coverage;
- one homogeneous expected segment;
- headline-KPI eligibility.

Any normalization defect makes the day a `TECHNICAL_FAILURE`, and the final decision cannot become positively ready. The fixed dates, not-before timestamp, canonical artifact selection, thresholds, statistical methodology, and authorization flags remain unchanged.

## Current pilot validity impact

Historical daily evidence that omits normalization version, normalization digest coverage, five-field segment summaries, or headline eligibility remains inventory-visible but is analytically ineligible. It is not backfilled or silently repaired. A pilot decision built from such usable days fails closed and does not authorize production or automatic policy change.

## Certification coverage

Focused certification covers:

- shared five-field segment authority;
- required and incompatible study configuration;
- digest normalization and validation;
- same-version/different-digest pairing;
- cross-version pairing rejection;
- precise exclusion reasons;
- deterministic pairing and input immutability;
- invalid and version-boundary residence closure;
- daily normalization coverage and segment summaries;
- mixed-segment headline ineligibility;
- operational failure for each normalization defect class;
- pilot fail-closed behavior;
- fixed dates and decision not-before preservation;
- ranking, display, rail, funnel, and editorial-metric independence;
- static guards against fallbacks, duplicate segment tuples, digest-equality pairing, and CLI overrides.

## Scope controls

No normalization algorithm, digest contents, run-snapshot schema, historical artifact, generated data, ranking, candidate construction, identity resolution, period classification, UI, browser, deployment, workflow, pilot date, threshold, not-before timestamp, or production authorization was changed.
