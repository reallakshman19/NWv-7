# NW-DP-015 — Up Ahead Edge Certification Wiring

## Mission statement

NW-DP-015 wires the Up Ahead edge Worker executable contract test and related static guards into the repository certification path so `npm run test:certify` protects the edge API work by default.

## Files changed

- `package.json`
- `scripts/test_up_ahead_edge_certification_static.mjs`
- `reports/NW-DP-015_up_ahead_edge_certification_wiring.md`

## Certification wiring

Added package script:

```bash
npm run test:upahead-edge-api
```

Command body:

```bash
node scripts/test_up_ahead_edge_worker_contract.mjs && \
node scripts/test_up_ahead_edge_worker_contract_static.mjs && \
node scripts/test_up_ahead_edge_cors_exposed_headers_static.mjs && \
node scripts/test_up_ahead_edge_freshness_diagnostics_static.mjs && \
node scripts/test_up_ahead_edge_source_diagnostics_static.mjs && \
node scripts/test_up_ahead_edge_payload_contract_static.mjs && \
node scripts/test_up_ahead_edge_smoke_static.mjs
```

The existing manifest command `certification-manifest` is already required for both `workflow` and `full`. To avoid a large full-file replacement of `scripts/certification_manifest.json` and preserve manifest command order exactly, this work pack wires the edge test pack through the existing required package script:

```bash
npm run test:certification-manifest
```

That script now runs:

```bash
npm run test:upahead-edge-api && \
node scripts/test_certification_manifest_static.mjs && \
node scripts/validate_certification_manifest.mjs
```

## Command order

The Up Ahead edge API checks run before the existing certification manifest validators inside the existing `certification-manifest` step. The certification manifest command order itself is unchanged.

## Static guard

Added:

```bash
node scripts/test_up_ahead_edge_certification_static.mjs
```

The guard verifies:

- `package.json` defines `test:upahead-edge-api`.
- The edge script includes the executable Worker contract test.
- The edge script includes every related edge static guard.
- `test:certification-manifest` runs the edge test pack before manifest validators.
- The existing `certification-manifest` manifest entry remains required for `full` and `workflow`.
- Required edge test files exist.
- Report/non-goals are documented.

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

- Existing certification runner behavior remains unchanged.
- Existing certification manifest command order remains unchanged.
- Worker behavior remains unchanged.
- No frontend/runtime/data/service code is modified.
- No generated data is modified.
- No workflow/server/Wrangler files are modified.

## Non-goals

- No Worker source changes.
- No certification runner changes.
- No frontend/runtime/data/service changes.
- No generated data changes.
- No GitHub Actions workflow changes.
- No server script changes.
- No Wrangler example changes.
- No R2/KV/storage changes.
- No multi-dataset provider abstraction.
