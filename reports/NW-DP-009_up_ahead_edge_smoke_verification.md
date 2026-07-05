# NW-DP-009 — Up Ahead Edge API Smoke Verification

## Mission statement

NW-DP-009 adds a source-safe smoke verification harness for the deployed Up Ahead edge dataset API so an operator can validate a real `VITE_API_BASE_URL` / Worker host outside source control, without committing deployed URLs, secrets, account IDs, or GitHub Actions automation.

## Files changed

- `scripts/smoke_up_ahead_edge_api.mjs`
- `scripts/test_up_ahead_edge_smoke_static.mjs`
- `cloudflare/upahead-dataset-api/DEPLOYMENT.md`
- `reports/NW-DP-009_up_ahead_edge_smoke_verification.md`

## Current source problem

NW-DP-007 added the Cloudflare Worker package, and NW-DP-008 added the manual activation runbook. Operators still lacked a reusable source-safe smoke command that validates a deployed Worker base URL without committing real deployed hostnames or account-specific values.

## Smoke command usage

Supply the deployed Worker base URL through an environment variable:

```bash
UP_AHEAD_API_BASE_URL=https://<deployed-worker-host> node scripts/smoke_up_ahead_edge_api.mjs
```

Or as a CLI argument:

```bash
node scripts/smoke_up_ahead_edge_api.mjs https://<deployed-worker-host>
```

The script rejects a supplied URL that already includes `/api/datasets/upAhead`; provide only the Worker base URL. Query strings and hash fragments are stripped by URL normalization before logging or requests.

## Checks performed

GET verification checks:

- Endpoint path construction: `<base-url>/api/datasets/upAhead`.
- HTTP status is `200`.
- `Content-Type` includes `application/json`.
- `Cache-Control` includes `no-cache`.
- `Access-Control-Allow-Origin` includes `*`.
- JSON is an object.
- JSON contains `timeline`, `sections`, `weekly_plan`, `auditSummary`, and `dropReport`.

OPTIONS verification checks:

- HTTP status is `200` or `204`.
- `Access-Control-Allow-Origin` includes `*`.
- `Access-Control-Allow-Methods` includes `GET`.
- `Access-Control-Allow-Methods` includes `OPTIONS`.

The script tolerates either live upstream data or the structured fallback payload as long as the required shape is present.

## Source-safety behavior

- No deployed Worker URL is committed.
- No Cloudflare account ID, route ID, zone ID, API token, or secret is committed.
- The script reads only `UP_AHEAD_API_BASE_URL` or a CLI argument.
- The script does not write artifacts by default.
- The script exits non-zero when no base URL is supplied or when checks fail.

## Compatibility behavior

- Worker source remains unchanged.
- Wrangler example remains unchanged.
- Frontend runtime/client/provider source remains unchanged.
- Local Python API source remains unchanged.
- GitHub Actions workflows remain unchanged.
- Generated data snapshots remain unchanged.

## Test matrix

Static guard covers:

1. Smoke script exists.
2. Smoke script accepts `UP_AHEAD_API_BASE_URL`.
3. Smoke script accepts CLI argument.
4. Smoke script appends `/api/datasets/upAhead` exactly.
5. Smoke script checks GET status `200`.
6. Smoke script checks JSON `Content-Type`.
7. Smoke script checks `Cache-Control: no-cache`.
8. Smoke script checks `Access-Control-Allow-Origin`.
9. Smoke script checks `OPTIONS` and allowed methods.
10. Smoke script validates required JSON keys.
11. Smoke script contains no `.workers.dev` URL.
12. Smoke script contains no account/token/secret patterns.
13. Worker source remains aligned with `/api/datasets/upAhead`.
14. `DEPLOYMENT.md` references the smoke command.
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

Expected local behavior for no-url smoke command:

```text
node scripts/smoke_up_ahead_edge_api.mjs
```

returns non-zero with usage because no base URL is supplied.

Optional operator-only validation, not committed:

```bash
UP_AHEAD_API_BASE_URL=https://<deployed-worker-host> node scripts/smoke_up_ahead_edge_api.mjs
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- No real deployed Worker URL was supplied or committed.
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
