# NW-RANK-002 — Top Stories dedicated top-feed snapshot signals

## Mission
Add a deterministic, snapshot-safe top-feed signal layer for Top Stories without browser live RSS fetching and without changing generic section ranking, Buzz, Up Ahead, Data Health, generated data, or package files.

## What changed
- Added `src/services/topStories/topStoriesTopFeedSignals.js` with pure named exports for top-feed snapshot normalization, signal-map construction, story signal merge, identity resolution, and signal explanation.
- Delegated `buildTopFeedSignalMap()` in `src/services/topStories/topStoriesSignals.js` to the new snapshot normalizer while preserving `rankTopStories(input.topFeedItems)` compatibility.
- Added optional `topFeedItems` / `topFeedSnapshot` handling in `src/data/datasets/sectionsDataset.js`, passing normalized snapshot evidence into the existing `rankTopStories` input contract when supplied.
- Added `src/services/topStories/topStoriesTopFeedSignals.cert.test.js` for deterministic snapshot signal behavior.
- Extended `src/services/topStories/topStoriesRanker.cert.test.js` with bounded top-feed signal ranking guardrails.

## Signal contract
Supported snapshot row fields:

```js
{
  id,
  url,
  link,
  canonicalId,
  title,
  source,
  sourceGroup,
  publishedAt,
  observedAt,
  topFeedRank,
  topFeedSource,
  clusterKey
}
```

Identity priority:

```text
canonicalId → id → normalized url/link → normalized title
```

Normalized signal fields supplied to the existing ranker path:

```text
topFeedHits
topFeedConsensusScore
topFeedRankScore
topFeedSourceCount
topFeedSources
topFeedBestRank
normalizedIdentity
```

## Behavior delivered
- Invalid/empty snapshot rows are filtered safely.
- Duplicate same-source evidence is capped and cannot scale linearly.
- Source-diverse top-feed evidence produces stronger bounded consensus than duplicate same-source spam.
- Signal maps support `id`, `canonicalId`, normalized `url` / `link`, and title identity.
- Input snapshot rows and candidate stories are not mutated.
- Strong top-feed evidence can boost an otherwise equivalent qualified hard-news story.
- Top-feed evidence alone cannot resurrect stale/low-confidence stories into primary slots.
- Top-feed evidence alone cannot make an entertainment promo outrank active public-interest hard news.
- Empty/missing `topFeedItems` preserves deterministic bounded NW-RANK-001 behavior.
- `rankTopStories` remains the final Top Stories authority.

## Tests / validation
Validation commands required for PR review:

```bash
npx vitest run src/services/topStories/topStoriesTopFeedSignals.cert.test.js
npx vitest run src/services/topStories/topStoriesRanker.cert.test.js
node src/viewModels/useMainTabViewModel.recency.cert.test.mjs
npm run lint
npm run test:unit
```

Connector-session status:

```text
Not locally executed in this connector-only patching session.
GitHub PR checks must be treated as the source of truth before merge.
```

## Scope compliance
- Browser live RSS fetch introduced: no
- Generic rssAggregator changed: no
- Runtime ranker authority changed: no
- Generated files changed: no
- Package files changed: no
- Buzz / Up Ahead / Data Health touched: no
- Workflow files changed: no
- `rankTopStories` replaced by a second ranker: no

## Stop conditions encountered
None.

## Auditor note
`sectionsDataset.js` only passes normalized `options.topFeedItems` / `options.topFeedSnapshot` into the existing `rankTopStories` input contract when supplied. It does not generate snapshots, alter `public/newsdata`, or add workflow ingestion.
