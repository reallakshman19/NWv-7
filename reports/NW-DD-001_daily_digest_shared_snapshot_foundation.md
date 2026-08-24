# NW-DD-001 — Daily Digest shared snapshot foundation

## Mission

Establish the independent shared-authority foundation for Daily Digest without publisher acquisition, UI exposure, production Cron activation, or GitHub Actions changes.

## Baseline

Planning baseline: `aaa2ab72fbe91f0325ccc71bd40c77229b54665a`.

The implementation agent must re-check current `main` before merge because the baseline may move after this PR is opened.

## Files changed

- `cloudflare/daily-digest-api/src/index.js`
- `cloudflare/daily-digest-api/src/contracts.js`
- `cloudflare/daily-digest-api/src/registry.js`
- `cloudflare/daily-digest-api/src/selector.js`
- `cloudflare/daily-digest-api/src/snapshotStore.js`
- `cloudflare/daily-digest-api/migrations/0001_daily_digest.sql`
- `cloudflare/daily-digest-api/wrangler.toml.example`
- `cloudflare/daily-digest-api/README.md`
- focused certification tests under the same package
- `scripts/test_daily_digest_foundation_static.mjs`
- this report

## Authority boundary

Daily Digest is independent of Top Stories and Daily Brief. Browser clients receive a read-only snapshot through `GET /api/datasets/dailyDigest`. No browser write endpoint exists.

The foundation uses a D1 binding named `DB`. Snapshot, selections, and candidate decision evidence are prepared with bound parameters and written through one D1 `batch()` call.

## Registry and selection

The registry records qualified and HOLD products explicitly. HOLD products are structurally ineligible because selection requires `qualificationState = QUALIFIED`.

Slots are fixed roles:

```text
I1 INDIA_GENERAL
I2 INDIA_GENERAL
I3 INDIA_GENERAL or INDIA_BROAD
G1 GLOBAL_BUSINESS_AND_WORLD
```

Selection is lexicographic across discrete quality classes; it has no compensating scalar score. Publisher precedence is only a deterministic final tie-break. Hysteresis ignores tie-break-only differences.

## Snapshot semantics

`daily-digest-snapshot/v1` retains both initial and effective selection identity. Same-slot health failover updates only `effective_canonical_id`, increments `snapshot_revision`, and appends an immutable selection event.

The failover revision update is guarded by the continued existence of the requested slot so an invalid slot cannot advance `snapshot_revision` without an actual selection row.

## Scheduled handler

A Worker `scheduled()` handler exists only to prove the server-side execution boundary. NW-DD-001 deliberately returns:

```text
SOURCE_ADAPTERS_NOT_AUTHORIZED
snapshotWritten = false
```

No production Cron Trigger is configured. The current pilot candidate `10:15 IST = 04:45 UTC` is documentation only.

## Test matrix

- canonical identity includes edition and date
- HOLD / not-scheduled / not-yet-expected / critical / stale candidates are ineligible
- slot roles cannot cross India/global boundaries
- selection is deterministic and publisher-family unique
- no second global slot compensates for India shortfall
- tie-break-only changes do not trigger hysteresis
- persistence uses prepared bound statements
- read reconstruction preserves initial and effective identities independently
- same-slot replacement preserves initial identity
- invalid slot cannot advance snapshot revision
- replacement increments revision and appends evidence
- public Worker exposes GET/OPTIONS only
- static guard blocks workflow/UI/generated-data/Up Ahead Worker changes

## Validation run

Connector-side changed-file/source review: **PASS**.

Isolated local checks executed against the authored source logic:

```text
PASS: node --check on authored Worker/source modules
PASS: deterministic contract/selector assertions
PASS: SQLite migration structural application; 4 daily_digest_* tables created
PASS: Worker route checks for 404 / 405 / invalid-date 400 / OPTIONS 204 / missing-store 503
PASS: scheduled foundation returns SOURCE_ADAPTERS_NOT_AUTHORIZED and snapshotWritten=false
PASS: scripts/test_daily_digest_foundation_static.mjs in a reconstructed git workspace
```

Environment limitation encountered while attempting the required full checkout:

```text
git clone https://github.com/reallaksh19/NWv-7.git
-> Could not resolve host: github.com
```

The execution sandbox has Node/npm but no cached Vitest, Wrangler, ESLint, or Vite binaries and no outbound package/GitHub access. Therefore the following complete-checkout/runtime validations remain unavailable here:

```text
NOT_RUN: focused Vitest certification files
NOT_RUN: Wrangler local D1 migration application
NOT_RUN: Wrangler local Worker GET/CORS proof
NOT_RUN: Wrangler --test-scheduled proof
NOT_RUN: npm run lint
NOT_RUN: npm run build
NOT_RUN: npm run test:certify
```

The PR must remain draft / not merge-ready until those dependency-backed checks are run in an environment with the repository dependencies. No GitHub Actions workflow was added, changed, or manually dispatched to work around this limitation.

## Status

```text
PR: #475
State: DRAFT
Merge authorization: NOT REQUESTED
Next mission: BLOCKED until DD-001 dependency-backed validation is closed and this PR is merged or explicitly waived by the user
```

## Explicit non-goals preserved

- no `.github/workflows/*` changes
- no GitHub Actions schedule
- no UI/Main changes
- no Top Stories changes
- no Daily Brief changes
- no existing Up Ahead Worker changes
- no generated snapshot changes
- no publisher fetching or scraping
- no AI editorial ranking
- no real Cloudflare account/database IDs or secrets
- no production Cron activation
- no production deployment
