# NW-DP-009 — Up Ahead Edge API Smoke Verification

## Mission statement

NW-DP-009 adds a source-safe smoke verification harness for the deployed Up Ahead edge dataset API so an operator can validate a real `VITE_API_BASE_URL` / Worker host outside source control, without committing deployed URLs, secrets, account IDs, or GitHub Actions automation.

## Files changed

- `scripts/smoke_up_ahead_edge_api.mjs`
- `scripts/test_up_ahead_edge_smoke_static.mjs`
- `cloudflare/upahead-dataset-api/DEPLOYMENT.md`
- `reports/NW-DP-009_up_ahead_edge_smoke_verification.md`

## Current source problem

NW-DP-007 added the Cloudflare Worker package and NW-DP-008 added the manual activation runbook. Operators still needed a reusable, source-safe command to verify a deployed Worker host after activation without committing a deployed URL or adding deployment automation.

## Smoke command usage

Environment variable form:

```bash
UP_AHEAD_API_BASE_URL=https://<deployed-worker-host> node scripts/smoke_up_ahead_edge_api.mjs
```

CLI argument form:

```bash
node scripts/smoke_up_ahead_edge_api.mjs https://<deployed-worker-host>
```

The supplied value must be the base URL only. Do not include:

```text
/api/datasets/upAhead
```

The script strips query/hash if accidentally supplied and appends the endpoint path exactly once.

## Checks performed

GET check:

```text
GET <base-url>/api/datasets/upAhead
HTTP 200
Content-Type includes application/json
Cache-Control includes no-cache
Access-Control-Allow-Origin includes *
JSON payload is an object
JSON contains timeline, sections, weekly_plan, auditSummary, dropReport
```

OPTIONS check:

```text
OPTIONS <base-url>/api/datasets/upAhead
HTTP 200 or 204
Access-Control-Allow-Origin includes *
Access-Control-Allow-Methods includes GET
Access-Control-Allow-Methods includes OPTIONS
```

The script tolerates either live upstream data or structured fallback data as long as the contract shape is valid.

## Source-safety behavior

- Base URL is supplied only through `UP_AHEAD_API_BASE_URL` or CLI argument.
- No deployed Worker URL is committed.
- No Cloudflare account ID, zone ID, route, token, or secret is read or committed.
- Query string and hash are stripped from the supplied URL before display and request construction.
- The script does not write artifacts by default.
- The script exits non-zero when no base URL is supplied and prints usage.
- The script exits non-zero when any smoke check fails.

## Compatibility behavior

- Worker source remains unchanged.
- Wrangler example remains unchanged.
- Frontend runtime/client/provider source remains unchanged.
- GitHub Actions workflows remain unchanged.
- Generated snapshots remain unchanged.
- Deployment runbook now references the smoke command without duplicating script logic.

## Test matrix

Static guard covers:

1. Smoke script exists.
2. Smoke script accepts `UP_AHEAD_API_BASE_URL`.
3. Smoke script accepts CLI argument.
4. Smoke script appends `/api/datasets/upAhead` exactly.
5. Smoke script checks GET status 200.
6. Smoke script checks JSON Content-Type.
7. Smoke script checks no-cache Cache-Control.
8. Smoke script checks Access-Control-Allow-Origin.
9. Smoke script checks OPTIONS and allowed methods.
10. Smoke script validates `timeline`, `sections`, `weekly_plan`, `auditSummary`, and `dropReport`.
11. Smoke script contains no real `.workers.dev` URL.
12. Smoke script contains no account/token/secret patterns.
13. Worker source remains aligned with `/api/datasets/upAhead`.
14. DEPLOYMENT.md references the smoke command.
15. Report/non-goals presence.

## Validation run

Planned validation commands:

```bash
node scripts/test_up_ahead_edge_smoke_static.mjs
node scripts/smoke_up_ahead_edge_api.mjs
npm run lint
npm run build
npm run test:certify
```

Expected focused behavior:

```text
node scripts/smoke_up_ahead_edge_api.mjs
```

should fail with usage when no URL is supplied.

Optional operator-only validation, not committed:

```bash
UP_AHEAD_API_BASE_URL=https://<deployed-worker-host> node scripts/smoke_up_ahead_edge_api.mjs
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Non-goals

- No Worker source changes.
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
