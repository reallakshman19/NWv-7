# NW-DP-006 — Static Frontend Dataset API Env Integration

## Mission statement

NW-DP-006 wires and certifies static frontend dataset API environment configuration so the GitHub Pages build can opt into the `/api/datasets/upAhead` provider chain with `VITE_API_BASE_URL` / `VITE_BACKEND_URL`, without implementing cloud/edge/R2 infrastructure.

## Files changed

- `.github/workflows/deploy.yml`
- `.env.example`
- `scripts/test_dataset_api_env_deploy_static.mjs`
- `reports/NW-DP-006_dataset_api_env_integration.md`

## Current source problem

NW-DP-002, NW-DP-004, and NW-DP-005 established runtime API configuration, an Up Ahead client provider path, and a local endpoint contract. The GitHub Pages deploy workflow still built with `npm run build` without passing an optional dataset API base URL into the Vite build, and `.env.example` did not document the dataset API base URL contract.

## Env variables supported

```text
VITE_API_BASE_URL=
VITE_BACKEND_URL=
```

`VITE_API_BASE_URL` is the preferred dataset API base URL. `VITE_BACKEND_URL` is retained for backward compatibility. Do not include `/api/datasets/upAhead` in either base URL; the client appends that endpoint path.

## GitHub Pages variable setup instructions

Configure an optional public repository variable:

```text
Repository Settings
→ Secrets and variables
→ Actions
→ Variables
→ New repository variable
Name: VITE_API_BASE_URL
Value: https://<dataset-api-host>
```

Optional backward-compatible fallback:

```text
Name: VITE_BACKEND_URL
Value: https://<dataset-api-host>
```

Prefer `VITE_API_BASE_URL` for new deployments.

## Before deployment behavior

```text
GitHub Pages build
  -> npm run build
  -> no VITE_API_BASE_URL/VITE_BACKEND_URL passed by deploy workflow
  -> static frontend cannot opt into configured dataset API at build time
```

## After deployment behavior

```text
GitHub Pages build
  -> npm run build with optional vars.VITE_API_BASE_URL and vars.VITE_BACKEND_URL
  -> Vite embeds configured public API base URL when repository variable is set
  -> DP-004 client appends /api/datasets/upAhead
```

## Fallback behavior when env is unset

If `VITE_API_BASE_URL` and `VITE_BACKEND_URL` are unset, Vite receives empty values and the app continues to use the existing static snapshot fallback path. Normal GitHub Pages builds remain valid without repository variables.

## Compatibility behavior

- Existing deploy triggers, including `workflow_run`, are preserved.
- Existing Pages deployment mechanics are preserved.
- Existing `npm run build` command is preserved.
- Vite local `/api` proxy to `http://127.0.0.1:3001` is unchanged.
- DP-004 client endpoint path remains `/api/datasets/upAhead`.
- DP-005 server endpoint path remains `/api/datasets/upAhead`.

## Test matrix

Static guard covers:

1. Deploy workflow exposes `VITE_API_BASE_URL` from repository variables.
2. Deploy workflow exposes `VITE_BACKEND_URL` from repository variables.
3. Deploy workflow preserves `workflow_run` triggers.
4. Deploy workflow preserves `npm run build`.
5. `.env.example` documents `VITE_API_BASE_URL` and `VITE_BACKEND_URL`.
6. `.env.example` warns not to include `/api/datasets/upAhead`.
7. `.env.example` documents static snapshot fallback when unset.
8. Vite `/api` proxy remains `http://127.0.0.1:3001`.
9. DP-004 client path remains `/api/datasets/upAhead`.
10. DP-005 server endpoint remains `/api/datasets/upAhead`.
11. Report/non-goals presence.

## Validation run

Planned validation commands:

```bash
node scripts/test_dataset_api_env_deploy_static.mjs
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
- No production API host provisioning.
- No backend deployment.
- No multi-dataset provider abstraction.
- No runtime capability source changes.
- No dataset orchestrator changes.
- No Up Ahead client/provider policy changes.
- No JS live engine rewrite.
- No generated snapshot changes.
- No UI/view-model/component changes.
