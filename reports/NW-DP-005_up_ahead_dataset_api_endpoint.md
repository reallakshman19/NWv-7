# NW-DP-005 — Up Ahead Dataset API Endpoint Contract

## Mission statement

NW-DP-005 implements the `/api/datasets/upAhead` endpoint contract in the existing local API layer so the DP-004 client provider chain has a real endpoint target, without adding edge/R2/cloud deployment.

## Files changed

- `scripts/server.py`
- `scripts/test_up_ahead_dataset_api_endpoint.py`
- `scripts/test_up_ahead_dataset_api_endpoint_static.mjs`
- `reports/NW-DP-005_up_ahead_dataset_api_endpoint.md`

## Current source problem

DP-004 added the client-side Up Ahead dataset API provider targeting `/api/datasets/upAhead`, but the existing local Python API layer did not expose that endpoint. The local server only handled existing settings, blacklist, user plan, and market snapshot API files.

## Endpoint contract

```text
GET /api/datasets/upAhead
```

The endpoint serves the existing static dataset file:

```text
public/data/up_ahead.json
```

The endpoint is read-only. POST requests to dataset endpoints return `405`.

## Response shape

Expected success payload shape:

```json
{
  "timeline": [],
  "sections": {},
  "weekly_plan": [],
  "lastUpdated": "string-or-null",
  "auditSummary": null,
  "dropReport": []
}
```

The server returns the parsed JSON from `public/data/up_ahead.json` when the file is present and valid.

## Fallback behavior

If `public/data/up_ahead.json` is missing, unreadable, or invalid JSON, the endpoint returns HTTP 200 with a structured safe payload:

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

The fallback is never `{}`.

## Compatibility behavior

- Existing GET mappings remain preserved:
  - `/api/settings`
  - `/api/blacklist`
  - `/api/user_plan`
  - `/api/market_snapshot`
- Existing POST behavior for writable file-backed endpoints remains preserved.
- The DP-004 frontend client path remains `/api/datasets/upAhead`.
- `scripts/server.py` is now import-safe via `if __name__ == '__main__': run_server()` so focused tests can import helpers without starting a TCP server.

## Test matrix

Focused Python test covers:

1. `/api/datasets/upAhead` endpoint spelling.
2. Mapping to `public/data/up_ahead.json`.
3. Existing endpoint mappings preserved.
4. Missing-file fallback shape.
5. Invalid JSON fallback shape.
6. Valid JSON returned as-is.

Static guard covers:

1. Exact endpoint path in `scripts/server.py`.
2. Mapping to `public/data/up_ahead.json`.
3. Structured fallback marker.
4. Import-safe main guard.
5. `Cache-Control: no-cache` support.
6. DP-004 client path unchanged.
7. Report/non-goals presence.

## Validation run

Planned validation commands:

```bash
python scripts/test_up_ahead_dataset_api_endpoint.py
node scripts/test_up_ahead_dataset_api_endpoint_static.mjs
npm run lint
npm run build
npm run test:certify
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Non-goals

- No Cloudflare Worker implementation.
- No R2 implementation.
- No production deployment configuration.
- No multi-dataset provider abstraction.
- No frontend runtime capability changes.
- No dataset orchestrator changes.
- No Up Ahead client/provider policy changes.
- No JS live engine rewrite.
- No generated snapshot changes.
- No UI/view-model/component changes.
- No GitHub Actions workflow changes.
