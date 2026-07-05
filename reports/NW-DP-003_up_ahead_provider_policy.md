# NW-DP-003 — Up Ahead Provider Policy

## Mission statement

NW-DP-003 makes Up Ahead source selection policy-aware so Smart/static/API modes do not silently run browser live feed fetch after usable cache/static data.

## Files changed

- `src/data/datasets/upAheadDataset.js`
- `src/data/datasets/upAheadProviderPolicy.js`
- `src/data/datasets/upAheadProviderPolicy.cert.test.js`
- `scripts/test_up_ahead_provider_policy_static.mjs`
- `reports/NW-DP-003_up_ahead_provider_policy.md`

## Current source problem

Before this change, `upAheadDataset.load(...)` read cache/static data but then always entered the browser live fetch block. That meant Smart/static/API-capable modes could still fall through to the existing JS live/intelligent feed path even after usable cache/static data was available.

## Provider policy decision model

`resolveUpAheadProviderPolicy(...)` now decides:

```text
shouldReadCache
shouldReadStatic
shouldAttemptLive
browserWideFeedFetchAllowed
runtimeKind
preferDatasetApi
preferStaticSnapshots
liveReason / skippedLiveReason
```

The helper is deterministic and takes only explicit inputs:

```text
options
runtimeCapabilities
hasUsableCache
hasUsableStatic
```

## Before Up Ahead source flow

```text
cache if allowed
static if allowed
live fetch always attempted
```

## After Up Ahead source flow

```text
resolve initial provider policy
cache if policy permits
static if policy permits
resolve final provider policy with usable cache/static flags
live fetch only if providerDecision.shouldAttemptLive
otherwise add live-skipped diagnostic
```

## Compatibility behavior

- Legacy/default browser runtime remains compatible with the old cache -> static -> live merge behavior where browser-wide feed fetch is allowed.
- Smart mode does not live-fetch after usable cache or static data.
- Static-only runtime does not browser-live-fetch in Smart/static paths.
- Static-with-dataset-api runtime does not use browser live fetch as a fake API fallback.
- Developer-live/liveOnly may use the existing JS live path only when runtime policy allows browser-wide feed fetch.
- `forceRefresh` bypasses cache via `shouldReadCache=false`, but does not grant live permission on static runtimes.

Intentional compatibility note:

```text
Legacy/default behavior is preserved for browser runtimes.
Static/static-with-dataset-api runtimes are guarded from browser-wide live fallback to avoid the exact DP-003 failure mode.
```

## Diagnostics added

- `upAheadDataset.provider_policy`
- `upAheadDataset.live_skipped_policy`
- `upAheadDataset.live_skipped_runtime`

Existing diagnostics such as `cache_hit`, `static_loaded`, `static_empty`, `live_loaded`, `live_empty`, and `live_failed` are preserved.

## Test matrix

Focused cert coverage includes:

1. Smart + usable static skips live.
2. Smart + usable cache skips live.
3. Smart + no usable cache/static can live only when runtime allows browser feeds.
4. Static-only runtime blocks browser live fetch.
5. Static-with-dataset-api runtime blocks fake browser-live API fallback.
6. Developer-live/liveOnly only attempts live when runtime permits.
7. Force refresh bypasses cache but does not grant static live permission.
8. Legacy/default remains live-compatible on browser runtime.
9. Provider decision carries diagnostic fields.

Static guard checks:

```text
upAheadDataset imports provider policy helper
live fetch is guarded by providerDecision.shouldAttemptLive
old unconditional live fetch block is absent
provider-policy diagnostic exists
report includes NW-DP-003 and Non-goals
```

## Validation run

Planned validation commands:

```bash
npx vitest run --config vitest.config.js src/data/datasets/upAheadProviderPolicy.cert.test.js
node scripts/test_up_ahead_provider_policy_static.mjs
npm run lint
npm run build
npm run test:certify
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Non-goals

- No provider abstraction.
- No edge/data-plane implementation.
- No API/R2 fetch implementation.
- No Python prefetch changes.
- No JS live engine rewrite.
- No Up Ahead UI changes.
- No generated snapshot changes.
- No runtime capability changes.
- No dataset orchestrator changes.
- No `upAheadService.js` internals changes.
- No `intelligentUpAheadFetcher.js` changes.
- No `rssAggregator.js` changes.
- No GitHub Actions workflow changes.
