# NW-DP-013 — Up Ahead Edge CORS Exposed Diagnostics Headers

## Mission statement

NW-DP-013 exposes the Up Ahead edge diagnostics headers through CORS so browser-based clients and operator tools can read source, reason, freshness, and age metadata from the Worker response, without changing the JSON body contract, frontend behavior, storage, or deployment automation.

## Files changed

- `cloudflare/upahead-dataset-api/src/index.js`
- `scripts/smoke_up_ahead_edge_api.mjs`
- `scripts/test_up_ahead_edge_cors_exposed_headers_static.mjs`
- `reports/NW-DP-013_up_ahead_edge_cors_exposed_headers.md`

## Current source problem

NW-DP-011 and NW-DP-012 added custom response headers for source, reason, freshness, and age. The Worker already allowed cross-origin requests, but browser JavaScript cannot reliably read non-simple custom response headers unless the response includes `Access-Control-Expose-Headers`.

## Exposed headers contract

For `GET /api/datasets/upAhead` and `OPTIONS /api/datasets/upAhead`, responses now include:

```text
Access-Control-Expose-Headers: X-NW-UpAhead-Source, X-NW-UpAhead-Reason, X-NW-UpAhead-Freshness, X-NW-UpAhead-Age-Seconds
```

The exposed list covers all diagnostics headers:

```text
X-NW-UpAhead-Source
X-NW-UpAhead-Reason
X-NW-UpAhead-Freshness
X-NW-UpAhead-Age-Seconds
```

## Smoke harness behavior

The smoke harness now verifies that both GET and OPTIONS responses expose every diagnostic header through `Access-Control-Expose-Headers`.

It still verifies:

```text
GET status
Content-Type
Cache-Control
Access-Control-Allow-Origin
JSON shape
source/reason diagnostics
freshness/age diagnostics
OPTIONS status
Access-Control-Allow-Methods
```

## Compatibility behavior

- JSON body contract remains unchanged.
- Source/reason/freshness diagnostics values remain unchanged.
- Fallback marker remains `missing_or_invalid_up_ahead_dataset`.
- Endpoint path remains `/api/datasets/upAhead`.
- `GET /api/datasets/upAhead` still returns 200 JSON.
- `OPTIONS /api/datasets/upAhead` still returns CORS preflight response.
- Unsupported methods still return 405.
- Unknown paths still return 404.
- `Access-Control-Allow-Origin: *` remains unchanged.
- `Access-Control-Allow-Methods: GET, OPTIONS` remains unchanged.
- `Access-Control-Allow-Headers: Content-Type` remains unchanged.
- No frontend/runtime/client/provider code is modified.
- No deployment automation, storage binding, or generated data changes are added.

## Test matrix

Static guard covers:

1. Worker emits `Access-Control-Expose-Headers`.
2. Exposed headers include `X-NW-UpAhead-Source`.
3. Exposed headers include `X-NW-UpAhead-Reason`.
4. Exposed headers include `X-NW-UpAhead-Freshness`.
5. Exposed headers include `X-NW-UpAhead-Age-Seconds`.
6. Worker preserves `Access-Control-Allow-Origin: *`.
7. Worker preserves `Access-Control-Allow-Methods: GET, OPTIONS`.
8. Worker preserves `Access-Control-Allow-Headers: Content-Type`.
9. Worker preserves all diagnostics header names.
10. Worker keeps endpoint path `/api/datasets/upAhead`.
11. Worker keeps no-cache, OPTIONS, 405, and 404 behavior.
12. Smoke script validates exposed headers for GET and OPTIONS.
13. Fallback marker remains unchanged.
14. Report/non-goals presence.

## Validation run

Planned validation commands:

```bash
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
