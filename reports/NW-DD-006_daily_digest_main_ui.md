# NW-DD-006 — Read-only Daily Digest Main UI

## Mission

Expose the shared Daily Digest snapshot on Main as a read-only publisher-curated section immediately after Top Stories, without browser-side publisher discovery, write authority, production Cron activation, workflow changes, Top Stories policy changes, or Daily Brief coupling.

This PR is stacked on NW-DD-005A / PR #481.

## Read authority

The browser requests exactly today's `Asia/Kolkata` snapshot from the configured shared backend:

```text
GET /api/datasets/dailyDigest?date=YYYY-MM-DD
```

It does not request the latest unspecified snapshot, so yesterday's Digest cannot appear as today's edition before today's freeze.

Expected absence is non-blocking:

- backend not configured -> section hidden
- today's snapshot not frozen -> section hidden
- valid current snapshot -> section rendered
- malformed/backend-error response -> Daily Digest fails independently; Main remains usable

## Shared snapshot card contract

The existing snapshot reader previously returned canonical IDs only. DD-006 adds the minimum selected-card metadata required for a useful link UI:

- `title`
- `canonicalUrl`

Migration `0003_daily_digest_card_metadata.sql` adds those two candidate columns. Snapshot writes persist the digest product title and direct canonical publisher URL already emitted by the qualified source adapters.

`readSnapshot()` now returns ordered public `cards[]` for the effective selection while preserving `initialSelection` and `effectiveSelection` separately.

No quality evidence, article body, source story headline set, or raw publisher content is exposed through the card contract.

## Browser dataset contract

New dataset surfaces:

- `dailyDigestDatasetApiClient.js` — GET-only backend client
- `dailyDigestDataset.js` — same-day snapshot validation and publisher-host allowlist
- dataset registry key `dailyDigest`

Card URLs are accepted only when HTTPS and consistent with the registered publisher family.

## UI contract

`DailyDigestSection` renders only when at least one valid shared card exists.

Placement:

```text
Top Stories
Daily Digest
India
Tamil Nadu
Muscat
World
```

The placement is applied to desktop and mobile Main flows. Section navigation receives `🗞️ Digest` only when Daily Digest cards are actually present.

Cards show:

- publisher/product identity
- frozen digest title
- slot identity
- publisher-curated marker
- health-failover marker when the effective card replaced the initial selection
- digest date / frozen time

Cards open only the direct canonical publisher URL in a new tab.

## Refresh behavior

Main pull-to-refresh reloads both Main and Daily Digest concurrently. Daily Digest refresh failure does not replace or block the Main refresh result.

## Changed-file ledger

DD-006 delta against `nw-dd-005a-digest-quality-classifier` is exactly 13 files:

1. `cloudflare/daily-digest-api/migrations/0003_daily_digest_card_metadata.sql`
2. `cloudflare/daily-digest-api/src/snapshotStore.js`
3. `cloudflare/daily-digest-api/src/snapshotStore.cert.test.js`
4. `src/data/datasets/dailyDigestDatasetApiClient.js`
5. `src/data/datasets/dailyDigestDatasetApiClient.cert.test.js`
6. `src/data/datasets/dailyDigestDataset.js`
7. `src/data/datasets/dailyDigestDataset.cert.test.js`
8. `src/data/datasets/index.js`
9. `src/viewModels/useDailyDigestSectionViewModel.js`
10. `src/components/DailyDigestSection.jsx`
11. `src/pages/MainPage.jsx`
12. `scripts/test_daily_digest_main_ui_static.mjs`
13. `reports/NW-DD-006_daily_digest_main_ui.md`

No `.github/workflows/*`, writer configuration, source registry, Top Stories, Daily Brief or generated-data file is present in the diff.

## Validation completed without GitHub Actions

```text
PASS: GitHub compare -> exactly 13 authorized DD-006 files
PASS: DD-005A parent net diff rechecked -> original 16 files only; temporary markers leave no net content
PASS: explicit client URL -> /api/datasets/dailyDigest?date=2026-08-24
PASS: client contract specifies GET only
PASS: SQLite migration mechanics -> title and canonical_url columns added
PASS: Main source inspection -> Daily Digest placed after Top Stories in desktop and mobile flows
PASS: Main pull-to-refresh isolates Daily Digest failure from Main result
PASS: authored non-JSX client/view-model syntax samples via Node 22
PASS: publisher URL allowlist present in dataset projection
PASS: raw publisher article body/content fields absent from snapshot store
```

Authored static guard: `scripts/test_daily_digest_main_ui_static.mjs`.

## Explicit NOT_RUN

```text
NOT_RUN: repository dependency-backed Vitest suite
NOT_RUN: npm run lint
NOT_RUN: npm run build
NOT_RUN: npm run test:certify
NOT_RUN: JSX parse/render test through Vite/React toolchain
NOT_RUN: full static guard execution against a local checkout (checkout unavailable in this environment)
NOT_RUN: Wrangler local D1 migration/runtime proof
NOT_RUN: deployed Daily Digest API read
NOT_RUN: production Cron/writer activation
```

No GitHub Actions workflow was created, modified or manually dispatched as a substitute.

## Activation dependency

DD-006 intentionally does not make the feature visible by itself. Main renders Daily Digest only when:

1. the frontend has a configured shared backend URL;
2. migrations through `0003` have been applied to the Daily Digest D1 database;
3. today's shared snapshot has been written by the authorized server-side writer;
4. the snapshot contains valid selected-card metadata.

Until those conditions are met, the section remains hidden and Main continues normally.

## Explicit non-goals

- no `.github/workflows/*` change
- no production Cron trigger or write enablement
- no browser POST/PUT/PATCH/DELETE route
- no browser publisher scraping/discovery
- no Top Stories ranker or corroboration changes
- no Daily Brief changes
- no global-source qualification changes
- no source registry changes
- no AI ranking
- no raw publisher content persistence

## Appendix A — next-agent expert checklist

Before production activation, the next agent must answer from source reality:

1. What exact deployed Worker/base URL will serve `/api/datasets/dailyDigest`?
2. Are D1 migrations `0001`, `0002`, and `0003` applied to the target database in order?
3. Does a real GET for today's IST date return `daily-digest-snapshot/v1` and valid `cards[]`?
4. Do two independent browsers receive the same `snapshotId`, `snapshotRevision`, card canonical IDs and order?
5. Is the production scheduled writer still fail-closed until explicitly authorized?
6. Does post-freeze same-slot failover always have candidate metadata available for the replacement canonical ID?
7. Does the real React build render Daily Digest after Top Stories on desktop and mobile without disturbing Main loading/error boundaries?
8. Are all dependency-backed tests/lint/build/certification green before enabling production visibility?
