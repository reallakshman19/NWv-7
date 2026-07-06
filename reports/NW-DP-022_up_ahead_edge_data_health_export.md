# NW-DP-022 — Up Ahead Edge Diagnostics in Data Health Export

## Mission statement

NW-DP-022 includes the pinned Up Ahead edge diagnostics summary in the Data Health exported dataset summary so exported JSON exposes source, reason, freshness, and age without requiring operators to manually search the diagnostics array.

## Files changed

- `src/components/DataHealthPanel.jsx`
- `src/components/DataHealthPanel.cert.test.jsx`
- `scripts/test_up_ahead_edge_data_health_export_static.mjs`
- `reports/NW-DP-022_up_ahead_edge_data_health_export.md`

## Current gap

NW-DP-020 pins the latest Up Ahead edge diagnostics in the `upAhead` Data Health card. The export payload already includes the full global `diagnostics` array, but the per-dataset summary did not include the pinned edge summary directly.

Operators reviewing the exported JSON still had to manually search the diagnostics array to find the latest edge source, reason, freshness, and age metadata.

## Export behavior

`DataHealthPanel.jsx` now includes an `edgeApiDiagnostics` field in each exported dataset summary.

For the `upAhead` dataset, this field is built from the same latest edge diagnostics used by the pinned `Edge API` card:

```text
getLatestUpAheadEdgeDiagnostics(diagnostics)
```

When present, the exported `edgeApiDiagnostics` object contains:

```text
source
reason
freshness
ageSeconds
```

For other datasets, the field is `null`.

## Existing export fields preserved

The export payload still includes:

```text
exportedAt
diagnostics
datasets
```

Each dataset summary still includes the existing fields:

```text
datasetId
ok
source
freshness
fallbackUsed
payloadHash
fetchedAt
lastGoodAt
validation
slo
error
```

## UI behavior

No UI rendering behavior is changed from NW-DP-019 or NW-DP-020:

- Recent diagnostics detail rendering remains intact.
- The pinned `Edge API` card summary remains intact.
- Cache summary fields remain intact.
- Clear diagnostics button remains intact.
- Export JSON button remains intact.

## Compatibility behavior

- Dataset loading behavior remains unchanged.
- Dataset provider/client behavior remains unchanged.
- Worker behavior remains unchanged.
- Source-selection behavior remains unchanged.
- Generated data remains unchanged.
- Workflow/server/runtime/service behavior remains unchanged.

## Test matrix

Updated cert test verifies:

1. Export payload includes `edgeApiDiagnostics`.
2. Export summary uses latest Up Ahead edge diagnostics.
3. Export summary includes source, reason, freshness, and age seconds.
4. Global diagnostics array remains exported.
5. Dataset summaries remain exported.
6. Existing dataset summary fields remain exported.

Static guard verifies:

1. `buildEdgeApiDiagnosticsExport` exists.
2. `edgeApiDiagnostics` exists in the export summary.
3. The export uses `getLatestUpAheadEdgeDiagnostics` / `latestUpAheadEdgeDiagnostics`.
4. The edge export is scoped to `datasetId === 'upAhead'`.
5. Source, reason, freshness, and age seconds are included.
6. Global diagnostics and dataset summaries remain exported.
7. Existing dataset summary fields remain exported.
8. Report/non-goals presence.

## Validation run

Planned validation commands:

```bash
node scripts/test_up_ahead_edge_data_health_export_static.mjs
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
