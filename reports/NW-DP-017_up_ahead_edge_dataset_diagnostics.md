# NW-DP-017 — Up Ahead Edge Dataset Diagnostics

## Mission statement

NW-DP-017 captures Up Ahead edge API response metadata in the dataset API client and attaches it to the Up Ahead dataset envelope diagnostics, without changing UI, Worker behavior, source-selection behavior, generated data, or deployment automation.

## Files changed

- `src/data/datasets/upAheadDatasetApiClient.js`
- `src/data/datasets/upAheadDataset.js`
- `src/data/datasets/upAheadDatasetApiClient.cert.test.js`
- `src/data/datasets/upAheadDataset.providerChain.cert.test.js`
- `scripts/test_up_ahead_edge_dataset_diagnostics_static.mjs`
- `reports/NW-DP-017_up_ahead_edge_dataset_diagnostics.md`

## Current gap

The edge API already returns readable response metadata headers, and smoke/verifier tools can inspect them. The app dataset API client previously returned parsed JSON only, so the Up Ahead dataset envelope did not record the edge metadata values in diagnostics.

## Diagnostics contract

The API client now exposes a metadata-aware helper:

```text
fetchUpAheadDatasetApiResponse(...)
```

It returns:

```text
{ data, diagnostics }
```

The diagnostics object contains normalized response header values:

```text
source
reason
freshness
ageSeconds
```

These values are read from:

```text
X-NW-UpAhead-Source
X-NW-UpAhead-Reason
X-NW-UpAhead-Freshness
X-NW-UpAhead-Age-Seconds
```

Absent headers normalize to:

```text
unknown
```

## Backward compatibility

The existing helper remains compatible:

```text
fetchUpAheadDatasetApiData(...)
```

It still returns plain JSON or `null`.

## Dataset envelope diagnostics

When the dataset API is attempted, `upAheadDataset.js` now records one diagnostics event:

```text
upAheadDataset.api_edge_diagnostics
```

The event details include:

```text
source
reason
freshness
ageSeconds
```

## Source-selection behavior

Provider order and acceptance behavior remain unchanged:

```text
cache -> dataset API -> static -> live policy
```

API data is still accepted only when existing visible-content logic passes. Edge metadata such as `stale` or `unknown` does not by itself reject usable API data.

## Test matrix

Focused tests cover:

1. Headers present -> metadata captured.
2. Headers absent -> unknown values.
3. Plain JSON helper remains compatible.
4. Provider diagnostics include `api_edge_diagnostics` when API is attempted.
5. Stale metadata does not reject usable API data.
6. Unknown metadata does not reject usable API data.

Static guard covers:

1. Metadata-aware helper exists.
2. Plain JSON helper remains present.
3. Four edge header names are read.
4. Provider pushes `upAheadDataset.api_edge_diagnostics`.
5. Visible-content gate remains present.
6. Focused tests cover metadata capture, absent headers, compatibility, and stale/unknown acceptance.
7. Report/non-goals presence.

## Validation run

Planned validation commands:

```bash
node scripts/test_up_ahead_edge_dataset_diagnostics_static.mjs
npm run test:upahead-edge-api
npm run lint
npm run build
npm run test:certify
```

Focused direct tests when practical:

```bash
npx vitest run --config vitest.config.js src/data/datasets/upAheadDatasetApiClient.cert.test.js src/data/datasets/upAheadDataset.providerChain.cert.test.js
```

Validation status from this connector session:

- Not run locally in this connector session; no shell runtime has access to the checked-out GitHub branch.
- PR must remain draft until GitHub Actions and/or local validation confirms the commands above.

## Compatibility behavior

- Worker behavior remains unchanged.
- UI/display behavior remains unchanged.
- Source-selection behavior remains unchanged.
- Generated data remains unchanged.
- Workflow/server/service/runtime behavior remains unchanged.

## Non-goals

- No Worker source changes.
- No Wrangler example changes.
- No workflow changes.
- No runtime capability source changes.
- No service changes.
- No server script changes.
- No generated data changes.
- No UI/component/view-model changes.
- No deployment automation.
- No source-selection policy changes.
