# NW-DP-024 — Up Ahead Edge Certification Runner

## Mission statement

NW-DP-024 extracts the long Up Ahead edge certification pack command into a dedicated ordered runner script so the edge/API/Data Health diagnostics checks remain maintainable while preserving the same validation coverage.

## Files changed

- `package.json`
- `scripts/run_up_ahead_edge_api_tests.mjs`
- `scripts/test_up_ahead_edge_certification_static.mjs`
- `reports/NW-DP-024_up_ahead_edge_certification_runner.md`

## Current gap

`test:upahead-edge-api` had grown into a long inline command that ran Worker, smoke, dataset diagnostics, Data Health UI, and export checks. The inline command was difficult to review and fragile for continued maintenance.

## Package script wiring

Updated:

```bash
npm run test:upahead-edge-api
```

It now delegates to:

```bash
node scripts/run_up_ahead_edge_api_tests.mjs
```

## Runner behavior

Added:

```text
scripts/run_up_ahead_edge_api_tests.mjs
```

The runner uses Node built-ins only and executes commands through `child_process.spawn` with `shell: false`.

The runner preserves the existing edge pack order:

```text
node scripts/test_up_ahead_edge_worker_contract.mjs
node scripts/test_up_ahead_edge_worker_contract_static.mjs
node scripts/test_up_ahead_edge_cors_exposed_headers_static.mjs
node scripts/test_up_ahead_edge_freshness_diagnostics_static.mjs
node scripts/test_up_ahead_edge_source_diagnostics_static.mjs
node scripts/test_up_ahead_edge_payload_contract_static.mjs
node scripts/test_up_ahead_edge_smoke_static.mjs
node scripts/test_up_ahead_edge_dataset_diagnostics_static.mjs
npx vitest run --config vitest.config.js src/data/datasets/upAheadDatasetApiClient.cert.test.js src/data/datasets/upAheadDataset.providerChain.cert.test.js
node scripts/test_up_ahead_edge_data_health_static.mjs
node scripts/test_up_ahead_edge_data_health_summary_static.mjs
node scripts/test_up_ahead_edge_data_health_export_static.mjs
npx vitest run --config vitest.config.js src/components/DataHealthPanel.cert.test.jsx
```

The runner stops on the first non-zero command and returns that exit code.

## Static guard update

Updated:

```bash
node scripts/test_up_ahead_edge_certification_static.mjs
```

The guard now verifies:

```text
test:upahead-edge-api delegates to node scripts/run_up_ahead_edge_api_tests.mjs
runner exposes ordered command list
runner uses Node child_process built-in
runner uses spawn with shell disabled
runner includes all required edge pack commands
certification-manifest wiring remains intact
```

## Validation run

Planned validation commands:

```bash
node scripts/test_up_ahead_edge_certification_static.mjs
npm run test:upahead-edge-api
npm run lint
npm run build
npm run test:certify
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Compatibility behavior

- Existing edge pack coverage is preserved.
- Existing edge pack command order is preserved.
- Existing certification-manifest behavior remains unchanged.
- Existing certification runner behavior remains unchanged.
- No implementation files are modified.

## Non-goals

- No Worker source changes.
- No Wrangler example changes.
- No workflow changes.
- No runtime capability source changes.
- No dataset loader/client/provider changes.
- No service changes.
- No server script changes.
- No generated data changes.
- No UI/component/view-model implementation changes.
- No certification runner changes.
- No certification manifest changes.
