# NW-DP-027 — Up Ahead Edge Activation Status Panel

## Mission statement

NW-DP-027 adds a visible operator-facing Up Ahead Edge Activation status panel/card that summarizes current edge activation state, latest edge diagnostics, and copyable readiness/smoke commands, without adding a new data path or changing Worker/source-selection behavior.

## Files changed

- `src/components/DataHealthPanel.jsx`
- `src/components/DataHealthPanel.cert.test.jsx`
- `scripts/test_up_ahead_edge_activation_status_panel_static.mjs`
- `reports/NW-DP-027_up_ahead_edge_activation_status_panel.md`

## Current gap

NW-DP-001 through NW-DP-026 created the static frontend / dataset API boundary, edge Worker contract, diagnostics headers, Data Health visibility/export, maintained edge runner, and readiness command.

The remaining usability gap was that operators still had to infer activation state from scattered Data Health fields, diagnostics, and runbook commands.

## UI behavior

`DataHealthPanel.jsx` now renders a visible read-only card inside the existing `upAhead` dataset card:

```text
Up Ahead Edge Activation
```

The card displays:

```text
Dataset API mode
Worker/API base URL
Latest edge source
Latest edge reason
Latest edge freshness
Latest edge age seconds
Last diagnostics timestamp
Readiness command
Smoke command
```

Status labels are intentionally compact and deterministic:

```text
configured
not configured
missing
unknown
```

The UI does not display or invent a Worker URL when it is unavailable. It shows status only.

## Data sources used

The panel uses existing in-app information only:

```text
cached dataset envelope
latest upAheadDataset.api_edge_diagnostics event
existing runtime capability indicators from getRuntimeCapabilities()
```

The latest diagnostic event is used so the panel can show both diagnostic details and the last diagnostics timestamp.

## Command copy behavior

The panel shows plain command text for operators:

```bash
npm run test:upahead-edge-readiness
```

and:

```bash
VITE_API_BASE_URL=https://<worker-host> npm run test:upahead-edge-readiness -- --require-config --smoke
```

No command is executed from the browser.

## Compatibility behavior

Existing Data Health behavior is preserved:

```text
cache summary
recent diagnostics list
diagnostics details
pinned Edge API summary
export JSON
clear diagnostics
edgeApiDiagnostics export field
```

No new data path is introduced.

No browser-side smoke execution is introduced.

No Worker/source-selection behavior is changed.

## Test matrix

Updated cert test verifies:

1. Up Ahead Edge Activation panel/card exists.
2. Configured/missing/unknown/not configured status labels exist.
3. Latest edge source/reason/freshness/age fields are shown.
4. Last diagnostics timestamp is shown.
5. Readiness command is shown.
6. Smoke command is shown.
7. Existing diagnostics/export behavior remains present.

Static guard verifies:

1. Activation status component and title exist.
2. Dataset API mode and Worker/API base URL fields exist.
3. Latest edge diagnostic fields and timestamp exist.
4. Existing runtime capability indicators are used.
5. Readiness and smoke commands are shown.
6. Existing Edge API summary, diagnostics details, export field, clear control, and export control remain present.
7. No browser-side fetch path is introduced.
8. No dataset API client path is introduced.
9. No browser-side smoke/readiness execution is introduced.
10. Report/non-goals exist.

## Validation run

Planned validation commands:

```bash
node scripts/test_up_ahead_edge_activation_status_panel_static.mjs
vitest run --config vitest.config.js src/components/DataHealthPanel.cert.test.jsx
npm run test:upahead-edge-api
npm run test:upahead-edge-readiness
npm run lint
npm run build
npm run test:certify
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Non-goals

- No Worker source changes.
- No dataset loader/client/provider changes.
- No runtime source-selection changes.
- No service changes.
- No server script changes.
- No workflow changes.
- No generated data changes.
- No page/view-model changes.
- No certification runner changes.
- No deployment automation changes.
- No browser-side smoke execution.
- No new browser fetch/API client path.
