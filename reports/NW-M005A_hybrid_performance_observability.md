# NW-M005A — Hybrid performance observability bundle

## Mission

Make section fetch performance explainable end-to-end so Hybrid-vs-Live perceived speed can be diagnosed without changing fetch architecture.

## Canonical path

`src/services/rssAggregator.js` remains the canonical production section fetcher. `rssSectionLifecycleFetcher.js` remains removed.

This PR does not migrate the data plane, change runtime mode behavior, or redesign UI. It adds observability around the existing canonical path.

## Diagnostics fields surfaced

Section result arrays and section summaries can now carry:

- `fetchDiagnostics.servedFrom`
- `fetchDiagnostics.durationMs`
- `fetchDiagnostics.sectionFetchDurationMs`
- `fetchDiagnostics.fallbackReason`
- `fetchDiagnostics.snapshotBudgetExceeded`
- `fetchDiagnostics.snapshotElapsedMs`
- `fetchDiagnostics.snapshotBudgetMs`
- phase entries, including `hybrid-snapshot-budget-exceeded` and dataset-level `section-fetch`

Budget-exit fields are also copied to the returned array object by `attachFetchDiagnostics()` so existing array consumers continue to work while diagnostics remain discoverable.

## Budget-exit flow

```text
sectionsSnapshotFetcher.loadSectionsSnapshot()
  -> throws snapshot-budget-exceeded with elapsedMs/budgetMs
fetchPrefetchedSectionNews()
  -> records per-section budget exit
rssAggregator.fetchSectionNews()
  -> continues existing static-host empty or live RSS fallback behavior
sectionsDataset.load()
  -> consumes per-section budget exit
  -> attaches diagnostics to returned section result
  -> includes section summary and aggregate performance summary
```

## Section-level aggregate summary

`sectionsDataset.js` now adds:

```text
data.performanceSummary.totalSectionFetchDurationMs
data.performanceSummary.slowestSection
data.performanceSummary.servedFromCounts
data.performanceSummary.fallbackReasonCounts
data.performanceSummary.snapshotBudgetExitCount
```

This makes it possible to answer:

- Which section was slowest?
- Did rows come from snapshot, stale fallback, live fallback, live RSS, or empty?
- Did snapshot budget exits occur?
- Which fallback reasons dominated a load?

## Hybrid/Live paths covered

### Hybrid snapshot success

When `rssAggregator.js` returns a prefetched array, the sections dataset infers `static-snapshot` unless stale metadata indicates `stale-fallback`.

### Hybrid stale-with-rows

Existing stale-row behavior is preserved. Stale rows remain returned and labelled through existing `staleReason`, `prefetched`, `sectionQuality`, and `snapshotRuntimeSummary` metadata.

### Hybrid snapshot budget exceeded with live fallback

If the adapter records `snapshot-budget-exceeded` and `rssAggregator.js` returns rows, the sections dataset attaches:

- `servedFrom: 'live-fallback'`
- `fallbackReason: 'snapshot-budget-exceeded'`
- `snapshotBudgetExceeded: true`
- elapsed/budget fields
- phase `hybrid-snapshot-budget-exceeded`

### Hybrid snapshot budget exceeded with empty/static-host result

If the adapter records `snapshot-budget-exceeded` and `rssAggregator.js` returns an empty result, the sections dataset attaches:

- `servedFrom: 'empty'`
- `fallbackReason: 'snapshot-budget-exceeded'`
- `snapshotBudgetExceeded: true`
- elapsed/budget fields
- phase `hybrid-snapshot-budget-exceeded`

### Live mode

Live mode still bypasses the static snapshot branch in `rssAggregator.js` through the existing `!isLiveMode()` guard. No runtime mode behavior is changed.

## Implementation notes

Direct full-file replacement of `rssAggregator.js` is high risk because the file is large and previous connector attempts produced broad unrelated churn. This PR therefore keeps `rssAggregator.js` canonical and unchanged, while surfacing end-to-end section observability at the adapter and dataset boundary.

## Cert guardrails

`src/services/rssAggregator.lifecycle.cert.test.mjs` now verifies:

- snapshot budget constants and abort/budget enforcement remain present
- stale-with-rows fallback still returns usable rows
- Live mode still bypasses snapshot
- `rssAggregator.js` remains canonical
- `withInFlightCleanup(...)` remains immediately after `inFlightFetches.set(...)`
- budget-exit diagnostics are surfaced
- aggregate performance summary fields exist
- no generated `public/newsdata/*` or `public/data/*` snapshot files are included

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
- No weakening of NW-M004 foreground budget.
- No weakening of Top Stories recency guardrails.
