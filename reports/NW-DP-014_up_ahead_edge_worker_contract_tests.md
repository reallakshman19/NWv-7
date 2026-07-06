# NW-DP-014 — Up Ahead Edge Worker Contract Tests

## Mission statement

NW-DP-014 adds executable contract tests for the Up Ahead edge dataset API Worker so runtime behavior is proven with mocked requests and mocked upstream responses.

## Files changed

- `scripts/test_up_ahead_edge_worker_contract.mjs`
- `scripts/test_up_ahead_edge_worker_contract_static.mjs`
- `reports/NW-DP-014_up_ahead_edge_worker_contract_tests.md`

## Current gap

The Worker already had route handling, structured fallback, payload validation, source/reason diagnostics, freshness diagnostics, CORS-exposed diagnostics headers, smoke tooling, and static guards. The remaining gap was executable proof that imports the Worker module and asserts actual `Request` / `Response` behavior using mocked upstream responses without network access.

## Executable coverage

The executable contract test covers:

1. Valid upstream payload returns `200`, `upstream/ok`, `fresh`, integer age, and exposed diagnostics headers.
2. Missing upstream URL returns structured fallback with `fallback/missing-url`.
3. Upstream non-OK response returns structured fallback with `fallback/upstream-non-ok`.
4. JSON parse failure returns structured fallback with `fallback/invalid-json`.
5. Invalid payload shape returns structured fallback with `fallback/invalid-shape`.
6. Stale valid payload returns `upstream/ok`, `stale`, and integer age.
7. Null `lastUpdated` valid payload returns `upstream/ok`, `unknown`, and `unknown` age.
8. `OPTIONS /api/datasets/upAhead` returns preflight CORS allow/expose headers.
9. `POST /api/datasets/upAhead` returns `405`.
10. Wrong path returns `404`.

Assertions cover:

- `X-NW-UpAhead-Source`
- `X-NW-UpAhead-Reason`
- `X-NW-UpAhead-Freshness`
- `X-NW-UpAhead-Age-Seconds`
- `Access-Control-Expose-Headers`
- `Content-Type: application/json`
- `Cache-Control: no-cache`
- `missing_or_invalid_up_ahead_dataset`

## Mock strategy

The test uses Node built-ins only:

- Imports the Worker module directly from `cloudflare/upahead-dataset-api/src/index.js`.
- Creates real `Request` objects.
- Asserts real `Response` status, headers, and JSON bodies.
- Temporarily replaces `globalThis.fetch` with deterministic mocked upstream fetch implementations.
- Restores the original `globalThis.fetch` after each Worker call.
- Performs no real network access.

## Compatibility behavior

- Worker source remains unchanged.
- JSON body contract remains unchanged.
- Endpoint path remains `/api/datasets/upAhead`.
- Diagnostics headers remain intact.
- Fallback marker remains unchanged.
- CORS-exposed diagnostics behavior remains intact.
- No frontend/runtime/client/provider source is modified.
- No deployment automation, storage binding, server script change, or generated data change is added.

## Test matrix

Static guard covers:

1. Executable test exists.
2. Test imports the Worker module.
3. Test uses real `Request` objects.
4. Test mocks `globalThis.fetch`.
5. Test covers all ten required runtime cases.
6. Test verifies all diagnostic headers.
7. Test verifies exposed diagnostics headers.
8. Test verifies JSON content type and no-cache behavior.
9. Test verifies fallback marker.
10. Report/non-goals presence.

## Validation run

Planned validation commands:

```bash
node scripts/test_up_ahead_edge_worker_contract.mjs
node scripts/test_up_ahead_edge_worker_contract_static.mjs
node scripts/test_up_ahead_edge_cors_exposed_headers_static.mjs
node scripts/test_up_ahead_edge_freshness_diagnostics_static.mjs
node scripts/test_up_ahead_edge_source_diagnostics_static.mjs
node scripts/test_up_ahead_edge_payload_contract_static.mjs
node scripts/test_up_ahead_edge_smoke_static.mjs
npm run lint
npm run build
npm run test:certify
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Non-goals

- No Worker behavior changes.
- No real network access in tests.
- No real deployed Worker URL in source.
- No real Cloudflare account/route provisioning.
- No GitHub Actions deployment automation.
- No R2 implementation.
- No KV implementation.
- No multi-dataset provider abstraction.
- No frontend runtime capability changes.
- No dataset orchestrator changes.
- No Up Ahead client/provider policy changes.
- No local Python API changes.
- No JS live engine rewrite.
- No generated snapshot changes.
- No UI/view-model/component changes.
