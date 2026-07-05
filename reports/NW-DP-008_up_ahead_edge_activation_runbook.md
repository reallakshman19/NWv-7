# NW-DP-008 — Up Ahead Edge Activation Runbook

## Mission statement

NW-DP-008 adds a deployment activation runbook and verification checklist for the Up Ahead edge dataset API host so the Worker package from NW-DP-007 can be safely deployed and connected via `VITE_API_BASE_URL`, without committing secrets, account IDs, routes, or GitHub Actions deployment automation.

## Files changed

- `cloudflare/upahead-dataset-api/DEPLOYMENT.md`
- `cloudflare/upahead-dataset-api/README.md`
- `scripts/test_up_ahead_edge_activation_runbook_static.mjs`
- `reports/NW-DP-008_up_ahead_edge_activation_runbook.md`

## Current source problem

NW-DP-007 added a source-only Cloudflare Worker package and NW-DP-006 wired the static frontend build variable. The remaining gap was an operator-safe manual activation sequence that explains local configuration, local validation, manual deployment, GitHub variable activation, post-deploy verification, frontend verification, and rollback without committing environment-specific Cloudflare values.

## Activation sequence

1. Copy `wrangler.toml.example` to a local `wrangler.toml`.
2. Set `UP_AHEAD_DATASET_URL` to the published static `up_ahead.json` URL.
3. Run local Worker validation with `npx wrangler dev`.
4. Verify local API and CORS behavior with `curl`.
5. Deploy manually with `npx wrangler deploy` from an authenticated Cloudflare environment.
6. Set GitHub Actions repository variable `VITE_API_BASE_URL` to the deployed Worker base URL only.
7. Trigger or observe the next GitHub Pages build.
8. Verify the static frontend calls `/api/datasets/upAhead` through the deployed Worker.

## Verification checklist

The runbook documents verification for:

- `curl -i http://127.0.0.1:<port>/api/datasets/upAhead`
- `curl -i -X OPTIONS http://127.0.0.1:<port>/api/datasets/upAhead`
- `curl -i https://<deployed-worker-host>/api/datasets/upAhead`
- `curl -i -X OPTIONS https://<deployed-worker-host>/api/datasets/upAhead`

Expected API response:

```text
HTTP 200
Content-Type: application/json
Cache-Control: no-cache
Access-Control-Allow-Origin: *
JSON contains timeline, sections, weekly_plan, auditSummary, dropReport
```

Expected preflight response:

```text
204 or 200
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## Rollback path

Rollback is done by clearing or removing the GitHub Actions repository variable:

```text
VITE_API_BASE_URL
```

Then rebuild/redeploy GitHub Pages so the app returns to static snapshot fallback. If `VITE_BACKEND_URL` was set, clear it as well unless it is intentionally retained as a backward-compatible fallback.

## Safety boundaries

- `wrangler.toml` remains local/uncommitted.
- `UP_AHEAD_DATASET_URL` uses placeholders in repository documentation.
- `VITE_API_BASE_URL` uses placeholders in repository documentation.
- No real Cloudflare account IDs, zone IDs, routes, API tokens, secrets, or deployed Worker URLs are committed.
- No GitHub Actions deployment automation is added.

## Compatibility behavior

- Worker source is unchanged.
- `wrangler.toml.example` is unchanged.
- Existing frontend/runtime/client/provider behavior is unchanged.
- Existing GitHub Pages deploy workflow is unchanged.
- Static snapshot fallback remains the rollback path.

## Test matrix

Static guard covers:

1. `DEPLOYMENT.md` exists.
2. Required runbook sections exist.
3. `cp wrangler.toml.example wrangler.toml` is documented.
4. `UP_AHEAD_DATASET_URL` placeholder is documented.
5. `npx wrangler dev` and `npx wrangler deploy` are documented.
6. `VITE_API_BASE_URL` setup is documented.
7. The endpoint path must not be included in `VITE_API_BASE_URL`.
8. Local and deployed API `curl` verification is documented.
9. `OPTIONS` preflight verification is documented.
10. Rollback by clearing/removing `VITE_API_BASE_URL` is documented.
11. No forbidden real Cloudflare account/zone/token/worker URL patterns are present.
12. README links to `DEPLOYMENT.md`.
13. Worker source still exposes `/api/datasets/upAhead`.
14. Wrangler example remains placeholder-only.
15. Report/non-goals presence.

## Validation run

Planned validation commands:

```bash
node scripts/test_up_ahead_edge_activation_runbook_static.mjs
npm run lint
npm run build
npm run test:certify
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Non-goals

- No Worker source changes.
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
