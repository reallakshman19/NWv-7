# NW-DP-010 — Up Ahead Edge Payload Contract Validation

## Mission statement

NW-DP-010 hardens the Up Ahead edge dataset API host so the Cloudflare Worker validates upstream payload shape before serving it, returning the structured fallback for malformed-but-JSON upstream responses, without changing frontend/runtime behavior or adding storage/deployment automation.

## Files changed

- `cloudflare/upahead-dataset-api/src/index.js`
- `scripts/test_up_ahead_edge_payload_contract_static.mjs`
- `reports/NW-DP-010_up_ahead_edge_payload_contract.md`

## Current source problem

Before this change, the Worker returned parsed upstream JSON directly after an HTTP OK response. That handled missing URL, fetch failure, non-OK response, and invalid JSON, but malformed valid JSON such as `{}` or `{ "items": [] }` could still be served as a successful Up Ahead dataset response.

## Payload contract

The Worker now validates the minimum Up Ahead dataset shape before returning upstream JSON:

```text
timeline: array
sections: object and not array
weekly_plan: array
auditSummary: object or null
dropReport: array
```

Added pure helpers:

```text
isObjectRecord(value)
isValidUpAheadPayload(payload)
```

## Before Worker behavior

```text
fetch upstream
if response is OK:
  return await response.json()
else:
  fallback
```

Malformed but valid JSON could pass through.

## After Worker behavior

```text
fetch upstream
if response is OK:
  parse JSON
  validate minimum Up Ahead payload contract
  return parsed JSON only when valid
otherwise:
  structured fallback
```

## Fallback behavior

The fallback marker remains unchanged:

```text
missing_or_invalid_up_ahead_dataset
```

Fallback payload remains:

```json
{
  "timeline": [],
  "sections": {},
  "weekly_plan": [],
  "lastUpdated": null,
  "auditSummary": { "fallback": "missing_or_invalid_up_ahead_dataset" },
  "dropReport": []
}
```

Fallback is returned for:

```text
missing UP_AHEAD_DATASET_URL
missing fetch implementation
upstream fetch failure
upstream non-OK response
invalid JSON
valid JSON with malformed Up Ahead shape
```

## Compatibility behavior

- Endpoint path remains `/api/datasets/upAhead`.
- `GET /api/datasets/upAhead` still returns 200 JSON.
- `OPTIONS /api/datasets/upAhead` still returns CORS preflight response.
- Unsupported methods still return 405.
- Unknown paths still return 404.
- CORS and no-cache response headers remain intact.
- Smoke harness remains aligned with the same minimum payload keys.
- No frontend/runtime/client/provider code is modified.
- No deployment automation, storage binding, or generated data changes are added.

## Test matrix

Static guard covers:

1. Worker defines/exports `isObjectRecord`.
2. Worker defines/exports `isValidUpAheadPayload`.
3. Worker validates `timeline` as an array.
4. Worker validates `sections` as an object and rejects arrays.
5. Worker validates `weekly_plan` as an array.
6. Worker validates `auditSummary` as object-or-null.
7. Worker validates `dropReport` as an array.
8. `fetchUpAheadPayload` uses the validator before returning parsed upstream JSON.
9. Fallback marker remains unchanged.
10. Endpoint path remains `/api/datasets/upAhead`.
11. CORS, no-cache, OPTIONS, 405, and 404 behavior remain present.
12. Smoke script still validates `timeline`, `sections`, `weekly_plan`, `auditSummary`, and `dropReport`.
13. Report/non-goals presence.

## Validation run

Planned validation commands:

```bash
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
