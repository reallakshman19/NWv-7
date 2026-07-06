# NW-DP-020 — Up Ahead Edge Diagnostics Data Health Summary

## Mission statement

NW-DP-020 pins the latest Up Ahead edge API diagnostics into the Up Ahead dataset card in Data Health so operators can see source, reason, freshness, and age without searching the recent diagnostics feed, while preserving existing diagnostics list/export behavior and without changing dataset loading, Worker behavior, generated data, or deployment automation.

## Files changed

- `src/components/DataHealthPanel.jsx`
- `src/components/DataHealthPanel.cert.test.jsx`
- `scripts/test_up_ahead_edge_data_health_summary_static.mjs`
- `reports/NW-DP-020_up_ahead_edge_data_health_summary.md`

## Current gap

NW-DP-019 made diagnostics details visible in the recent diagnostics feed. That still required operators to find `upAheadDataset.api_edge_diagnostics` inside the recent diagnostics list, which only shows the last 20 events.

Operators need a stable summary pinned inside the `upAhead` dataset card.

## UI behavior

`DataHealthPanel.jsx` now derives the latest diagnostics event for:

```text
upAheadDataset.api_edge_diagnostics
```

When details exist, the `upAhead` dataset card shows a compact `Edge API` summary with:

```text
Source
Reason
Freshness
Age seconds
```

The summary is rendered only on the `upAhead` dataset card.

## Recent diagnostics behavior

The recent diagnostics feed keeps the generic diagnostics detail rendering from NW-DP-019. Operators can still inspect the underlying event details in the feed while also seeing the latest edge metadata pinned to the dataset card.

## Export behavior

The export payload remains unchanged and still includes:

```text
exportedAt
diagnostics
datasets
```

Existing dataset summary fields remain present.

## Compatibility behavior

- Existing cache summary fields remain intact.
- Existing clear diagnostics button remains intact.
- Existing export JSON button remains intact.
- Existing recent diagnostics list behavior remains intact.
- Dataset loading behavior remains unchanged.
- Dataset provider/client behavior remains unchanged.
- Worker behavior remains unchanged.
- Source-selection behavior remains unchanged.
- Generated data remains unchanged.
- Workflow/server/runtime/service behavior remains unchanged.

## Test matrix

Updated cert test verifies:

1. Latest Up Ahead edge diagnostics are derived.
2. `upAheadDataset.api_edge_diagnostics` is referenced.
3. The summary is restricted to `datasetId === 'upAhead'`.
4. `Edge API` summary renders source, reason, freshness, and age seconds.
5. Existing diagnostics detail rendering remains present.
6. Export payload remains intact.

Static guard verifies:

1. Latest edge diagnostics derivation exists.
2. `upAheadDataset.api_edge_diagnostics` is referenced.
3. `EdgeApiSummary` is rendered.
4. Source, reason, freshness, and age seconds labels are present.
5. Recent diagnostics details remain present.
6. Export payload still includes diagnostics and dataset summaries.
7. Clear/export controls remain present.
8. Report/non-goals presence.

## Validation run

Planned validation commands:

```bash
node scripts/test_up_ahead_edge_data_health_summary_static.mjs
node scripts/test_up_ahead_edge_data_health_static.mjs
vitest run --config vitest.config.js src/components/DataHealthPanel.cert.test.jsx
npm run lint
npm run build
npm run test:certify
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Non-goals

- No dataset loader changes.
- No dataset API client changes.
- No provider/source-selection changes.
- No Worker source changes.
- No Wrangler example changes.
- No workflow changes.
- No runtime capability source changes.
- No service changes.
- No server script changes.
- No generated data changes.
- No page/view-model changes.
- No certification runner changes.
- No deployment automation.
