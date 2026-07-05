# NW-DP-011 — Up Ahead Edge Source Diagnostics

## Mission statement

NW-DP-011 adds source/fallback diagnostics headers to the Up Ahead edge dataset API Worker so operators can distinguish upstream-served payloads from structured fallback responses during smoke verification, without changing the JSON contract, frontend behavior, storage, or deployment automation.

## Files changed

- `cloudflare/upahead-dataset-api/src/index.js`
- `scripts/smoke_up_ahead_edge_api.mjs`
- `scripts/test_up_ahead_edge_source_diagnostics_static.mjs`
- `reports/NW-DP-011_up_ahead_edge_source_diagnostics.md`

## Current source problem

After NW-DP-010, the Worker correctly rejected malformed upstream payloads and returned the structured fallback. However, operators could not distinguish successful upstream responses from structured fallback responses using response metadata. Smoke output also reported shape validity but not the Worker source/reason diagnostics.

## Diagnostics headers

For `GET /api/datasets/upAhead`, dataset JSON responses now include:

```text
X-NW-UpAhead-Source: upstream | fallback
X-NW-UpAhead-Reason: ok | missing-url | fetch-error | upstream-non-ok | invalid-json | invalid-shape
```

The Worker does not expose upstream URLs, exception details, secrets, account IDs, route IDs, or environment values in these headers.

## Reason matrix

```text
valid upstream payload                         -> Source: upstream, Reason: ok
missing UP_AHEAD_DATASET_URL                   -> Source: fallback, Reason: missing-url
fetch implementation/network failure           -> Source: fallback, Reason: fetch-error
upstream HTTP response is non-OK               -> Source: fallback, Reason: upstream-non-ok
upstream JSON parsing fails                    -> Source: fallback, Reason: invalid-json
parsed JSON fails Up Ahead payload validation  -> Source: fallback, Reason: invalid-shape
```

## Smoke harness behavior

The smoke harness now reads and prints:

```text
Source: upstream|fallback|unknown
Reason: ok|missing-url|fetch-error|upstream-non-ok|invalid-json|invalid-shape|unknown
```

The harness accepts absent diagnostics as `unknown` for transitional compatibility. It does not fail merely because the source is `fallback`; it fails only when a present diagnostics header has an unsupported value or when existing status/header/shape checks fail.

## Compatibility behavior

- JSON body contract remains unchanged.
- Fallback marker remains `missing_or_invalid_up_ahead_dataset`.
- Endpoint path remains `/api/datasets/upAhead`.
- `GET /api/datasets/upAhead` still returns 200 JSON.
- `OPTIONS /api/datasets/upAhead` still returns CORS preflight response.
- Unsupported methods still return 405.
- Unknown paths still return 404.
- CORS and no-cache response headers remain intact.
- No frontend/runtime/client/provider code is modified.
- No deployment automation, storage binding, or generated data changes are added.

## Test matrix

Static guard covers:

1. Worker emits `X-NW-UpAhead-Source`.
2. Worker emits `X-NW-UpAhead-Reason`.
3. Worker distinguishes upstream `ok` from fallback states.
4. Worker includes fallback reason strings: `missing-url`, `fetch-error`, `upstream-non-ok`, `invalid-json`, `invalid-shape`.
5. Worker does not expose `UP_AHEAD_DATASET_URL` value in response headers.
6. Endpoint path remains `/api/datasets/upAhead`.
7. CORS/no-cache/OPTIONS/405/404 behavior remains present.
8. Smoke script reads and reports diagnostics headers.
9. Smoke script accepts absent diagnostics as `unknown`.
10. Smoke script does not fail solely because source is `fallback`.
11. Fallback marker remains unchanged.
12. Report/non-goals presence.

## Validation run

Planned validation commands:

```bash
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
