# NW-DP-001 — Dataset Policy Propagation

## Mission statement

NW-DP-001 makes dataset loading policy explicit by passing normalized force/live/smart options from `useDataset` into dataset loaders with policy-aware cache keys.

## Files changed

- `src/data/orchestrator/datasetPolicy.js`
- `src/data/orchestrator/useDataset.js`
- `src/data/orchestrator/datasetPolicyPropagation.cert.test.js`
- `scripts/test_dataset_policy_propagation_static.mjs`
- `reports/NW-DP-001_dataset_policy_propagation.md`

## Before call flow

```text
loadDataset(datasetId, force)
  -> effectiveForce = force || isLiveMode()
  -> memory cache key = datasetId
  -> in-flight key = datasetId
  -> loader.load()
```

## After call flow

```text
loadDataset(datasetId, options)
  -> normalizeDatasetOptions(options, { liveMode: isLiveMode() })
  -> buildDatasetCacheKey(datasetId, normalizedOptions)
  -> bypass cache/in-flight when forceRefresh=true
  -> loader.load(normalizedOptions)
```

## Compatibility behavior

- `loadDataset('main', true)` still means force refresh.
- Existing Live mode still forces refresh through normalization.
- Live mode defaults to `policy: 'developer-live'` unless a caller explicitly supplies another policy.
- Default legacy cache identity remains the dataset ID for compatibility.
- `includeInsight`, `liveOnly`, explicit non-legacy `policy`, and `asOfDate` create distinct cache identities.
- `useDataset(datasetId).reload(true)` still performs a force refresh.

## Validation run

Planned validation commands:

```bash
npx vitest run --config vitest.config.js src/data/orchestrator/datasetPolicyPropagation.cert.test.js
node scripts/test_dataset_policy_propagation_static.mjs
npm run lint
npm run build
npm run test:certify
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Non-goals

- No edge data-plane implementation.
- No runtime capability classification changes.
- No Up Ahead provider policy changes.
- No UI changes.
- No GitHub Actions workflow changes.
- No generated `public/newsdata/*` or `public/data/*` snapshot changes.
- No `rssAggregator.js` changes.
- No broad Main UI/view-model refactor.
