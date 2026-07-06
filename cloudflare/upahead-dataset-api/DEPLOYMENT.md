# Up Ahead Edge Dataset API Activation Runbook

## Purpose

This runbook describes how to manually activate the Up Ahead Cloudflare Worker dataset API host and connect the static frontend through `VITE_API_BASE_URL` without committing Cloudflare account details, routes, secrets, deployed URLs, or GitHub Actions deployment automation.

The Worker serves:

```text
GET /api/datasets/upAhead
OPTIONS /api/datasets/upAhead
```

## Prerequisites

- Cloudflare account access outside this repository.
- Wrangler available through `npx wrangler`.
- A published static Up Ahead snapshot URL, for example:

```text
https://<github-pages-host>/data/up_ahead.json
```

- Repository access to set GitHub Actions repository variables.
- No real account IDs, zone IDs, routes, API tokens, or deployed Worker URLs should be committed.

## Local configuration

From the Worker package directory:

```bash
cd cloudflare/upahead-dataset-api
cp wrangler.toml.example wrangler.toml
```

Edit local `wrangler.toml` and set the upstream snapshot URL:

```toml
[vars]
UP_AHEAD_DATASET_URL = "https://<github-pages-host>/data/up_ahead.json"
```

`wrangler.toml` should remain local and uncommitted unless a later Work Pack explicitly approves production configuration.

## Local validation

Start the Worker locally:

```bash
cd cloudflare/upahead-dataset-api
npx wrangler dev
```

In another terminal, verify the endpoint. Replace `<port>` with the Wrangler dev port:

```bash
curl -i http://127.0.0.1:<port>/api/datasets/upAhead
```

Expected:

```text
HTTP 200
Content-Type: application/json
Cache-Control: no-cache
Access-Control-Allow-Origin: *
JSON contains timeline, sections, weekly_plan, auditSummary, dropReport
```

Verify CORS preflight:

```bash
curl -i -X OPTIONS http://127.0.0.1:<port>/api/datasets/upAhead
```

Expected:

```text
204 or 200
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## Manual deployment

Deploy manually from an authenticated Cloudflare environment outside this repository:

```bash
cd cloudflare/upahead-dataset-api
npx wrangler deploy
```

This repository does not contain Cloudflare account IDs, route IDs, zone IDs, API tokens, secrets, or deployment automation.

## GitHub repository variable activation

After the Worker is deployed, configure the frontend build variable:

```text
Repository Settings -> Secrets and variables -> Actions -> Variables
Name: VITE_API_BASE_URL
Value: https://<deployed-worker-host>
```

Do not include `/api/datasets/upAhead` in `VITE_API_BASE_URL`. The frontend client appends that endpoint path.

Before or after setting the repository variable, verify the base URL format without network access:

```bash
VITE_API_BASE_URL=https://<deployed-worker-host> node scripts/verify_up_ahead_edge_activation_config.mjs
```

## Activation readiness command

Run the full local readiness pack in no-network default mode:

```bash
npm run test:upahead-edge-readiness
```

To require a configured Worker base URL:

```bash
VITE_API_BASE_URL=https://<deployed-worker-host> npm run test:upahead-edge-readiness -- --require-config
```

To opt into the existing live smoke path after manual deployment:

```bash
VITE_API_BASE_URL=https://<deployed-worker-host> npm run test:upahead-edge-readiness -- --require-config --smoke
```

`--smoke` is optional and is not used by the default readiness command.

`VITE_BACKEND_URL` is retained only as a backward-compatible fallback. Prefer `VITE_API_BASE_URL` for new activation.

Trigger or observe the next GitHub Pages build after setting the variable.

## Post-deploy API verification

Verify the deployed Worker endpoint:

```bash
curl -i https://<deployed-worker-host>/api/datasets/upAhead
```

Expected:

```text
HTTP 200
Content-Type: application/json
Cache-Control: no-cache
Access-Control-Allow-Origin: *
JSON contains timeline, sections, weekly_plan, auditSummary, dropReport
```

Verify deployed preflight handling:

```bash
curl -i -X OPTIONS https://<deployed-worker-host>/api/datasets/upAhead
```

Expected:

```text
204 or 200
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

Optional smoke harness verification:

```bash
UP_AHEAD_API_BASE_URL=https://<deployed-worker-host> node scripts/smoke_up_ahead_edge_api.mjs
```

The smoke harness appends `/api/datasets/upAhead`, checks GET, OPTIONS, JSON shape, CORS, and no-cache headers, and fails if no base URL is supplied.

## Frontend verification

After the GitHub Pages build completes:

1. Open the deployed static frontend.
2. Confirm the build used `VITE_API_BASE_URL` without the endpoint path.
3. Confirm the browser requests:

```text
https://<deployed-worker-host>/api/datasets/upAhead
```

4. Confirm Up Ahead data remains visible.
5. Temporarily test failure behavior in a non-production environment by clearing the variable or pointing to an unavailable placeholder, then rebuilding Pages; the app should return to static snapshot fallback.

## Rollback / disable path

Rollback is performed by clearing or removing the GitHub Actions repository variable:

```text
VITE_API_BASE_URL
```

Then rebuild/redeploy GitHub Pages so the static frontend returns to static snapshot fallback.

If `VITE_BACKEND_URL` was also set, clear it as well unless it is intentionally used as the backward-compatible fallback.

## Troubleshooting

- `404` from Worker: verify the request path is exactly `/api/datasets/upAhead`.
- `405` from Worker: verify the request method is `GET` or `OPTIONS`.
- Empty fallback payload: verify `UP_AHEAD_DATASET_URL` points to a reachable `up_ahead.json` file.
- CORS failure: verify `Access-Control-Allow-Origin: *` is present in Worker responses.
- Frontend still uses snapshots: verify `VITE_API_BASE_URL` is set as a repository variable and Pages was rebuilt after the change.
- Double endpoint path: verify `VITE_API_BASE_URL` does not include `/api/datasets/upAhead`.

## Non-goals

- No Worker source changes.
- No real Cloudflare account, route, zone, token, secret, or deployed URL in source.
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
