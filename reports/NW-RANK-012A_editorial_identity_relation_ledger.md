# NW-RANK-012A — Editorial-identity relation ledger v2

## Status

Implemented on the isolated `nw-rank-012a-editorial-identity-ledger-v2` branch for review. This mission remains analytical-only and does not authorize production ranking, browser, workflow, deployment, or pilot changes.

## Mission boundary

The implementation publishes the existing analytical relation:

```text
RANKING_CANDIDATE
→ identity disposition
→ EDITORIAL_IDENTITY
```

It does not add a `SOURCE_ROW` relation, construct candidates, change deduplication, alter identity-resolution precedence, rank stories, or project display output.

## Version contracts

Historical count-only evidence remains available through:

```text
nw-top-stories-editorial-identity-population/v1
```

New run snapshots publish:

```text
nw-top-stories-editorial-identity-population/v2
```

The v1 builder and its reason-count accounting semantics remain unchanged. Analytics accepts both versions and reports accounting by schema version so mixed evidence is not represented as one homogeneous contract.

## Stable candidate identity

The v2 ledger derives `candidateId` using this explicit authority order:

1. existing candidate `id`;
2. existing `canonicalId` or `canonical_id`;
3. the existing canonical URL normalization applied to `canonicalUrl`, `canonical_url`, `url`, or `link`.

The published ID is namespaced by authority. Title, array position, rank, display position, time, randomness, and editorial identity are not candidate-ID authorities. A candidate without an authorized stable value blocks publication with `EDITORIAL_IDENTITY_CANDIDATE_ID_UNAVAILABLE`.

## Published v2 records

Each population contains deterministic JSON-safe arrays:

- `candidates[]` — one record per ranking candidate;
- `editorialIdentities[]` — one record per distinct resolved editorial identity;
- `identityMembershipEdges[]` — one edge per resolved candidate;
- `identityDispositionRecords[]` — one record per ambiguous, conflict, or unavailable candidate.

Resolved candidates have exactly one membership edge. Ambiguous, conflict, and unavailable candidates have exactly one disposition record and no membership edge. A resolved state without a usable editorial identity or identity version fails closed.

## Shared-identity fan-in

Several candidates may resolve to one editorial identity. The ledger retains one editorial-identity record and one membership edge for every member candidate. `memberCandidateCount` must equal the number of referencing edges. No shared-identity reason count is used to repair arithmetic, and the ledger does not create new ranking candidates.

## Strict conservation

The validator derives conservation from explicit records and requires:

```text
candidateCount
= resolvedCandidateCount
+ ambiguousCandidateCount
+ conflictCandidateCount
+ unavailableCandidateCount
```

```text
resolvedCandidateCount = identityMembershipEdgeCount
```

```text
distinctEditorialIdentityCount = editorialIdentities.length
```

Every `candidateId` must occur once in `candidates[]` and once in exactly one of the membership or disposition arrays. Declared counts must equal record-derived counts. Duplicate IDs, duplicate edges, missing coverage, double coverage, foreign references, unknown states, and identity member-count mismatches block validation.

## Funnel integration

The existing funnel stage remains:

```text
populationRole = ANALYTICAL_SIDE_POPULATION
inputUnit = RANKING_CANDIDATE
outputUnit = EDITORIAL_IDENTITY
```

For v2 it publishes `membershipEdgeCount`, `dispositionCount`, `identityStateCounts`, and `accountingConserved` in addition to existing fields. Admission still consumes the unchanged scored-candidate population.

## Snapshot and analytics behavior

`buildTopStoriesRunSnapshot()` builds the v2 relation from the already identified scored candidates. The run-snapshot root schema is unchanged. Ranking inputs, `rankedIds`, `displayedTopNIds`, ranked records, and displayed records are not modified by the ledger.

Rail/funnel analytics validate v2 records before deriving candidate count, distinct identity count, resolved coverage, unresolved count, and conservation. Historical v1 analytics retain their prior count-based interpretation. Aggregated funnel stages and accounting summaries remain separated by population schema version.

## Certification scope

Focused certification covers:

- one resolved candidate;
- three candidates sharing one identity;
- ambiguous, conflict, and unavailable dispositions;
- mixed-state conservation;
- resolved-without-value and unknown-state blockers;
- stable candidate-ID authority and missing-ID blocker;
- duplicate candidate, edge, disposition, and identity-reference failures;
- missing, double, and foreign candidate coverage;
- member-count and declared-count mismatches;
- source-order permutation invariance;
- deep input immutability;
- v1 historical compatibility;
- v2 analytics and mixed-version separation;
- unchanged ranking and displayed ordering;
- static guards against reason-count conservation, fallback IDs, rank/display IDs, mutation, and subtraction helpers.

## Explicit non-goals preserved

- no source-row relation ledger;
- no candidate construction or duplicate-collapse redesign;
- no identity-resolution policy change;
- no ranker, classifier, selection, diversity, or display change;
- no normalization or trace-v3 work;
- no pilot-decision or workflow change;
- no generated/public data change;
- no browser or deployment parity claim;
- no production authorization.
