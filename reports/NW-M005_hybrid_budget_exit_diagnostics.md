# NW-M005 — Hybrid budget-exit diagnostics

## Mission

Surface foreground Hybrid snapshot budget exits into returned section results and the sections dataset envelope without changing fetch architecture.

## Context

NW-M004 added a 1500 ms foreground snapshot budget in `sectionsSnapshotFetcher.js`. Budget exhaustion throws an adapter error with:

- `code = 'snapshot-budget-exceeded'`
- `elapsedMs`
- `budgetMs`

Before NW-M005, this error could cause the canonical `rssAggregator.js` to fall back correctly, but the sections dataset envelope did not preserve the budget-exit reason in its returned section summary diagnostics.

## Implementation decision

`rssAggregator.js` remains canonical and unchanged in this PR. The safe surface point is the boundary where `sectionsDataset.js` consumes the canonical section result.

The adapter now records a per-section budget-exit event only when `fetchPrefetchedSectionNews()` observes `snapshot-budget-exceeded`. The sections dataset consumes that event immediately after `fetchSectionNews()` returns and attaches a standard fetch diagnostic envelope to the returned array.

## Diagnostics fields surfaced

When a section snapshot exits by budget, returned section arrays/summaries can now include:

- `fallbackReason: 'snapshot-budget-exceeded'`
- `snapshotBudgetExceeded: true`
- `snapshotElapsedMs`
- `snapshotBudgetMs`
- phase: `hybrid-snapshot-budget-exceeded`
- `servedFrom: 'live-fallback'` when rows are returned
- `servedFrom: 'empty'` when no rows are returned

The sections dataset validation warnings also include budget-exit summaries as warnings.

## Paths covered

### Live fallback allowed

```text
sectionsDataset.load()
  -> fetchSectionNews() from rssAggregator.js
  -> fetchPrefetchedSectionNews() records snapshot-budget-exceeded
  -> rssAggregator.js falls back to live RSS
  -> sectionsDataset consumes budget event
  -> returned section summary has live-fallback diagnostics
```

### Static-host / live disabled empty path

```text
sectionsDataset.load()
  -> fetchSectionNews() from rssAggregator.js
  -> fetchPrefetchedSectionNews() records snapshot-budget-exceeded
  -> rssAggregator.js returns existing safe empty prefetched result
  -> sectionsDataset consumes budget event
  -> returned section summary has empty diagnostics
```

### Stale rows available

If the snapshot loads and stale rows are available, no budget error is emitted. Existing stale-with-rows behavior is preserved and rows remain labelled through the existing stale metadata.

## Files changed

- `src/adapters/sectionsSnapshotFetcher.js`
- `src/data/datasets/sectionsDataset.js`
- `src/services/fetchLifecycleDiagnostics.js`
- `src/services/rssAggregator.lifecycle.cert.test.mjs`

## Guardrails

The lifecycle cert now checks:

- snapshot budget fields can be attached by `fetchLifecycleDiagnostics.js`
- adapter records/exports budget-exit consumption support
- sections dataset attaches budget-exit diagnostics
- live fallback and empty served paths are represented
- stale-with-rows fallback still returns usable rows
- Live mode still bypasses static snapshot
- `rssAggregator.js` remains canonical
- `withInFlightCleanup(...)` remains immediately after `inFlightFetches.set(...)`
- no generated `public/newsdata/*` or `public/data/*` snapshot churn is expected

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

## Limitation

This PR surfaces budget exits at the sections dataset/envelope boundary. Direct `NewsContext` and `VirtualPaper` callers still use canonical `rssAggregator.js` results as-is. A direct aggregator instrumentation patch can be added later if a safe small patch mechanism is available for the large aggregator file.