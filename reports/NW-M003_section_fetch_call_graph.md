# NW-M003 — Canonical section fetch lifecycle call graph

## Decision

`src/services/rssAggregator.js` is the canonical production section fetcher.

Reason: NW-M002 fixed the critical post-marker cleanup defect inside `fetchSectionNews()` by wrapping all code after `inFlightFetches.set(cacheKey, inFlightPromise)` with `withInFlightCleanup(...)`. The separate `rssSectionLifecycleFetcher.js` added another memory cache and another in-flight map, then delegated live fallback back to `rssAggregator.js`. That duplicated lifecycle state without adding a required production capability after NW-M002.

## Call graph after NW-M003

### Main dataset path

```text
useDataset('main')
  -> src/data/datasets/mainDataset.js
  -> loadSections()
  -> src/data/datasets/sectionsDataset.js
  -> fetchSectionNews() from src/services/rssAggregator.js
```

### Sections dataset path

```text
useDataset('sections')
  -> src/data/datasets/sectionsDataset.js
  -> fetchSectionNews() from src/services/rssAggregator.js
```

### NewsContext path

```text
src/context/NewsContext.jsx
  -> fetchSectionNews() from src/services/rssAggregator.js
```

### VirtualPaper path

```text
src/services/virtualPaperService.js
  -> fetchSectionNews() from src/services/rssAggregator.js
```

### Direct RSS fallback path

```text
src/services/rssAggregator.js
  -> static snapshot in Hybrid when allowed
  -> stale rows returned with stale metadata when usable
  -> static-host empty returned when live fallback is disabled
  -> live RSS / entertainment fallback when allowed
```

## Removed ambiguity

- Removed `src/services/rssSectionLifecycleFetcher.js`.
- `sectionsDataset.js` now imports `fetchSectionNews` directly from `rssAggregator.js`.
- `NewsContext` and `VirtualPaper` were already using `rssAggregator.js`.

## Lifecycle ownership

`rssAggregator.js` owns:

- memory cache for section news
- in-flight dedupe for section news
- Hybrid static snapshot path
- stale fallback with metadata
- Live-mode static snapshot bypass
- RSS / entertainment fallback
- post-marker cleanup via `withInFlightCleanup(...)`

`useDataset.js` owns dataset-envelope-level diagnostics only. It must not own section RSS cache or section in-flight state.

## Cert guardrails

`src/services/rssAggregator.lifecycle.cert.test.mjs` now verifies:

- cleanup helper clears markers on success and failure
- stale section snapshot fallback retains usable rows
- fetch diagnostics can report served path and phases
- `rssAggregator.js` has a cleanup wrapper immediately after the in-flight marker
- `sectionsDataset.js` imports the canonical `rssAggregator.js` path
- no `rssSectionLifecycleFetcher` source references remain

## Non-goals preserved

- No data-plane migration.
- No runtime mode switch redesign.
- No UI redesign.
- No generated data snapshot changes.
- No Main refactor.
- No weakening of NW-M001 freshness semantics.
- No weakening of NW-M002 cleanup guardrails.
- No weakening of Top Stories recency guardrails.
