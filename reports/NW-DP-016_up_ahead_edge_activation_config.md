# NW-DP-016 — Up Ahead Edge Activation Config Verifier

## Mission statement

NW-DP-016 adds a source-safe activation config verifier for the Up Ahead edge API so operators can validate `VITE_API_BASE_URL` / Worker base URL formatting before or after manual activation, without committing real URLs, secrets, deployment automation, frontend changes, or generated data changes.

## Files changed

- `scripts/verify_up_ahead_edge_activation_config.mjs`
- `scripts/test_up_ahead_edge_activation_config_static.mjs`
- `cloudflare/upahead-dataset-api/DEPLOYMENT.md`
- `reports/NW-DP-016_up_ahead_edge_activation_config.md`

## Config contract

The verifier accepts the Worker base URL from, in priority order:

```text
CLI argument
VITE_API_BASE_URL
UP_AHEAD_API_BASE_URL
```

It verifies:

```text
URL is present unless --allow-empty is supplied
URL parses as a valid URL
URL protocol is http or https
URL has no query string
URL has no hash fragment
URL does not include /api/datasets/upAhead
normalized endpoint becomes <base>/api/datasets/upAhead exactly once
```

The verifier accepts base URLs such as:

```text
https://<deployed-worker-host>
https://<deployed-worker-host>/<optional-base-path>
```

The verifier rejects values such as:

```text
https://<deployed-worker-host>/api/datasets/upAhead
https://<deployed-worker-host>?x=1
https://<deployed-worker-host>#fragment
ftp://<deployed-worker-host>
```

## No-network default behavior

Default command:

```bash
VITE_API_BASE_URL=https://<deployed-worker-host> node scripts/verify_up_ahead_edge_activation_config.mjs
```

The default path only validates string/URL structure and prints PASS/FAIL. It does not perform network access.

The expected empty-configuration validation command is:

```bash
node scripts/verify_up_ahead_edge_activation_config.mjs --allow-empty
```

## Optional smoke behavior

If `--smoke` is supplied with a valid base URL, the verifier dynamically imports the existing smoke harness and delegates live endpoint validation:

```bash
VITE_API_BASE_URL=https://<deployed-worker-host> node scripts/verify_up_ahead_edge_activation_config.mjs --smoke
```

This networked smoke path is optional and is not required for static tests.

## Deployment runbook update

`cloudflare/upahead-dataset-api/DEPLOYMENT.md` now includes the activation verifier command near the `VITE_API_BASE_URL` repository variable activation instructions.

The runbook still uses only placeholders and does not commit real deployed URLs.

## Validation run

Planned validation commands:

```bash
node scripts/test_up_ahead_edge_activation_config_static.mjs
node scripts/verify_up_ahead_edge_activation_config.mjs --allow-empty
npm run test:upahead-edge-api
npm run lint
npm run build
npm run test:certify
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Compatibility behavior

- Worker source remains unchanged.
- Frontend/runtime/data/service code remains unchanged.
- Generated data remains unchanged.
- GitHub Actions workflows remain unchanged.
- Server scripts remain unchanged.
- Wrangler example remains unchanged.
- Certification runner remains unchanged.

## Non-goals

- No Worker source changes.
- No frontend/runtime/data/service changes.
- No generated data changes.
- No GitHub Actions workflow changes.
- No server script changes.
- No Wrangler example changes.
- No certification runner changes.
- No real deployed Worker URL in source.
- No secrets, account IDs, route IDs, or deployment automation.
- No R2/KV/storage changes.
- No multi-dataset provider abstraction.
