# NW-DD-005 — Pilot freeze and snapshot proof

## Mission

Wire the already-qualified Daily Digest India adapters into one deterministic local pilot freeze pipeline and prove the frozen snapshot/D1 write contract without activating production Cron, exposing UI, changing GitHub Actions, or inventing a global source.

This PR is stacked on draft PR #479 / NW-DD-004A, itself stacked on #478/#477/#476/#475. It does not waive predecessor dependency-backed validation gates.

## Authority boundary

DD-005 keeps the shared-writer architecture established in DD-001:

```text
registered source adapters
        ↓
current-day acquisition
        ↓
pilot candidate classification
        ↓
deterministic I1/I2/I3/G1 selector
        ↓
10:15 IST freeze gate
        ↓
daily-digest-snapshot/v1
        ↓
D1 batch write
```

The browser remains read-only. No public write route is added.

## Pilot freeze boundary

```text
decisionTimezone = Asia/Kolkata
freezeTime = 10:15 IST
future date        -> FUTURE_DIGEST_DATE
before 10:15       -> BEFORE_FREEZE
exactly 10:15+     -> READY_TO_FREEZE
past digest date   -> DIGEST_DATE_CLOSED
invalid date       -> INVALID_DIGEST_DATE
```

The documented future Cron expression remains:

```text
45 4 * * *
```

but DD-005 does not add a `[triggers]` section or activate it.

## Scheduled writer safety

The Worker scheduled entry point now has a fail-closed dispatch gate:

```text
DAILY_DIGEST_PILOT_WRITE_ENABLED != "true"
    -> original SOURCE_ADAPTERS_NOT_AUTHORIZED no-write result

DAILY_DIGEST_PILOT_WRITE_ENABLED == "true"
    -> run scheduled pilot freeze
```

`wrangler.toml.example` explicitly defaults:

```text
DAILY_DIGEST_PILOT_WRITE_ENABLED = "false"
```

Therefore merely deploying the DD-005 code cannot activate scheduled writes.

## India discovery

The pilot consumes only the three previously qualified product adapters:

- Akashvani — Morning News / English National
- Indian Express — Daily Briefing
- The Hindu — Morning Digest

Each adapter remains responsible only for publisher-specific discovery, canonicalization, edition/date integrity and acquisition state.

An unexpected exception from one adapter is isolated as:

```text
status = ADAPTER_ERROR
candidate = null
acquisitionState = CRITICAL
```

and does not abort discovery of the other publishers.

## Global decision

DD-005 consumes the DD-004A contract:

```text
G1 = GLOBAL_BUSINESS_AND_WORLD
resolveGlobalV1Availability() = GLOBAL_UNAVAILABLE
```

No global source is fabricated or role-broadened.

If a future registry change makes G1 available before a global acquisition pipeline is authorized, DD-005 fails closed with:

```text
GLOBAL_PIPELINE_NOT_AUTHORIZED
```

instead of silently omitting the source.

## Pilot candidate policy

Source adapters do not own editorial ranking. DD-005 adds a separate candidate-evaluation layer.

Default pilot quality classes are deliberately neutral when no current-day quality evidence is supplied:

```text
roleFitClass      = EXACT
significanceClass = ADEQUATE
breadthClass      = ADEQUATE
diversityClass    = MODERATE
provenanceClass   = adapter provenance
accessibilityClass = mapped from accessibilityState
```

Optional discrete quality evidence may override significance/breadth/diversity before freeze. Invalid class values are ignored in favor of the neutral defaults.

DD-005 does **not** claim to have implemented a live editorial-quality extractor from publisher digest content. That remains a separate qualification requirement before production quality-driven switching is claimed.

## Provenance correction

Self-review found that the DD-001 selector ranked `ORIGINAL_EDITORIAL` ahead of `PUBLIC_BROADCAST`, contrary to the concept rule that public-broadcaster identity is metadata rather than an automatic quality penalty.

DD-005 corrects the provenance rank to:

```text
ORIGINAL_EDITORIAL = primary rank
PUBLIC_BROADCAST   = same primary rank
DERIVED_ROUNDUP    = lower rank
```

Registry precedence is therefore only a deterministic tie-break when the governing quality classes are equal.

## Composition states

The selector now preserves simultaneous degradation:

```text
3 India + G1 -> NORMAL
2 India + G1 -> DEGRADED_INDIA_SHORTFALL
3 India      -> DEGRADED_GLOBAL_UNAVAILABLE
2 India      -> DEGRADED_INDIA_AND_GLOBAL_SHORTFALL
<2 India     -> DEGRADED_INSUFFICIENT
```

