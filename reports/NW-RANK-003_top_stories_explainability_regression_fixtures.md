# NW-RANK-003 — Top Stories explainability and regression fixture pack

## Mission
Add an auditable Top Stories explainability and regression fixture pack so owner/auditors can inspect why a story ranked where it ranked without changing runtime ranking authority, browser fetch behavior, generated data, package files, workflows, Buzz, Up Ahead, or Data Health schema.

## What changed
- Added `src/services/topStories/topStoriesExplainability.js` with pure named exports:
  - `explainRankedTopStory(story)`
  - `explainTopStoriesList(stories)`
  - `summarizeTopStoriesRegressionRun(stories)`
  - `getTopStoryAuditFields(story)`
- Added `src/services/topStories/fixtures/topStoriesRegressionFixtures.js` with static regression fixtures.
- Added `src/services/topStories/topStoriesExplainability.cert.test.js` to certify deterministic explanations, immutability, fixture coverage, and local/no-network behavior.

## Fixture catalog
The regression fixture pack covers:

```text
fresh-hard-alert                 fresh public-interest hard-news alert
secondary-hard-news              older but still secondary-window hard-news story
fallback-hard-news               8–12h fallback-window story
stale-expired-story              beyond fallback window
low-confidence-story             low timestamp-confidence story
god-of-war-promo                 entertainment promo false-positive guard
clustered-duplicate-a/b          clustered duplicate story pair
source-diverse-top-feed          source-diverse top-feed boosted story
same-source-top-feed-spam        same-source top-feed spam story
local-public-alert               local/regional public alert
```

The fixtures are static JS objects, not generated data files, and do not import runtime or browser modules.

## Explanation fields
The explainability helper reads existing `_topStoryRank` metadata and stable story fields only. It does not recompute score or alter ordering.

Auditor-facing fields include:

```text
id
title
source
section
publishedAt
score
slotBand
eventType
freshnessScore
publicInterestScore
consensusScore
breakingLiveScore
penalties
timestampConfidence
ageHours
sourceCount
topFeedHits
clusterKey
nonPrimaryReason
highlights
explanation
```

## Behavior delivered
- Explanation output is deterministic for the same ranked input.
- List explanations preserve `rankTopStories` order.
- Summary output preserves ranked IDs in order and aggregates slot bands/event types.
- Stale/expired and low-confidence stories explain why they are not primary.
- Entertainment promo fixtures show promo classification and penalty.
- Top-feed boosted fixture shows bounded top-feed contribution.
- Same-source top-feed spam fixture shows capped consensus behavior.
- Clustered duplicate fixture explains only one selected cluster representative.
- Input story objects are not mutated.
- No browser/network primitive is introduced.

## Tests / validation
Required validation commands:

```bash
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
- Generated files changed: no
- Package files changed: no
- Workflow files changed: no
- Buzz / Up Ahead / Data Health touched: no
- New ranker introduced: no
- Runtime ranking redesign introduced: no

## Stop conditions encountered
None.

## Auditor note
NW-RANK-003 is intentionally read-only over ranking metadata. It provides explanations and fixtures for auditability but does not change `rankTopStories`, score weights, slot selection, event classifier behavior, top-feed scoring, rssAggregator, dataset loading, or ViewModel behavior.
