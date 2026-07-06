# NW-DP-021 — Up Ahead Edge Data Health Certification Wiring

## Mission statement

NW-DP-021 wires the Up Ahead Data Health diagnostics guards and `DataHealthPanel` cert test into the existing edge diagnostics certification pack.

## Files changed

- `package.json`
- `scripts/test_up_ahead_edge_certification_static.mjs`
- `reports/NW-DP-021_up_ahead_edge_data_health_certification.md`

## Current gap

NW-DP-019 and NW-DP-020 added Data Health UI checks:

```text
scripts/test_up_ahead_edge_data_health_static.mjs
scripts/test_up_ahead_edge_data_health_summary_static.mjs
src/components/DataHealthPanel.cert.test.jsx
```

Before NW-DP-021, the existing `test:upahead-edge-api` pack protected Worker, smoke, and dataset diagnostics checks, but did not yet run the Data Health UI checks.

## Script wiring

Updated:

```bash
npm run test:upahead-edge-api
```

The script keeps existing Worker/smoke checks:

```text
node scripts/test_up_ahead_edge_worker_contract.mjs
node scripts/test_up_ahead_edge_worker_contract_static.mjs
node scripts/test_up_ahead_edge_cors_exposed_headers_static.mjs
node scripts/test_up_ahead_edge_freshness_diagnostics_static.mjs
node scripts/test_up_ahead_edge_source_diagnostics_static.mjs
node scripts/test_up_ahead_edge_payload_contract_static.mjs
node scripts/test_up_ahead_edge_smoke_static.mjs
```

The script keeps existing dataset diagnostics checks:

```text
node scripts/test_up_ahead_edge_dataset_diagnostics_static.mjs
npx vitest run --config vitest.config.js src/data/datasets/upAheadDatasetApiClient.cert.test.js src/data/datasets/upAheadDataset.providerChain.cert.test.js
```

The script now also runs Data Health UI checks:

```text
node scripts/test_up_ahead_edge_data_health_static.mjs
node scripts/test_up_ahead_edge_data_health_summary_static.mjs
npx vitest run --config vitest.config.js src/components/DataHealthPanel.cert.test.jsx
```

## Static guard update

Updated:

```bash
node scripts/test_up_ahead_edge_certification_static.mjs
```

The guard now verifies that `test:upahead-edge-api` includes:

```text
scripts/test_up_ahead_edge_data_health_static.mjs
scripts/test_up_ahead_edge_data_health_summary_static.mjs
src/components/DataHealthPanel.cert.test.jsx
```

It also continues to verify the earlier Worker/smoke edge checks, dataset diagnostics checks, and certification-manifest wiring.

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

- Existing Worker/smoke checks remain in the script.
- Existing dataset diagnostics checks remain in the script.
- Certification runner behavior remains unchanged.
- Certification manifest behavior remains unchanged.
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
