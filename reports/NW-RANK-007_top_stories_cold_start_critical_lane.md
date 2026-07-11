# NW-RANK-007 — Top Stories cold-start critical lane and evidence audit

## Mission
Add a narrow, deterministic cold-start critical lane so a very fresh, trusted, high-severity single-source story can enter the Top Stories Top-3 without requiring consensus, top-feed evidence, or cluster evidence.

## What changed
- Added an explicit `ageMinutes` signal in `src/services/topStories/topStoriesSignals.js`.
- Added a cold-start critical signal in `src/services/topStories/topStoriesRanker.js`.
- Added priority bucket metadata to scored Top Stories candidates:
  - `priorityBucket`
  - `priorityBucketLabel`
  - `coldStartCritical`
  - `ageMinutes`
  - `sourceQualityScore`
- Updated ranked candidate sorting so priority bucket is evaluated before score, then freshness, then stable deterministic tie-breakers.
- Added certification coverage in `src/services/topStories/topStoriesRanker.cert.test.js`.

## Cold-start lane rule
The cold-start critical lane is intentionally narrow. A story must satisfy all of the following:

```text
ageMinutes <= 15
timestampConfidence === high
sourceQualityScore >= 0.75
publicInterestScore >= 0.9
eventType in [public_safety, disaster, war_conflict, civic_alert]
eventType !== entertainment_promo
```

The lane does not require:

```text
sourceCount > 1
topFeedHits > 0
clusteredItems > 1
```

This lets a very fresh, trusted, high-severity single-source alert surface quickly while preventing routine, promo, stale, and low-confidence rows from using the lane.

## Priority bucket behavior
The ranking comparator now evaluates:

```text
priority bucket first
score second
freshness third
published timestamp fourth
stable dedupe key last
```

Bucket behavior:

```text
cold-start-critical => higher priority bucket
standard => normal priority bucket
```

The score formula itself remains unchanged. The lane is a priority-bucket adjustment before the existing score and slot-selection flow.

## Tests / validation
Required validation commands:

```bash
npx vitest run src/services/topStories/topStoriesRanker.cert.test.js
npx vitest run src/services/topStories/topStoriesExplainability.cert.test.js
npx vitest run src/services/topStories/topStoriesAuditHarness.cert.test.js
npx vitest run src/services/topStories/topStoriesAuditAdapter.cert.test.js
node src/viewModels/useMainTabViewModel.recency.cert.test.mjs
npm run lint
npm run test:unit
```

Connector-session status:

```text
Not locally executed in this connector-only patching session.
GitHub PR checks are the merge-gate source of truth.
```

Certification coverage added:

```text
very fresh trusted single-source public_safety story can enter Top-3
very fresh trusted single-source disaster story can enter Top-3
consensus is not mandatory for age <= 15 minute critical events
topFeedHits is not mandatory for the cold-start lane
low-confidence timestamp cannot use the cold-start lane
entertainment_promo cannot use the cold-start lane
routine_business cannot use the cold-start lane
stale/older-than-window story cannot use the cold-start lane
existing 0–4h / 0–8h / fallback tests remain active
rankTopStories remains deterministic
no browser/network primitive appears in Top Stories modules
```

## Scope compliance
- Runtime ranker authority changed: no
- Score formula changed: no
- Priority bucket behavior changed: yes, narrowly for cold-start critical stories
- Browser live RSS fetch introduced: no
- Generated public/newsdata changed: no
- Package files changed: no
- Workflow files changed: no
- Buzz / Up Ahead / Data Health touched: no
- ViewModel or dataset runtime changed: no
- User-facing UI changed: no

## Stop conditions encountered
None.

## Auditor note
This mission deliberately avoids ViewModel, dataset, live RSS, generated-data, workflow, package, and UI changes. The only runtime behavior change is inside the existing `rankTopStories` authority: a very narrow cold-start priority bucket for fresh, trusted, high-severity events that already classify as public-interest critical stories.
