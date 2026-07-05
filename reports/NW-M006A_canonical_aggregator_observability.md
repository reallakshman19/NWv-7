# NW-M006A — Canonical aggregator observability and live RSS latency budget

## Mission

Make the canonical `rssAggregator.js` section fetch path observable for all direct callers, and prevent live RSS/proxy fetches from becoming the next unbounded latency source.

## Canonical path decision

`src/services/rssAggregator.js` remains the canonical production section fetcher.

This PR does not rewrite or split `rssAggregator.js`. Instead, it instruments the existing canonical path through helpers already imported by the aggregator:

- `withInFlightCleanup(...)` in `fetchLifecycleDiagnostics.js`
- `proxyManager.fetchViaProxy(...)` in `proxyManager.js`

This avoids broad churn in the large aggregator file while making post-marker canonical fetch results observable for direct callers.

## Live RSS/proxy latency budget

Budget value:

- `LIVE_RSS_PROXY_BUDGET_MS = 6000`
- `LIVE_RSS_PROXY_ATTEMPT_TIMEOUT_MS = 2000`

Enforced in:

- `src/services/proxyManager.js`

Behavior:

- Each proxy feed fetch now runs under a 6s overall proxy budget.
- Each individual proxy attempt is capped at 2s or the remaining budget, whichever is smaller.
- Budget exits throw an error carrying `code = 'live-rss-budget-exceeded'`, `proxyFallbackReason`, `liveRssDurationMs`, `liveRssBudgetMs`, and `timedOutFeedCount`.

## Diagnostics fields added to canonical result arrays

For post-marker `fetchSectionNews()` paths wrapped by `withInFlightCleanup(...)`, returned arrays can carry:

- `servedFrom`
- `fetchMode`
- `durationMs`
- `phases`
- `fallbackReason`
- `snapshotBudgetExceeded`
- `snapshotElapsedMs`
- `snapshotBudgetMs`
- `liveRssAttempted`
- `liveRssDurationMs`
- `failedFeedCount`
- `successfulFeedCount`
- `timedOutFeedCount`
- `proxyFallbackReason`
- `sectionFetchDurationMs`

Diagnostics are attached as properties on arrays, preserving existing array consumers.

## Phase vocabulary

The canonical diagnostics helper now defines the required phase vocabulary:

- `memory-cache-hit`
- `in-flight-wait`
- `hybrid-static-snapshot-start`
- `hybrid-static-snapshot-hit`
- `hybrid-stale-fallback`
- `hybrid-snapshot-budget-exceeded`
- `static-host-empty`
- `live-rss-start`
- `live-rss-feed-settled`
- `live-rss-timeout`
- `ranking-start`
- `ranking-complete`
- `ranking-fallback`

Because this mission avoids rewriting `rssAggregator.js`, the helper emits inferred phases for post-marker result paths. Pre-marker memory-cache and in-flight paths remain in the phase vocabulary and should be instrumented directly in `rssAggregator.js` later through a safe patch workflow.

## Direct callers covered

`NewsContext` and `VirtualPaper` continue importing `fetchSectionNews()` from canonical `rssAggregator.js`. Since `withInFlightCleanup(...)` decorates post-marker result arrays inside the canonical path, direct callers receive those diagnostics without rerouting through another fetcher.

## Paths covered

### Hybrid static snapshot hit

`rssAggregator.js` returns a prefetched non-stale array. The helper infers `servedFrom: 'static-snapshot'` and phase entries `hybrid-static-snapshot-start` / `hybrid-static-snapshot-hit`.

### Hybrid stale fallback

`rssAggregator.js` returns a prefetched stale array with rows. The helper infers `servedFrom: 'stale-fallback'` and keeps stale rows intact.

### Hybrid snapshot budget exit to live fallback

`sectionsSnapshotFetcher.js` records `snapshot-budget-exceeded`; `rssAggregator.js` continues existing live fallback; `withInFlightCleanup(...)` consumes the budget-exit event and attaches live-fallback diagnostics.

### Static-host empty

When the result is empty after a budget exit or static-host-disabled live fallback, diagnostics report `servedFrom: 'empty'` and static-host empty phase metadata where observable.

### Live mode

Live mode still bypasses the Hybrid static snapshot branch through the existing `!isLiveMode()` guard in `rssAggregator.js`. Post-marker live RSS results receive `servedFrom: 'live-rss'`, live RSS timing, and phase diagnostics.

## Cert guardrails

The lifecycle cert now verifies:

- stale-with-rows still returns usable rows
- Live mode still bypasses static snapshot
- `rssAggregator.js` remains canonical for sections dataset
- `NewsContext` and `VirtualPaper` still import canonical `rssAggregator.js`
- `rssSectionLifecycleFetcher.js` is not reintroduced
- `withInFlightCleanup(...)` remains immediately after `inFlightFetches.set(...)`
- snapshot budget constants remain explicit
- live RSS/proxy budget constants remain explicit
- required phase names remain present
- budget-exit diagnostics are surfaced
- aggregate performance summary remains present
- no generated `public/newsdata/*` or `public/data/*` snapshot churn is expected

## Limitations

This PR does not directly edit the large `rssAggregator.js` body. Therefore:

- post-marker canonical paths are decorated through `withInFlightCleanup(...)`
- proxy budget is enforced at `proxyManager.js`
- pre-marker memory-cache and in-flight wait returns are not deeply timed inside `rssAggregator.js` yet

A future patch-capable workflow can add exact in-function phase timings for those pre-marker branches without replacing the large file.

## Non-goals preserved

- No data-plane migration.
- No runtime mode switch redesign.
- No UI redesign.
- No generated snapshot data committed.
- No broad Main refactor.
- No reintroduction of `rssSectionLifecycleFetcher.js`.
- No weakening of NW-M001 freshness semantics.
- No weakening of NW-M002 cleanup guardrails.
- No weakening of NW-M003 canonical path.
- No weakening of NW-M004 snapshot budget.
- No weakening of Top Stories recency guardrails.
