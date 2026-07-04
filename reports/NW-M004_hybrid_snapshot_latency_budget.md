# NW-M004 — Hybrid snapshot latency budget and fallback guardrails

## Mission

Add a measurable foreground Hybrid snapshot latency budget so stale, missing, or slow static section snapshots cannot dominate perceived section-load time before the canonical section fetcher falls back or returns a safe static-host empty result.

## Files audited

- `src/adapters/sectionsSnapshotFetcher.js`
- `src/services/rssAggregator.js`
- `src/services/fetchLifecycleDiagnostics.js`
- `src/services/rssAggregator.lifecycle.cert.test.mjs`
- `.github/workflows/data_freshness_contracts.yml`
- sections snapshot freshness cert coverage through the RSS lifecycle cert

## Current behavior before NW-M004

`loadSectionsSnapshot()` used a foreground path with:

```js
const backoffs = [2000, 4000, 8000];
```

Because the loop sleeps after failed attempts before the final attempt, the retry sleep budget alone could add 6 seconds before the caller escaped the snapshot path. The fetch itself had no `AbortController` timeout, so a slow or hanging browser fetch could extend perceived delay beyond those sleeps.

## Answers to required questions

### 1. Current maximum delay before `fetchSectionNews()` can escape Hybrid snapshot path

Before this patch, the maximum was not reliably bounded because each snapshot `fetch()` could hang or take browser/network timeout duration. In addition, the explicit retry sleeps could add 2s + 4s before the final failure path.

### 2. Retry/backoff behavior applied to foreground UI loads

Foreground UI loads call `fetchSectionNews()` in `rssAggregator.js`, which calls `fetchPrefetchedSectionNews()`, which calls `loadSectionsSnapshot()` with default behavior. Therefore the same retry/backoff behavior applied to user-facing section loads.

### 3. Static-host-only versus live-fallback-capable paths

`rssAggregator.js` remains canonical. In Hybrid mode it tries static snapshot first. If `getRuntimeCapabilities().allowWideFeedFetch` is false, stale/empty or unavailable snapshots return the existing prefetched empty/static-host result. If wide feed fetch is allowed, the snapshot failure path proceeds to live RSS fallback. Live mode bypasses the snapshot path through the existing `!isLiveMode()` guard.

### 4. Can missing/slow/stale+empty snapshot block Live RSS fallback longer than intended budget?

Before this patch, yes. Missing or slow snapshot fetches could hold the foreground path through retries and browser fetch waits before live fallback became reachable. Stale+empty snapshots that load quickly still route according to static-host capability and are not the slow case.

### 5. Foreground Hybrid budget decision

The foreground budget is **1500 ms**.

Rationale:

- It leaves room for one network attempt plus short retry windows.
- It is short enough to keep Main/Sections from feeling slower than Live solely due to static snapshot probing.
- It preserves static-first behavior when snapshots are available quickly.
- It does not weaken freshness or stale-row rules.

## Implementation

`src/adapters/sectionsSnapshotFetcher.js` now exports:

- `SECTION_SNAPSHOT_FOREGROUND_BUDGET_MS = 1500`
- `SECTION_SNAPSHOT_RETRY_BACKOFF_MS = [250, 500]`

`loadSectionsSnapshot()` now accepts `budgetMs` and applies it as the default foreground budget. Each fetch attempt uses `AbortController` with the remaining budget. When the budget is exhausted, the adapter throws an error with:

- `code = 'snapshot-budget-exceeded'`
- `elapsedMs`
- `budgetMs`

The canonical `rssAggregator.js` catch path already handles snapshot failures by either returning static-host empty when live RSS is disabled or falling through to live RSS when live fallback is allowed.

## Preserved behavior

- Static snapshot freshness validation remains intact.
- Stale-with-rows fallback still returns usable rows with stale metadata.
- Top Stories snapshot staleness guard remains intact.
- Live mode still bypasses static snapshots.
- `rssAggregator.js` remains the canonical section fetcher.
- `withInFlightCleanup(...)` remains the post-marker cleanup wrapper.

## Cert guardrails

`src/services/rssAggregator.lifecycle.cert.test.mjs` now verifies:

- foreground snapshot budget is explicit and set to 1500 ms
- retry backoff total is below the foreground budget
- `AbortController` is used for budget enforcement
- old `[2000, 4000, 8000]` foreground backoff is gone
- `snapshot-budget-exceeded` is emitted by the adapter
- stale-with-rows fallback still returns usable rows
- Live mode still bypasses static snapshot
- `rssAggregator.js` cleanup wrapper remains immediately after in-flight marker
- `rssAggregator.js` remains canonical for `sectionsDataset.js`
- no generated `public/newsdata/*` or `public/data/*` churn is expected

## Non-goals preserved

- No data-plane migration.
- No runtime mode switch redesign.
- No UI redesign.
- No generated snapshot data committed.
- No Main refactor.
- No weakening of NW-M001 freshness semantics.
- No weakening of NW-M002 cleanup guardrails.
- No weakening of NW-M003 canonical path.
- No weakening of Top Stories recency guardrails.
