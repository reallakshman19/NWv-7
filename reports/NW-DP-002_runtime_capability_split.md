# NW-DP-002 — Runtime Capability Split

## Mission statement

NW-DP-002 splits static frontend classification from dataset API runtime capability so a deployed static frontend can still use a configured dataset API without being forced into snapshot-only mode.

## Files changed

- `src/runtime/runtimeCapabilities.js`
- `src/runtime/runtimeCapabilities.cert.test.js`
- `scripts/test_runtime_capability_split_static.mjs`
- `reports/NW-DP-002_runtime_capability_split.md`

## Before call flow

```text
static host detected
  -> preferSnapshots = true
  -> backendConfigured = false
  -> canUseApi = false
  -> runtimeLabel = static-host
```

This made static frontend deployment and API availability inseparable.

## After call flow

```text
resolveRuntimeCapabilities(input)
  -> detect static frontend
  -> detect configured dataset API separately
  -> canUseDatasetApi = configured dataset API OR local runtime API
  -> preferSnapshots only when forced or static host has no dataset API
```

## Compatibility behavior

- Existing static hosts with no configured API still use snapshot-first behavior.
- `preferSnapshots=true` override still forces snapshot mode.
- Local non-static runtime still reports `canUseBackendApi`, `canUseApi`, and `canUseDatasetApi` as available.
- Legacy remote settings/storage fields remain tied to the existing local backend compatibility field.
- New dataset API fields are additive: `canUseDatasetApi`, `datasetApiConfigured`, `canUseConfiguredDatasetApi`, `canUseLocalRuntimeApi`, and `datasetRuntimeMode`.

## Validation run

Planned validation commands:

```bash
npx vitest run --config vitest.config.js src/runtime/runtimeCapabilities.cert.test.js
node scripts/test_runtime_capability_split_static.mjs
npm run lint
npm run build
npm run test:certify
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Non-goals

- No edge data-plane implementation.
- No dataset loader/provider switch.
- No Up Ahead provider policy change.
- No UI changes.
- No GitHub Actions workflow changes.
- No generated `public/newsdata/*` or `public/data/*` snapshot changes.
- No `rssAggregator.js` changes.
- No broad Main UI/view-model refactor.
