# NW-DP-007 — Up Ahead Edge Dataset API Host

## Mission statement

NW-DP-007 adds a small production-edge Up Ahead dataset API host package for `/api/datasets/upAhead` so `VITE_API_BASE_URL` can point to a real deployable API host, without adding R2 storage, multi-dataset abstraction, or frontend/runtime changes.

## Files changed

- `cloudflare/upahead-dataset-api/src/index.js`
- `cloudflare/upahead-dataset-api/wrangler.toml.example`
- `cloudflare/upahead-dataset-api/README.md`
- `scripts/test_up_ahead_edge_api_host_static.mjs`
- `reports/NW-DP-007_up_ahead_edge_api_host.md`

## Current source problem

NW-DP-004 added a client provider that appends `/api/datasets/upAhead` to a configured dataset API base URL. NW-DP-005 implemented the same endpoint in the local Python API layer. NW-DP-006 wired `VITE_API_BASE_URL` / `VITE_BACKEND_URL` into the GitHub Pages build. The remaining gap was a small deployable production-edge API host package that can serve the aligned endpoint without changing frontend behavior.

## Endpoint contract

```text
GET /api/datasets/upAhead
```

Supported route behavior:

```text
GET /api/datasets/upAhead      -> 200 JSON
OPTIONS /api/datasets/upAhead  -> 204 CORS response
POST/PUT/DELETE                -> 405 JSON
other paths                    -> 404 JSON
```

## Upstream source contract

The Worker reads its upstream source from:

```text
UP_AHEAD_DATASET_URL
```

Expected value example:

```text
https://<github-pages-host>/data/up_ahead.json
```

The source URL is a placeholder in `wrangler.toml.example`; no real source URL, account ID, route, zone ID, secret, R2, or KV binding is committed.

## CORS/cache behavior

Dataset JSON responses include:

```text
Content-Type: application/json
Cache-Control: no-cache
Access-Control-Allow-Origin: *
```

Preflight responses include:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## Fallback behavior

If `UP_AHEAD_DATASET_URL` is missing, upstream fetch fails, upstream response is non-OK, or JSON parsing fails, the Worker returns:

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

## Deployment instructions summary

1. Copy the example config locally:

```bash
cp cloudflare/upahead-dataset-api/wrangler.toml.example cloudflare/upahead-dataset-api/wrangler.toml
```

2. Set the upstream published snapshot URL:

```toml
[vars]
UP_AHEAD_DATASET_URL = "https://<github-pages-host>/data/up_ahead.json"
```

3. Validate and deploy with Wrangler from the package directory:

```bash
npx wrangler dev
npx wrangler deploy
```

4. Configure the frontend build variable after Worker deployment:

```text
Repository Settings
→ Secrets and variables
→ Actions
→ Variables
→ New repository variable
Name: VITE_API_BASE_URL
Value: https://<deployed-worker-host>
```

Do not include `/api/datasets/upAhead` in `VITE_API_BASE_URL`; the DP-004 client appends it.

## Compatibility behavior

- DP-004 client path remains `/api/datasets/upAhead`.
- DP-005 local server endpoint remains `/api/datasets/upAhead`.
- No GitHub Pages deploy workflow is modified.
- No frontend runtime/client/provider source is modified.
- No generated Up Ahead snapshot is modified.
- No R2/KV/storage binding is introduced.

## Test matrix

Static guard covers:

1. Worker file exists.
2. Worker routes `/api/datasets/upAhead`.
3. Worker reads `UP_AHEAD_DATASET_URL`.
4. Worker includes structured fallback marker.
5. Worker sends CORS allow-origin header.
6. Worker handles `OPTIONS`.
7. Worker returns 405 for unsupported methods.
8. Worker returns 404 for unknown paths.
9. Wrangler example exists and contains placeholders only.
10. README documents `VITE_API_BASE_URL` and excludes endpoint path.
11. DP-004 client path remains aligned.
12. DP-005 local server endpoint remains aligned.
13. Report/non-goals presence.

## Validation run

Planned validation commands:

```bash
node scripts/test_up_ahead_edge_api_host_static.mjs
npm run lint
npm run build
npm run test:certify
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Non-goals

- No R2 implementation.
- No KV implementation.
- No real Cloudflare account/route provisioning.
- No GitHub Actions deployment automation.
- No multi-dataset provider abstraction.
- No frontend runtime capability changes.
- No dataset orchestrator changes.
- No Up Ahead client/provider policy changes.
- No local Python API changes.
- No JS live engine rewrite.
- No generated snapshot changes.
- No UI/view-model/component changes.
