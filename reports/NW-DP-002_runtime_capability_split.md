# NW-DP-002 — Runtime Capability Split

## Mission statement

NW-DP-002 splits static frontend classification from dataset API runtime capability so a deployed static frontend can still use a configured dataset API without being forced into snapshot-only mode.

## Files changed

- `src/runtime/runtimeCapabilities.js`
- `src/runtime/runtimeCapabilities.cert.test.js`
- `scripts/test_runtime_capability_split_static.mjs`
- `reports/NW-DP-002_runtime_capability_split.md`

## Old behavior problem

```text
static host detected
  -> preferSnapshots = true
  -> backendConfigured = false
  -> canUseApi = false
  -> runtimeLabel = static-host
```

This made static frontend deployment and API availability inseparable. A static frontend on GitHub Pages, Netlify, Vercel, or Cloudflare Pages could not advertise a configured dataset API without being forced into snapshot-first behavior.

## New capability model

`resolveRuntimeCapabilities(input)` now separates these concepts:

```text
staticFrontend
configuredBackendUrl
datasetApiConfigured
canUseDatasetApi
preferDatasetApi
preferStaticSnapshots
staticSnapshotFallback
browserWideFeedFetchAllowed
forceSnapshots
runtimeKind
```

The supported runtime kinds are:

```text
static-only
static-with-dataset-api
browser-runtime
server-or-test
```

## Behavior matrix

```text
Static frontend + no configured API
  -> runtimeKind = static-only
  -> preferStaticSnapshots = true
  -> canUseDatasetApi = false
  -> browserWideFeedFetchAllowed = false

Static frontend + configured API
  -> runtimeKind = static-with-dataset-api
  -> preferDatasetApi = true
  -> preferStaticSnapshots = false
  -> canUseDatasetApi = true
  -> browserWideFeedFetchAllowed = false

Local/non-static browser runtime
  -> runtimeKind = browser-runtime
  -> preferDatasetApi = true
  -> canUseDatasetApi = true
  -> browserWideFeedFetchAllowed = true

Snapshot override
  -> forceSnapshots = true
  -> preferStaticSnapshots = true
  -> preferDatasetApi = false
  -> canUseDatasetApi = false
  -> browserWideFeedFetchAllowed = false
```

## Compatibility mapping

Legacy fields are preserved and mapped from the split model:

```text
preferSnapshots = preferStaticSnapshots
allowWideFeedFetch = browserWideFeedFetchAllowed
backendConfigured / canUseBackendApi / canUseApi = canUseDatasetApi
isStaticHost = staticFrontend
```

Existing mode labels remain compatible:

```text
weatherMode
marketMode
upAheadMode
plannerSyncMode
featureStatus
runtimeLabel
```

## Test matrix

The focused cert covers:

- GitHub Pages with no API -> `static-only`
- Cloudflare Pages with API -> `static-with-dataset-api`
- Netlify with API -> `static-with-dataset-api`
- Vercel with no API -> `static-only`
- localhost browser runtime -> `browser-runtime`
- snapshot override with configured API -> snapshots still win
- localStorage-style snapshot override semantics via resolver input
- Node/test environment -> `server-or-test`
- compatibility fields remain present
- dataset API on static frontend does not enable browser wide-feed fetch

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

- Not run locally in this connector session; GitHub Actions must validate the PR head.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Non-goals

- No edge data-plane implementation.
- No dataset loader/provider switch.
- No Up Ahead provider policy change.
- No provider abstraction.
- No UI changes.
- No GitHub Actions workflow changes.
- No generated `public/newsdata/*` or `public/data/*` snapshot changes.
- No `rssAggregator.js` changes.
- No broad Main UI/view-model refactor.
