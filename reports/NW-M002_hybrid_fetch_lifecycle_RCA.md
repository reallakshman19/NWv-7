# NW-M002 — Hybrid mode fetch lifecycle RCA and performance guardrails

## Mission

Investigate why Live mode can feel faster than Hybrid mode without changing the runtime mode architecture or migrating the data plane.

## Scope inspected

- `src/utils/fetchMode.js`
- `src/components/FetchModeToggle.jsx`
- `src/data/orchestrator/useDataset.js`
- `src/services/rssAggregator.js`
- `src/adapters/sectionsSnapshotFetcher.js`
- NW-M001 freshness contracts and static probe scripts

## Fetch-mode facts

`fetchMode.js` stores `nw_fetch_mode` in `localStorage`. Any value other than `live` resolves to `hybrid`; therefore Hybrid is the default. Live is an explicit opt-in.

`FetchModeToggle` clears the dataset envelope cache and reloads the page when the mode changes. This means switching to Live also clears stale app state, which can make Live feel faster even before source-fetch behavior is compared.

`useDataset.loadDataset()` treats Live as a forced load path via `effectiveForce = force || isLiveMode()`. In Hybrid, the dataset envelope cache and in-flight dedupe can be reused. This is correct for bandwidth, but without timing diagnostics it hides whether the result came from cache, loader, or an in-flight wait.

## Hybrid section fetch path

For `fetchSectionNews(section)`, Hybrid currently performs:

1. memory cache lookup
2. in-flight dedupe check
3. static snapshot attempt through `fetchPrefetchedSectionNews()`
4. snapshot freshness and item freshness checks
5. stale-with-rows fallback when allowed
6. static-host empty return when live fetch is blocked
7. live RSS fallback when allowed
8. ranking/filtering

## Live section fetch path

Live currently performs:

1. memory cache bypass
2. in-flight dedupe check
3. static snapshot bypass because the prefetched branch is guarded by `!isLiveMode()`
4. direct live RSS/entertainment service path
5. retry delay only after partial live feed failure
6. ranking/filtering

## Primary root causes

### RCA-1 — Hybrid can leave `inFlightFetches` stuck on static early returns

`rssAggregator.js` creates an in-flight marker before the static snapshot branch. Multiple static snapshot returns occur before the existing cleanup `finally` block in the later ranking path. This means a successful Hybrid static snapshot, stale fallback, static-host empty response, or entertainment early return can bypass cleanup and leave the section marked in-flight.

Impact:

- first Hybrid request may succeed
- later Hybrid request for the same section waits on an unresolved promise
- the caller can see slow or hung behavior
- Live feels faster because Live bypasses the static snapshot early-return branch and more often reaches cleanup

Status in this branch:

- Added `withInFlightCleanup()` helper and cert coverage for early-return and failure cleanup.
- Production `rssAggregator.js` still needs the large-file patch to wrap all post-marker returns with the helper.

### RCA-2 — Hybrid has snapshot fetch overhead before fallback

`sectionsSnapshotFetcher.loadSectionsSnapshot()` uses `?t=Date.now()`, `cache: 'no-store'`, and no-cache headers. This intentionally avoids stale browser cache, but it also prevents cheap browser reuse and adds a network request before any live fallback can happen.

### RCA-3 — Snapshot retry/backoff can dominate perceived latency

The snapshot loader retries with 2s, 4s, and 8s backoff slots. A missing or slow static snapshot can therefore delay fallback by several seconds before the app reaches live RSS.

### RCA-4 — Hybrid freshness gates do more work than Live

Hybrid validates snapshot freshness, story freshness, low-confidence timestamps, section aliases, stale fallback state, section quality, and ranking metadata before it returns. Live bypasses this static-gate work.

### RCA-5 — Loading-state perception is different

Switching to Live reloads the page and bypasses the dataset cache. Hybrid may reuse cached or in-flight state. Without served-path diagnostics, users cannot tell whether Hybrid is slow because it is loading, waiting on in-flight, rejecting stale snapshot rows, or falling back.

## Guardrails added in this branch

- Dataset envelope diagnostics now include `fetchLifecycle` with dataset id, fetch mode, served-from path, duration, and force state.
- Shared fetch lifecycle diagnostics helper defines served paths: `memory-cache`, `static-snapshot`, `stale-fallback`, `live-fallback`, `live-rss`, `empty`, and `error`.
- RSS lifecycle cert proves the cleanup helper clears markers on early return and failure paths.
- RSS lifecycle cert proves stale fallback retains usable rows from a stale section snapshot.
- RSS lifecycle cert proves diagnostics can report served path, phase timing, age, stale reason, and fallback reason.

## Required follow-up before merge if production patch is not included

Patch `fetchSectionNews()` so every code path after `inFlightFetches.set(cacheKey, inFlightPromise)` is inside one cleanup wrapper:

```js
return withInFlightCleanup(inFlightFetches, cacheKey, resolveInFlight, async () => {
  // static snapshot, stale fallback, static-host empty, live RSS, ranking, and errors
});
```

## Non-goals preserved

- No data-plane migration.
- No runtime mode redesign.
- No UI redesign.
- No generated data snapshot churn.
- No weakening of NW-M001 freshness semantics.
- No weakening of Main Top Stories recency guardrails.
