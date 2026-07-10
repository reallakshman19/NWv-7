# NW-RANK-004 — Top Stories owner audit harness and golden review snapshot

## Mission
Add an owner/auditor review harness that produces a deterministic golden review snapshot from the existing Top Stories regression fixtures and explainability helpers.

## What changed
- Added `src/services/topStories/topStoriesAuditHarness.js` with pure named exports:
  - `buildTopStoriesAuditSnapshot(input, options)`
  - `buildTopStoriesGoldenReviewSnapshot()`
  - `compareTopStoriesAuditSnapshots(actual, expected)`
  - `summarizeTopStoriesAuditSnapshot(snapshot)`
- Added `src/services/topStories/fixtures/topStoriesGoldenReviewSnapshot.js` as a committed deterministic owner-review snapshot.
- Added `src/services/topStories/topStoriesAuditHarness.cert.test.js` for comparison drift detection, golden snapshot matching, fixture evidence coverage, immutability, and no-browser/no-network assertions.

## Golden snapshot contract
The golden review snapshot contains:

```text
fixtureVersion
fixtureTimestamp
rankedIdsInOrder
slotBandCounts
eventTypeCounts
topFeedBoostedIds
penalizedIds
rejectedExpiredIds
duplicateClusterRepresentatives
explanationRows
```

Explanation rows include only stable auditor-readable fields:

```text
rank
id
title
score
slotBand
eventType
freshnessScore
consensusScore
penalties
sourceCount
topFeedHits
clusterKey
nonPrimaryReason
```

The committed snapshot is static fixture data. It does not read live feeds, generated public data, or runtime browser state.

## Comparison behavior
`compareTopStoriesAuditSnapshots(actual, expected)` returns:

```js
{
  ok,
  errors,
  warnings,
  actualSummary,
  expectedSummary
}
```

It reports errors for:

```text
ranked ID order drift
slot band count drift
event type count drift
top-feed boosted ID drift
penalized ID drift
rejected/expired ID drift
duplicate-cluster representative drift
missing required explanation fields
explanation row count drift
```

It reports warnings for optional metadata drift such as fixture version/timestamp differences.

## Tests / validation
Required validation commands:

```bash
npx vitest run src/services/topStories/topStoriesAuditHarness.cert.test.js
npx vitest run src/services/topStories/topStoriesExplainability.cert.test.js
npx vitest run src/services/topStories/topStoriesRanker.cert.test.js
node src/viewModels/useMainTabViewModel.recency.cert.test.mjs
npm run lint
npm run test:unit
```

Connector-session status:

```text
Not locally executed in this connector-only patching session.
GitHub PR checks are the merge-gate source of truth.
```

## Scope compliance
- Runtime ranker authority changed: no
- Score formula changed: no
- Browser live RSS fetch introduced: no
- Generated public/newsdata changed: no
- Package files changed: no
- Workflow files changed: no
- Buzz / Up Ahead / Data Health touched: no
- ViewModel or dataset runtime changed: no
- New Top Stories ranker introduced: no

## Stop conditions encountered
None.

## Auditor note
NW-RANK-004 is an audit/review harness only. It imports the existing ranker, explainability helpers, and static regression fixtures to build and compare deterministic review snapshots. It does not change `rankTopStories`, score weights, slot selection, event classification, top-feed signal scoring, live RSS, generated data, package files, workflows, ViewModel, datasets, Buzz, Up Ahead, or Data Health.
