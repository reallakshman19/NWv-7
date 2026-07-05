# NW-DP-004 — Up Ahead Dataset API Provider Chain

## Mission statement

NW-DP-004 adds a client-side Up Ahead dataset API provider chain so `static-with-dataset-api` can try a configured dataset API before static fallback, without implementing any edge/server endpoint.

## Files changed

- `src/data/datasets/upAheadDataset.js`
- `src/data/datasets/upAheadProviderPolicy.js`
- `src/data/datasets/upAheadProviderPolicy.cert.test.js`
- `src/data/datasets/upAheadDatasetApiClient.js`
- `src/data/datasets/upAheadDatasetApiClient.cert.test.js`
- `src/data/datasets/upAheadDataset.providerChain.cert.test.js`
- `scripts/test_up_ahead_dataset_api_provider_static.mjs`
- `reports/NW-DP-004_up_ahead_dataset_api_provider_chain.md`

## Current source problem

After NW-DP-003, browser live fetch was policy-guarded, but Up Ahead still had no client-side dataset API provider. A `static-with-dataset-api` runtime could not try a configured API before static snapshot fallback.

## Provider chain decision model

`resolveUpAheadProviderPolicy(...)` now also emits:

```text
shouldAttemptDatasetApi
apiReason
apiSkippedReason
```

The API decision is based on:

```text
options
runtimeCapabilities.canUseDatasetApi
runtimeCapabilities.configuredBackendUrl
runtimeCapabilities.preferSnapshots / forceSnapshots
runtime kind
```

## Endpoint contract used by client

The client-only provider uses one stable endpoint path:

```text
/api/datasets/upAhead
```

Example:

```text
https://api.example.com/api/datasets/upAhead
```

The client uses `fetch(..., { cache: 'no-cache' })`, returns parsed JSON only for HTTP OK, and returns `null` for non-OK, invalid JSON, missing fetch, missing base URL, and network failures.

## Before Up Ahead source flow

```text
provider policy
cache if allowed
static if allowed
browser live only if providerDecision.shouldAttemptLive
```

## After Up Ahead source flow

```text
resolve initial provider policy
cache if policy permits
configured dataset API if policy permits
static snapshot fallback if API absent/empty/unusable
resolve final provider policy with cache/API/static flags
browser live only if providerDecision.shouldAttemptLive
```

## Compatibility behavior

- Static-only runtime still uses static snapshot fallback and does not browser-live-fetch.
- Static-with-dataset-api tries configured API first, then static fallback if API fails or is unusable.
- API success prevents static fallback and browser live fetch in Smart/static-with-dataset-api path.
- API failure or empty data falls back to the existing static snapshot path.
- DP-003 browser live-fetch guards remain intact.
- `forceRefresh` bypasses cache but does not grant browser live permission.
- `liveOnly` / `developer-live` skip cache/static/API reads and remain guarded by runtime live permission.

## Diagnostics added

- `upAheadDataset.api_attempted`
- `upAheadDataset.api_loaded`
- `upAheadDataset.api_empty`
- `upAheadDataset.api_failed`
- `upAheadDataset.api_skipped_policy`

Existing DP-003 diagnostics remain:

- `upAheadDataset.provider_policy`
- `upAheadDataset.live_skipped_policy`
- `upAheadDataset.live_skipped_runtime`
- `upAheadDataset.live_loaded`

## Test matrix

Focused tests cover:

1. Stable API URL construction.
2. API client returns parsed JSON on HTTP OK.
3. API client returns `null` on non-OK, missing base URL, missing fetch, JSON failure, and network failure.
4. Provider policy attempts API for static-with-dataset-api with configured URL.
5. Provider policy skips API for static-only runtime.
6. Provider policy skips API when snapshots are forced.
7. Dataset chain prefers usable API before static fallback.
8. Dataset chain falls back to static when API is unusable.
9. API success prevents browser live fetch in Smart/static-with-dataset-api path.
10. Static guard checks allowed-source integration and report.

## Validation run

Planned validation commands:

```bash
npx vitest run --config vitest.config.js src/data/datasets/upAheadProviderPolicy.cert.test.js
npx vitest run --config vitest.config.js src/data/datasets/upAheadDatasetApiClient.cert.test.js
npx vitest run --config vitest.config.js src/data/datasets/upAheadDataset.providerChain.cert.test.js
node scripts/test_up_ahead_dataset_api_provider_static.mjs
npm run lint
npm run build
npm run test:certify
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Non-goals

- No edge/data-plane implementation.
- No Cloudflare Worker/R2 implementation.
- No API server endpoint implementation.
- No multi-dataset provider abstraction.
- No Python prefetch changes.
- No JS live engine rewrite.
- No Up Ahead UI changes.
- No generated snapshot changes.
- No runtime capability changes.
- No dataset orchestrator changes.
- No service-layer changes.
- No `rssAggregator.js` changes.
- No GitHub Actions workflow changes.
