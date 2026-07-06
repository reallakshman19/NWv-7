# NW-DP-019 — Up Ahead Edge Diagnostics in Data Health

## Mission statement

NW-DP-019 surfaces captured Up Ahead edge API diagnostics in the existing Data Health panel so operators can see source, reason, freshness, and age metadata in the UI/export path, without changing dataset loading behavior, Worker behavior, source-selection policy, generated data, or deployment automation.

## Files changed

- `src/components/DataHealthPanel.jsx`
- `src/components/DataHealthPanel.cert.test.jsx`
- `scripts/test_up_ahead_edge_data_health_static.mjs`
- `reports/NW-DP-019_up_ahead_edge_data_health.md`

## Current gap

NW-DP-017 captures Up Ahead edge metadata in envelope diagnostics through:

```text
upAheadDataset.api_edge_diagnostics
```

The Data Health panel already listed diagnostics event names and messages, but it did not render diagnostics `details`. Operators therefore could not see the captured edge metadata values from the panel.

## UI behavior

The Data Health panel now renders diagnostics details when present.

The rendering is generic and safe for other diagnostics events, while explicitly prioritizing the Up Ahead edge metadata fields:

```text
source
reason
freshness
ageSeconds
```

The details render below the existing diagnostics event and message rows.

## Export behavior

The export payload still includes:

```text
exportedAt
diagnostics
datasets
```

Existing dataset summary fields are preserved. Because the `diagnostics` array remains included, diagnostics `details` are still included in exported JSON payloads.

## Compatibility behavior

- Existing diagnostics list behavior remains intact.
- Existing cache summary behavior remains intact.
- Existing clear diagnostics button remains intact.
- Existing export JSON button remains intact.
- Dataset loading behavior remains unchanged.
- Dataset provider/client behavior remains unchanged.
- Worker behavior remains unchanged.
- Source-selection behavior remains unchanged.
- Generated data remains unchanged.
- Workflow/server/runtime/service behavior remains unchanged.

## Test matrix

Updated cert test verifies:

1. Production dataset cache reader remains used.
2. Diagnostics store subscription remains present.
3. Browser export guards remain present.
4. Envelope fields and export controls remain present.
5. Diagnostics details rendering exists.
6. Up Ahead edge fields are prioritized/renderable.
7. Export payload still includes diagnostics.

Static guard verifies:

1. `DataHealthPanel` renders diagnostics details.
2. `DataHealthPanel` references edge diagnostics fields.
3. `source`, `reason`, `freshness`, and `ageSeconds` are renderable.
4. Export payload still includes diagnostics.
5. Dataset summary export remains present.
6. Clear/export controls remain present.
7. Report/non-goals presence.

## Validation run

Planned validation commands:

```bash
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
- No deployment automation.