This prevents a global shortage from masking an India shortage.

## Snapshot construction

A successful pilot freeze creates:

```text
schemaVersion = daily-digest-snapshot/v1
snapshotId = daily-digest:<digestDate>:v1
snapshotRevision = 1
decisionTimezone = Asia/Kolkata
registryVersion = daily-digest-registry/v0.5
```

The snapshot contains:

- slot selections with `INITIAL_ROLE_SELECTION`
- candidate evidence with discrete quality classes
- `SELECTED_<slot>` or `ELIGIBLE_NOT_SELECTED` decision evidence
- composition state
- publication/observation timestamps already emitted by the source adapters

## D1 write proof

The normal three-India degraded-global case emits one `snapshotStore.writeSnapshot()` D1 batch containing exactly:

```text
1 daily_digest_snapshots insert
3 daily_digest_selections inserts
3 daily_digest_candidates inserts
---------------------------------
7 statements in one batch
```

DD-001 already established that `writeSnapshot()` uses the D1 `batch()` contract for atomic publication.

## Idempotence and race handling

Before discovery, the pilot checks for an existing snapshot by `digestDate`.

If already frozen:

```text
status = ALREADY_FROZEN
snapshotWritten = false
```

and no publisher rediscovery occurs.

If two writers race and one batch loses the unique-date insert, the loser reads the persisted snapshot and returns that stored snapshot. Self-review corrected object-spread ordering so the actual persisted snapshot cannot be replaced in the response by the losing writer's newly constructed candidate snapshot.

## Validation performed without GitHub Actions

```text
PASS: GitHub compare confirms DD-005 delta is limited to Daily Digest package/config/report/static guard
PASS: node --check on reconstructed changed core modules
PASS: direct local freeze-boundary assertions
PASS: direct local 3-India -> DEGRADED_GLOBAL_UNAVAILABLE selection assertion
PASS: direct local quality override changes pre-freeze I1 precedence
PASS: direct actual snapshotStore/D1-binding contract -> one batch / seven statements
PASS: direct digest-date idempotence -> second invocation ALREADY_FROZEN with no rediscovery
PASS: reconstructed DD-005 static scope guard against DD-004A base
PASS: scheduled writer default remains disabled
PASS: no production [triggers] section
```

The direct orchestration validation used controlled source-output fixtures/stubs at the DD-005 boundary. The repository certification file uses publisher-shaped Akashvani, Indian Express and The Hindu fixtures against the real adapters, but dependency-backed Vitest execution is not available in this execution environment.

## NOT_RUN

```text
NOT_RUN: repository dependency-backed Vitest execution
NOT_RUN: npm run lint
NOT_RUN: npm run build
NOT_RUN: npm run test:certify
NOT_RUN: Wrangler local D1 runtime execution
NOT_RUN: Wrangler --test-scheduled execution
NOT_RUN: live publisher acquisition through a deployed/local Cloudflare Worker
NOT_RUN: production Cron activation
```

No GitHub Actions workflow or manual dispatch is used as a substitute.

## Explicit non-goals preserved

- no `.github/workflows/*` change
- no GitHub Actions schedule or dispatch
- no production Cron trigger
- no production deployment
- no Main/UI integration
- no public write endpoint
- no Top Stories changes
- no Daily Brief policy changes
- no generated snapshot/data files
- no FT/AP/BBC/Reuters/Guardian promotion
- no search-engine/aggregator source fallback
- no article-body persistence
- no AI editorial ranking

## Changed-file ledger

Expected DD-005 delta only:

- `cloudflare/daily-digest-api/src/index.js`
- `cloudflare/daily-digest-api/src/pilotCandidatePolicy.js`
- `cloudflare/daily-digest-api/src/pilotFreeze.js`
- `cloudflare/daily-digest-api/src/pilotFreeze.cert.test.js`
- `cloudflare/daily-digest-api/src/selector.js`
- `cloudflare/daily-digest-api/src/selector.cert.test.js`
- `cloudflare/daily-digest-api/wrangler.toml.example`
- `scripts/test_daily_digest_pilot_freeze_static.mjs`
- `reports/NW-DD-005_pilot_freeze_snapshot_proof.md`

## Current disposition

```text
DD-005 implementation: COMPLETE AS STACKED DRAFT
production Cron: NOT AUTHORIZED
UI exposure: NOT AUTHORIZED
production quality-driven switching: NOT YET CLAIMED
```

Before production/UI activation, current-day editorial quality derivation still needs an explicit bounded qualification so "switch based on quality of news" is computed from publisher evidence rather than supplied as an external override.
