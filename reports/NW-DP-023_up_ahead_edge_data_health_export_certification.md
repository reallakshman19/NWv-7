# NW-DP-023 — Up Ahead Edge Data Health Export Certification Wiring

## Mission statement

NW-DP-023 wires the Up Ahead Data Health export static guard into the existing edge diagnostics certification pack so NW-DP-022 export coverage is protected by the normal test path.

## Files changed

- `package.json`
- `scripts/test_up_ahead_edge_certification_static.mjs`
- `reports/NW-DP-023_up_ahead_edge_data_health_export_certification.md`

## Current gap

NW-DP-022 added:

```text
scripts/test_up_ahead_edge_data_health_export_static.mjs
```

Before NW-DP-023, the existing `test:upahead-edge-api` pack protected Worker, smoke, dataset diagnostics, and Data Health detail/summary checks, but did not yet run the NW-DP-022 export guard.

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

The script keeps existing Data Health checks:

```text
node scripts/test_up_ahead_edge_data_health_static.mjs
node scripts/test_up_ahead_edge_data_health_summary_static.mjs
npx vitest run --config vitest.config.js src/components/DataHealthPanel.cert.test.jsx
```

The script now also runs the Data Health export guard:

```text
node scripts/test_up_ahead_edge_data_health_export_static.mjs
```

## Static guard update

Updated:

```bash
node scripts/test_up_ahead_edge_certification_static.mjs
```

The guard now verifies that `test:upahead-edge-api` includes:

```text
scripts/test_up_ahead_edge_data_health_export_static.mjs
```

It also continues to verify the earlier Worker/smoke checks, dataset diagnostics checks, Data Health UI checks, and certification-manifest wiring.

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
- Existing Data Health detail/summary checks remain in the script.
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
