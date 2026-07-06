# NW-DP-025 — Up Ahead Edge Activation Readiness

## Mission statement

NW-DP-025 adds an operator-facing Up Ahead edge activation readiness command that combines no-network activation config validation with the maintained edge/API/Data Health certification runner, without changing app behavior or deployment automation.

## Files changed

- `package.json`
- `scripts/check_up_ahead_edge_readiness.mjs`
- `scripts/test_up_ahead_edge_readiness_static.mjs`
- `cloudflare/upahead-dataset-api/DEPLOYMENT.md`
- `reports/NW-DP-025_up_ahead_edge_readiness.md`

## Current gap

The repository already had:

```text
scripts/verify_up_ahead_edge_activation_config.mjs
scripts/run_up_ahead_edge_api_tests.mjs
npm run test:upahead-edge-api
```

Operators still needed one command to validate local readiness before or after manual activation. The command needed to validate source/config readiness without performing live network access unless explicitly requested.

## Readiness command

Added package script:

```bash
npm run test:upahead-edge-readiness
```

It delegates to:

```bash
node scripts/check_up_ahead_edge_readiness.mjs
```

## Default behavior

Default mode runs no-network checks:

```text
node scripts/verify_up_ahead_edge_activation_config.mjs --allow-empty
node scripts/run_up_ahead_edge_api_tests.mjs
```

`--allow-empty` keeps default readiness useful in local/CI source validation even when no deployed Worker base URL has been configured.

## Optional flags

The readiness command supports:

```text
--require-config
--smoke
```

`--require-config` removes `--allow-empty` from the activation verifier call, so readiness fails when no base URL is supplied through CLI/env.

`--smoke` forwards to the existing activation verifier smoke path. It is not enabled by default.

Example:

```bash
VITE_API_BASE_URL=https://<deployed-worker-host> npm run test:upahead-edge-readiness -- --require-config --smoke
```

## Runner behavior

`scripts/check_up_ahead_edge_readiness.mjs` uses Node built-ins only and executes commands through `child_process.spawn` with `shell: false`.

It runs commands sequentially and stops on the first non-zero exit code.

## Runbook update

Updated:

```text
cloudflare/upahead-dataset-api/DEPLOYMENT.md
```

The runbook now includes one short readiness command section covering:

```text
npm run test:upahead-edge-readiness
--require-config
--smoke
no-network default behavior
```

## Static guard

Added:

```bash
node scripts/test_up_ahead_edge_readiness_static.mjs
```

The guard verifies:

```text
readiness command exists
package script exists
activation config verifier is used
edge API runner is used
default mode uses --allow-empty
--require-config is supported
--smoke is supported
unknown arguments fail
runbook references the readiness command
runbook documents no-network, --require-config, and --smoke
report/non-goals exist
```

## Validation run

Planned validation commands:

```bash
node scripts/test_up_ahead_edge_readiness_static.mjs
npm run test:upahead-edge-readiness
npm run test:upahead-edge-api
npm run lint
npm run build
npm run test:certify
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Compatibility behavior

- Existing activation verifier behavior is reused.
- Existing edge API/Data Health runner behavior is reused.
- Existing `npm run test:upahead-edge-api` behavior remains unchanged.
- No app behavior changes.
- No Worker behavior changes.
- No dataset loading behavior changes.
- No generated data changes.
- No workflow changes.
- No deployment automation changes.

## Non-goals

- No Worker source changes.
- No Wrangler example changes.
- No workflow changes.
- No runtime capability source changes.
- No dataset loader/client/provider changes.
- No service changes.
- No server script changes.
- No generated data changes.
- No UI/component/view-model implementation changes.
- No certification runner changes.
- No deployment automation.
