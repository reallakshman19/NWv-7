# NW-DP-012 — Up Ahead Edge Freshness Diagnostics

## Mission statement

NW-DP-012 adds freshness diagnostics headers to the Up Ahead edge dataset API Worker so operators can see whether a served payload is fresh, stale, or unknown based on `lastUpdated`, without changing the JSON body contract, frontend behavior, storage, or deployment automation.

## Files changed

- `cloudflare/upahead-dataset-api/src/index.js`
- `scripts/smoke_up_ahead_edge_api.mjs`
- `scripts/test_up_ahead_edge_freshness_diagnostics_static.mjs`
- `reports/NW-DP-012_up_ahead_edge_freshness_diagnostics.md`

## Current source problem

After NW-DP-011, the Worker exposed source/reason headers for upstream versus fallback responses. Operators still could not determine from response headers whether the selected payload was fresh, stale, or unknown based on its `lastUpdated` field.

## Freshness headers

For `GET /api/datasets/upAhead`, dataset JSON responses now include:

```text
X-NW-UpAhead-Freshness: fresh | stale | unknown
X-NW-UpAhead-Age-Seconds: <non-negative-integer> | unknown
```

These headers are derived from the selected response payload after upstream/fallback selection. They do not alter the JSON body and do not cause fallback by themselves.

## Freshness classification matrix

Default stale threshold:

```text
12 hours
```

Classification:

```text
lastUpdated valid and age <= 12h   -> Freshness: fresh, Age-Seconds: integer
lastUpdated valid and age > 12h    -> Freshness: stale, Age-Seconds: integer
lastUpdated missing/null/invalid   -> Freshness: unknown, Age-Seconds: unknown
lastUpdated future-dated           -> Freshness: unknown, Age-Seconds: unknown
```

## Smoke harness behavior

The smoke harness now reports:

```text
Freshness: fresh|stale|unknown
Age Seconds: <integer>|unknown
```

It accepts absent freshness headers as `unknown` for transitional compatibility. It does not fail merely because freshness is `stale` or `unknown`; it fails only when a present freshness value is unsupported, an age value is neither `unknown` nor a non-negative integer, or existing status/header/shape checks fail.

## Compatibility behavior

- JSON body contract remains unchanged.
- Source/reason diagnostics remain intact.
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

1. Worker emits `X-NW-UpAhead-Freshness`.
2. Worker emits `X-NW-UpAhead-Age-Seconds`.
3. Worker inspects `lastUpdated`.
4. Worker defines 12-hour stale threshold.
5. Worker supports `fresh`, `stale`, and `unknown` freshness values.
6. Worker preserves source/reason diagnostics headers.
7. Endpoint path remains `/api/datasets/upAhead`.
8. CORS/no-cache/OPTIONS/405/404 behavior remains present.
9. Smoke script reads and reports freshness headers.
10. Smoke script accepts absent freshness headers as `unknown`.
11. Smoke script does not fail solely because freshness is `stale` or `unknown`.
12. Fallback marker remains unchanged.
13. Report/non-goals presence.

## Validation run

Planned validation commands:

```bash
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
