# NW-RANK-012C — End-to-end trace relation ledger v3

## Mission boundary

NW-RANK-012C adds an immutable, deterministic relation ledger to each new Top Stories run snapshot:

```text
SANITIZED_SOURCE_EVIDENCE
  → RANKING_CANDIDATE
  → RANKED_POSITION
  → DISPLAYED_POSITION
```

The additive ledger schema is:

```text
nw-top-stories-trace-relations/v3
```

The run snapshot remains `nw-top-stories-run-snapshot/v1`. The evaluator trace remains `nw-top-stories-candidate-trace/v2`.

## Shared source-row authority

`listTopStorySourceRows()` in `topStoriesCandidates.js` is the single authority for rows consumed by candidate construction. It preserves the existing order and distinguishes:

- `section_items_array`;
- `section_items_object` with its section key;
- `top_feed_items`.

`buildTopStoryCandidatesWithTrace()` consumes this same listing function. The v3 ledger does not reconstruct source order independently.

## Stable identities

### Source evidence

A source group is identified from:

```text
source lane
+ source section key or null
+ SHA-256 digest of sanitized evidence
```

The ledger does not use source index, rank, time, workflow metadata, title alone, or randomness as source identity. Identical sanitized evidence in one lane and section is grouped with `occurrenceCount`. Identical evidence in different lanes or object sections remains distinct.

Sanitization reuses the repository replay evidence authorities. Bodies, content, HTML, secrets, tokens, authorization data, read state, and volatile candidate timestamps are not published.

### Candidate evidence

Candidate IDs reuse `getEditorialIdentityCandidateId()`:

```text
explicit id
→ canonical id
→ canonical URL
```

A candidate without one of these authorities fails snapshot construction with `TRACE_RELATION_CANDIDATE_ID_UNAVAILABLE`. No title, array index, rank, time, or random fallback is added.

### Position evidence

Positions use one-based deterministic IDs:

```text
ranked-position:<rank>
displayed-position:<displayRank>
```

These are positional identities only and never candidate or source identities.

## Published arrays

The validated ledger publishes:

```text
sourceEvidenceGroups[]
candidates[]
rankedPositions[]
displayedPositions[]
sourceCandidateEdges[]
sourceDispositionRecords[]
candidateRankEdges[]
candidateDispositionRecords[]
rankDisplayEdges[]
rankDispositionRecords[]
```

Every source occurrence is represented by positive integer multiplicity on a source edge or disposition. Every candidate is covered exactly once by a rank edge or candidate disposition. Every ranked position is covered exactly once by a display edge or rank disposition.

## Conservation proof

All values are derived from explicit records:

```text
rawInputCount
= Σ sourceEvidenceGroups.occurrenceCount
= Σ sourceCandidateEdges.occurrenceCount
  + Σ sourceDispositionRecords.occurrenceCount

candidateCount
= candidates.length
= candidateRankEdges.length
  + candidateDispositionRecords.length

rankedCount
= rankedPositions.length
= candidateRankEdges.length
= rankDisplayEdges.length
  + rankDispositionRecords.length

displayedCount
= displayedPositions.length
= rankDisplayEdges.length

accountingDelta = 0
accountingConserved = true
```

The validator also proves unique IDs, valid endpoints, exactly one promoted source occurrence per candidate, no orphan candidates or positions, no duplicate relations, positive multiplicity, contiguous one-based ranks, canonical array order, root count agreement, and exact ranked/displayed order agreement.

## Determinism and immutability

Each ledger array has an explicit canonical sort key. Serialization does not depend on incidental `Map`, object, or source-row iteration after grouping. Source permutation produces the same ledger when the evaluator output is unchanged.

The complete ledger, arrays, records, and sanitized nested evidence are deeply frozen. Inputs, evaluator output, traces, ranked rows, and displayed rows are not mutated.

## Snapshot publication

New snapshots retain all existing fields and add only:

```text
traceRelationSchemaVersion: nw-top-stories-trace-relations/v3
traceRelations: <validated ledger>
```

The ledger is built from the already validated repository input and the single existing evaluator result. No second ranker, selection, or display path is executed.

## Artifact-reader compatibility

Artifact validation returns:

```text
VALID           valid snapshot containing valid v3 evidence
MISSING_LEGACY  historical valid snapshot with neither v3 root field
NOT_APPLICABLE  failure artifact
INVALID         artifact with incomplete, unsupported, or corrupt v3 evidence
```

When either v3 root field is present, both are required. Unsupported schemas, malformed arrays, invalid endpoints, duplicate relations, conservation failures, root count mismatches, and projection mismatches fail closed.

Historical snapshots are not rewritten and remain valid as `MISSING_LEGACY`.

## Compatibility proof

For unchanged valid input, the shared source-row authority preserves deep equality of:

```text
rawInputCount
candidates
candidateBuildTrace
```

The snapshot integration preserves:

```text
scoredCandidates
admittedCandidates
selected
displayed
rankedIds
displayedTopNIds
candidateBuildTrace
selectionTrace
policySnapshot
normalizationDigest
editorialIdentityPopulation
funnel
```

The new ledger does not alter ranking weights, thresholds, windows, limits, tie-breaking, diversity, display depth, normalization, daily aggregation, operational validation, pilot decisions, workflows, UI, or production authorization.

## Certification coverage

Certification covers:

- one-row end-to-end relations;
- duplicate occurrence multiplicity;
- cross-lane source grouping;
- invalid primitive source disposition;
- strict candidate identity failure;
- admission and selection dispositions;
- ranked-not-displayed disposition;
- deterministic source permutation;
- deep immutability;
- sensitive-field exclusion;
- contiguous ranks and position identities;
- duplicate, orphan, endpoint, multiplicity, count, and conservation corruption;
- additive snapshot publication;
- evaluator-output preservation;
- byte-stable identical snapshots;
- artifact-reader `VALID`, `MISSING_LEGACY`, `NOT_APPLICABLE`, and fail-closed statuses.

## Non-goals

NW-RANK-012C does not:

- replace or migrate candidate trace v2;
- alter candidate construction semantics;
- change ranking, admission, selection, diversity, or display behavior;
- modify editorial-identity or normalization authorities;
- modify daily or pilot decisions;
- backfill historical artifacts;
- change workflows, packages, generated data, UI, browser behavior, deployment, or production authorization;
- begin the following roadmap mission.
