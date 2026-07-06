# NW-DP-018 — Up Ahead Edge Dataset Diagnostics Certification

## Mission statement

NW-DP-018 wires the app-side Up Ahead edge diagnostics static guard and focused dataset/client cert tests into the existing `test:upahead-edge-api` certification pack so DP-017 is protected by the normal edge/API test path.

## Files changed

- `package.json`
- `scripts/test_up_ahead_edge_certification_static.mjs`
- `reports/NW-DP-018_up_ahead_edge_dataset_diagnostics_certification.md`

## Current gap

NW-DP-017 added app-side edge metadata capture, focused cert tests, and a static guard:

```text
scripts/test_up_ahead_edge_dataset_diagnostics_static.mjs
src/data/datasets/upAheadDatasetApiClient.cert.test.js
src/data/datasets/upAheadDataset.providerChain.cert.test.js
```

Before NW-DP-018, the existing edge certification pack was focused on Worker, CORS, freshness, source diagnostics, payload contract, and smoke checks. The DP-017 app-side diagnostics proof needed to be included in the same edge/API pack.

## Script wiring

Updated:

```bash
npm run test:upahead-edge-api
```

The script still runs the existing Worker/smoke checks:

```text
node scripts/test_up_ahead_edge_worker_contract.mjs
node scripts/test_up_ahead_edge_worker_contract_static.mjs
node scripts/test_up_ahead_edge_cors_exposed_headers_static.mjs
node scripts/test_up_ahead_edge_freshness_diagnostics_static.mjs
node scripts/test_up_ahead_edge_source_diagnostics_static.mjs
node scripts/test_up_ahead_edge_payload_contract_static.mjs
node scripts/test_up_ahead_edge_smoke_static.mjs
```

It now also runs the DP-017 app-side diagnostics checks:

```text
node scripts/test_up_ahead_edge_dataset_diagnostics_static.mjs
npx vitest run --config vitest.config.js src/data/datasets/upAheadDatasetApiClient.cert.test.js src/data/datasets/upAheadDataset.providerChain.cert.test.js
```

## Static guard update

Updated:

```bash
node scripts/test_up_ahead_edge_certification_static.mjs
```

The guard now verifies that `test:upahead-edge-api` includes:

```text
scripts/test_up_ahead_edge_dataset_diagnostics_static.mjs
src/data/datasets/upAheadDatasetApiClient.cert.test.js
src/data/datasets/upAheadDataset.providerChain.cert.test.js
```

It also continues to verify the earlier Worker/smoke edge checks and the existing certification-manifest wiring.

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

- Existing Worker/smoke edge checks remain in the script.
- Existing certification runner behavior remains unchanged.
- Existing certification manifest behavior remains unchanged.
- No Worker/runtime/service/UI/generated data/workflow/server files are modified.
- No dataset implementation files are modified.

## Non-goals

- No Worker source changes.
- No Wrangler example changes.
- No workflow changes.
- No runtime capability source changes.
- No service changes.
- No server script changes.
- No generated data changes.
- No UI/component/view-model changes.
- No dataset implementation changes.
- No certification runner changes.
- No certification manifest changes.
