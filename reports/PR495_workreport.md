# PR495 — NW-CF-HYBRID-001B living work report

## Recovery header

```text
WORK_ID=PR495
ISSUE=493
PR=495
BRANCH=agent/nw-cf-hybrid-001b-sections-shadow-store
BASE_SHA=d6ffdf222c8301037a96ca1fabc3bf1b929c8530
PR_HEAD_OBSERVED=348720e626b9618c55f0c37b84392b0a1b662f6e
REPORT_BASIS_HEAD=348720e626b9618c55f0c37b84392b0a1b662f6e
MAIN_HEAD_LAST_CHECKED=d6ffdf222c8301037a96ca1fabc3bf1b929c8530
MERGE_BASE=d6ffdf222c8301037a96ca1fabc3bf1b929c8530
HANDOVER_READINESS=READY
PR_RECOVERY_STATE=HEALTHY
TAKEOVER_AUTHORITY=WRITE_ALLOWED
REPORT_SYNC=CURRENT
APPENDIX_A_STATUS=CURRENT
GROUNDING_EPOCH=GE-B002
LAST_DURABLE_CHECKPOINT=PHASE_B_IMPLEMENTATION_AND_FOCUSED_VALIDATION_COMPLETE
CURRENT_STAGE=HANDOVER
CURRENT_BLOCKER=REMOTE_CI_FAILURE_UNKNOWN_ORIGIN
HIGHEST_RISK=REMOTE_CI_FAILURE_WITHOUT_DIAGNOSTIC_ARTIFACT
WORK_INTENT=IMPLEMENT
REPOSITORY_STATE=EXISTING_PR
MUTATION_AUTHORITY=WRITE_ALLOWED
CRITICALITY=DATA_PLANE_CRITICAL/RANKING_AUTHORITY_CRITICAL
COORDINATION_STATE=SAFE
EXECUTION_MODE=AUTO
AUTO_STATE=OWNER_DECISION_REQUIRED
SCOPE_AUTHORITY=LOCKED_TO_ISSUE_493_PR_B
PHASE_PROGRESSION=AUTO
MERGE_AUTHORITY=OWNER_ONLY
EXACT_NEXT_ACTION=OWNER_REVIEW_REMOTE_CI_FAILURE_AND_MERGE_DECISION
```

PR #495 implements Issue #493 Phase B from merged PR-A authority `d6ffdf222c8301037a96ca1fabc3bf1b929c8530`.

## Handover in 60 seconds

Phase-B implementation is complete and bounded to a new independent package:

```text
cloudflare/sections-dataset-api
```

The production browser still reads `/newsdata/sections_latest.json`. No browser source selection, workflow, public write endpoint, production route, Cron trigger, Daily Digest storage, Up Ahead storage, generated `public/newsdata/**`, source feed population, or Top Stories policy was changed.

Publication authority is deliberately three-state:

```text
STAGED   = writable, incomplete evidence allowed, invisible
SEALED   = immutable, complete cardinality required, invisible
COMMITTED= immutable, eligible to become current
```

`SEALED` was added after review identified a digest time-of-check/time-of-use risk: reading row digests from a still-writable STAGED snapshot and then committing it would leave a mutation window. The store now seals a complete snapshot first, making partitions/items and snapshot authority immutable, verifies digests on that immutable state, and only then performs `SEALED -> COMMITTED` plus `current_snapshot_pointer` movement in one D1 `batch()` transaction.

Section partitions are first-class rows. This is required because a qualified section with zero stories is still a complete section partition and must not disappear merely because it contributes no item rows.

Focused local SQLite/Node certification proves the Issue #493 S100/S101 failure case and deterministic retry semantics. Separately, GitHub CI is currently red. The latest implementation-head run observed was `CI Validation Gate` run `32920447405` / run number `837`, job `98032860346`, conclusion `failure`. GitHub returned no step detail and no failure artifact; older observed runs showed the same no-diagnostic pattern. The exact CI failure origin is therefore `UNKNOWN_ORIGIN`, not product PASS and not proven pre-existing.

## Live ground truth

```text
main                              = d6ffdf222c8301037a96ca1fabc3bf1b929c8530
PR #494                           = merged
PR #495                           = open draft at implementation head 348720e626b9618c55f0c37b84392b0a1b662f6e
mergeable                         = true at last live check
source registry                   = config/section_sources.json
source registry digest            = d6e8c3d706c9848b7e63349ce08cd48c3670377f24c4163150cd368151e96716
source registry population        = 10 sections / 41 lanes
browser serving authority         = /newsdata/sections_latest.json
Cloudflare Sections base package  = absent on merged base; introduced only by PR #495
open Cloudflare Sections overlap  = PR #495 only
reviews                           = none
review threads                    = none
```

## Mission / acceptance disposition

| Requirement | State | Evidence |
|---|---|---|
| Independent `cloudflare/sections-dataset-api` package | COMPLETE | package is isolated from Daily Digest and Up Ahead |
| Independent D1 binding/migrations | COMPLETE | `wrangler.toml.example`; migrations 0001-0004 |
| Append-only run/lane/snapshot/item/parity authority | COMPLETE | schema + terminal/append-only triggers |
| First-class ten-section partition custody including empty sections | COMPLETE | partition table + empty-partition certification |
| Partial STAGED rows never current | COMPLETE | current-read predicate + pointer DB triggers |
| Digest TOCTOU closed | COMPLETE | `STAGED -> SEALED -> COMMITTED` state machine |
| COMMITTED promotion + pointer move transactionally coupled | COMPLETE | final `D1.batch([promote, movePointer])` |
| Exact run/cardinality/provenance/digest gates fail closed | COMPLETE | store SQL + migration triggers + certs |
| Same-logical-epoch retry is idempotent and conflict-safe | COMPLETE | deterministic PKs + migration 0004 |
| Read-only shadow endpoints | COMPLETE | latest, named section, parity latest; GET/OPTIONS only |
| Shared deterministic replay authority | COMPLETE | imports merged PR-A evaluator/registry/production ranker |
| Public write API | NONE | non-GET rejected |
| Live 41-lane acquisition | DEFERRED_TO_PR_C | scheduled foundation returns disabled status only |
| Browser production use | ZERO | protected loader/source selection unchanged |

## Runtime / storage authority

### State machine

```text
source run RUNNING
 -> source/lane evidence may be written
 -> source run COMPLETE
 -> snapshot inserted STAGED only
 -> exact qualified section partitions staged
 -> snapshot item positions staged idempotently
 -> cardinality preflight
 -> guarded STAGED -> SEALED
 -> partitions/items/snapshot authority immutable
 -> partition + item digests verified on SEALED rows
 -> D1.batch(
      guarded SEALED -> COMMITTED,
      guarded current pointer -> same complete COMMITTED snapshot
    )
 -> current reads resolve pointer only through complete COMMITTED predicate
```

A crash before sealing leaves STAGED RCA evidence and the old pointer. A crash after sealing leaves an immutable SEALED snapshot and the old pointer. Finalization can resume from SEALED without reopening writes.

### Current-read predicate

`readCurrentSnapshotMetadata()` resolves:

```text
current_snapshot_pointer
 -> section_snapshots
 -> source_runs
```

and requires:

```text
pointer_name = sections-shadow-current
snapshot.state = COMMITTED
source_run.state = COMPLETE
partition row count = expected_section_count
item row count = expected_item_count
for every partition: actual item count = partition expected_item_count
```

The database pointer triggers independently enforce the same completeness boundary. Migration `0003_pointer_integrity.sql` also restricts snapshot insertion to STAGED and restricts current pointer identity to the single supported name.

### Immutability / retry authority

Migration `0002_terminal_authority.sql` enforces:

```text
source-run authority immutable
COMPLETE/FAILED source runs immutable
source evidence writable only while run RUNNING
snapshot provenance/digests/cardinality immutable
COMMITTED snapshot record immutable
parity evidence append-only
```

Migration `0004_retry_identity.sql` rejects same-key retries when authority/content differs:

```text
run_id conflict with changed run authority        -> reject
snapshot_id conflict with changed snapshot authority -> reject
(snapshot_id, section_key) changed expected count -> reject
(snapshot_id, section_key, position) changed story/source/json -> reject
```

Identical retries remain no-op/idempotent.

## S100 / S101 fault result

Certified sequence:

```text
S100 = current, complete, COMMITTED
S101 expected = 10 partitions / 284 item rows
S101 interrupted = 7 partitions / 201 rows
```

At interruption:

```text
S101 state   = STAGED
pointer      = S100
GET latest   = S100
partial rows = retained for RCA
seal S101    = rejected by complete-cardinality authority
```

After the same logical S101 retries and supplies the remaining three partitions / 83 rows:

```text
S101 = 10 / 284
STAGED -> SEALED succeeds
S101 rows/authority become immutable
pointer remains S100 while SEALED
SEALED -> COMMITTED + pointer S101 occurs in one final transaction
subsequent same-pointer finalization = explicit idempotent success
```

An empty-section case was also certified: ten partition records with only nine total item rows remains valid when one partition declares zero rows.

## Shared replay evidence

`replayExecutor.js` imports:

```text
config/section_sources.json
scripts/top-stories-shadow/sectionsShadowEvaluator.mjs
scripts/top-stories-shadow/sectionsShadowInputEpoch.mjs
scripts/top-stories-shadow/sectionsShadowSourceRegistry.mjs
src/services/topStories/topStoriesRanker.js
src/services/topStories/topStoriesSourceIdentity.js
```

It does not copy the 41 feed lanes, ranking weights, admission thresholds, source aliases, or event taxonomy.

Focused replay-plan execution reproduced:

```text
registrySections        = 10
registryLanes           = 41
benchmarkItems          = 18
decisionOutputDigest    = 74a012724be58b1c834c88f699d0627eb3e82a2d24721a279ca70e6eff429fe2
emptyPartitionPreserved = true
missingPartitionFailsClosed = true
explicitCommitProvenanceRequired = true
```

The decision digest is the frozen PR-A oracle; Cloudflare output was not used to choose it.

## Cloudflare compatibility facts checked

Current Cloudflare documentation was checked during PR-B for these time-sensitive boundaries:

```text
Workers Free external subrequests/invocation = 50
redirect hops consume subrequests
D1 batch() is transactional / rolls back the batch on failure
D1 result metadata supports write-change metadata used by guarded finalization
compatibility_date >= 2026-08-04 enables current Workers Node compatibility by default
node:crypto is supported for the configured 2026-08-26 compatibility date
```

PR-B intentionally contains no live 41-lane collector and therefore does not depend on paid-plan fanout. PR-C owns acquisition sharding/capacity proof.

## Validation ledger

| Check | Status | Observation | Oracle | HEAD / evidence | Failure origin / limitation |
|---|---|---|---|---|---|
| merged PR-A base | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | main `d6ffdf222...` | n/a |
| Phase-B overlap | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | only PR #495 claims Cloudflare Sections | n/a |
| changed-file reconciliation | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | 16 files, all package/report scope | n/a |
| protected-path negative assurance | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | no workflow/browser/other CF/generated-data paths | n/a |
| current Cloudflare runtime compatibility | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | Cloudflare docs checked 2026-08-26 | n/a |
| D1 batch/result semantics | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | Cloudflare docs checked 2026-08-26 | n/a |
| atomicity fault certification | PASS | LOCAL_EXECUTION | INDEPENDENT_REPRODUCTION | `node cloudflare/sections-dataset-api/scripts/atomicity-cert.mjs` semantics; S101 7/201 -> S100 | local SQLite models D1 SQLite semantics; not deployed D1 |
| pointer-integrity certification | PASS | LOCAL_EXECUTION | INDEPENDENT_REPRODUCTION | pointer rejects incomplete COMMITTED even with upstream transition guards removed | local SQLite; not deployed D1 |
| deterministic retry certification | PASS | LOCAL_EXECUTION | INDEPENDENT_REPRODUCTION | identical retries no-op, conflicting same-key retries reject | local SQLite; not deployed D1 |
| replay-plan certification | PASS | LOCAL_EXECUTION | AUTHORITATIVE_REFERENCE | frozen PR-A decision digest `74a01272...` | reconstructed dependency slice, not full checkout |
| read-only Worker routing | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | `src/index.js` exposes GET/OPTIONS only; scheduled path disabled | source inspection, not Wrangler runtime |
| GitHub CI run 32920447405 / #837 | FAIL | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | job 98032860346 `Lint, unit tests, and build` | UNKNOWN_ORIGIN; no step detail/log/failure artifact available |
| earlier observed CI runs #832/#835 | FAIL | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | same failed-job/no-diagnostic pattern | UNKNOWN_ORIGIN |
| full local `npm ci` / lint / unit / build / certification | NOT_RUN | NOT_OBSERVED | NONE | no complete checkout/dependency tree in execution environment | explicit tooling limitation |
| Wrangler dry-run | NOT_RUN | NOT_OBSERVED | NONE | Wrangler toolchain not available in complete checkout | explicit tooling limitation |
| live Cloudflare deployment/D1 smoke | NOT_APPLICABLE | NOT_OBSERVED | NONE | deployment is outside PR-B authorization | not authorized |

### CI disposition

Do not reinterpret the remote CI failure as PASS. Do not label it pre-existing without evidence.

Observed facts:

```text
run 832  = failure
run 835  = failure
run 837  = failure (latest implementation-head run recorded here)
job name = Lint, unit tests, and build
step detail returned by connector = unavailable/empty on investigated run
job log retrieval on older investigated run = BlobNotFound
failure artifact = none returned on investigated runs
```

The workflow itself is unchanged by this PR. It normally checks out, runs `npm ci`, then `npm run test:certify:smoke`, with failure-log upload after the smoke step. The absent artifact is compatible with a failure before the smoke-log file exists, but that is only a hypothesis; it does not establish the failure stage.

## Negative assurance

The following remain unchanged by PR #495:

```text
.github/workflows/**
src/adapters/sectionsSnapshotLoader.js
src/adapters/sectionsSnapshotFetcher.js
browser VITE source selection
public/newsdata/**
cloudflare/daily-digest-api/**
cloudflare/upahead-dataset-api/**
config/section_sources.json feed population
Top Stories weights / thresholds / event taxonomy / source tiers
```

No deployment was performed. No D1 database ID, route, DNS change, browser URL, Cron trigger, or production activation was committed.

## Changed-file ledger — reconciled

```text
cloudflare/sections-dataset-api/DEPLOYMENT.md
  ADD  operator boundary; explicitly no PR-B deployment/cutover

cloudflare/sections-dataset-api/README.md
  ADD  shadow authority/state/API documentation

cloudflare/sections-dataset-api/migrations/0001_sections_shadow.sql
  ADD  base run/evidence/snapshot/partition/item/pointer/parity schema; STAGED/SEALED/COMMITTED gates

cloudflare/sections-dataset-api/migrations/0002_terminal_authority.sql
  ADD  terminal authority and append-only/immutability gates

cloudflare/sections-dataset-api/migrations/0003_pointer_integrity.sql
  ADD  STAGED-only insertion, single pointer identity, complete-COMMITTED pointer defense

cloudflare/sections-dataset-api/migrations/0004_retry_identity.sql
  ADD  deterministic same-key retry conflict rejection

cloudflare/sections-dataset-api/scripts/atomicity-cert.mjs
  ADD  S100/S101 partial/seal/commit/empty-partition fault certification

cloudflare/sections-dataset-api/scripts/pointer-integrity-cert.mjs
  ADD  independent pointer defense certification

cloudflare/sections-dataset-api/scripts/replay-plan-cert.mjs
  ADD  merged PR-A replay-oracle/partition certification

cloudflare/sections-dataset-api/scripts/retry-identity-cert.mjs
  ADD  idempotent retry / same-key conflict certification

cloudflare/sections-dataset-api/src/contracts.js
  ADD  store states/contracts/digest/cardinality validation

cloudflare/sections-dataset-api/src/epochStore.js
  ADD  D1 staging/sealing/finalization/read authority

cloudflare/sections-dataset-api/src/index.js
  ADD  read-only Worker router and disabled scheduled foundation

cloudflare/sections-dataset-api/src/replayExecutor.js
  ADD  shared PR-A deterministic replay/persistence planner

cloudflare/sections-dataset-api/wrangler.toml.example
  ADD  isolated D1 shadow-only configuration example; no route/Cron

reports/PR495_workreport.md
  ADD  living recovery authority
```

No unexplained changed file remains.

## Active register

### DEC-001 — conservative fanout
PR-B does not implement the live 41-feed collector. PR-C must qualify batching/sharding against a conservative <=50 external-subrequest envelope unless the deployed plan is independently proven to permit more. No source lane may be deleted to fit limits.

### DEC-002 — first-class section partitions
A qualified section exists independently of whether it contains item rows. Section completeness is represented by `section_snapshot_partitions`, not inferred by `COUNT(DISTINCT section_key)` over items.

### DEC-003 — SEALED state closes digest TOCTOU
Digest verification is performed only after a complete STAGED snapshot is transitioned to SEALED. SEALED partitions/items and snapshot authority cannot mutate. This prevents the writer from changing row content between digest verification and COMMITTED publication.

### DEC-004 — pointer defense is independent
Application finalization and current-read predicates are not the only protection. D1 pointer triggers require the target to be COMPLETE-run + COMMITTED + exact partition/item cardinality, even if an abnormal caller bypasses the normal finalizer.

### DEC-005 — deterministic retry means identical-or-reject
A repeated logical identifier is not permission for last-writer-wins. Identical data can no-op; differing authority/content at the same deterministic key is a conflict.

### RISK-001 — remote CI failure
**ACTIVE.** Current remote CI is red and the retained GitHub evidence does not identify the failed step. This blocks a clean green-CI merge recommendation. It does not negate the focused Phase-B certifications, and those focused PASS results do not erase the CI failure.

### RISK-002 — deployed D1/Worker runtime not exercised
**ACTIVE / EXPECTED FOR PR-B.** Local SQLite and source/runtime compatibility checks do not replace a Wrangler/D1 smoke. Live deployment is not authorized in PR-B.

### RISK-003 — PR-C fanout/acquisition
**DEFERRED.** Source scheduling, fetch/parser behavior, 41-lane shard/barrier semantics, source-health completeness and live parity belong to PR-C.

## Appendix A — current takeover answers

### A1 — Production trace

`GET /api/shadow/sections/latest` routes in `src/index.js` to `readCurrentSnapshot()`. That calls `readCurrentSnapshotMetadata()`, whose SQL joins the single current pointer to `section_snapshots` and `source_runs` and requires COMMITTED + COMPLETE run + exact partition count + exact item count + zero per-partition cardinality mismatches. Only then are partition keys and sorted item rows assembled. STAGED and SEALED rows are excluded by the `s.state = 'COMMITTED'` predicate; the pointer trigger independently refuses non-complete targets.

### A2 — S101 failure isolation

With S100 current and S101 at 7/10 partitions and 201/284 rows, S101 remains STAGED. Its source/snapshot/partition/item evidence may remain for RCA. `STAGED -> SEALED` fails the complete-cardinality trigger/guard. `current_snapshot_pointer` remains S100; latest therefore returns S100. The first publication invariant is that current pointer eligibility requires a complete COMMITTED target; the state transition itself also requires exact cardinality.

### A3 — Authority / transaction

A detached cardinality pre-check is insufficient because rows could change after the check. Phase B therefore first seals the complete snapshot, which freezes rows and authority, verifies digests on the immutable SEALED state, then sends the guarded SEALED->COMMITTED statement and guarded pointer statement together in one D1 `batch()`. A transaction failure rolls back the batch; zero-row/no-op results are not accepted as normal success except the explicit already-COMMITTED/same-pointer idempotent path.

### A4 — Independent validation

The SQLite certification creates S100 current and S101 with expected 10/284 but only 7/201. S101 seal throws, state remains STAGED, pointer remains S100, and direct pointer update is rejected. The test then supplies the missing 3 partitions/83 rows, seals S101, proves rows/authority immutable while pointer remains S100, and commits S101/current. A separate pointer-integrity test deliberately removes upstream insertion/transition guards, creates an invalid COMMITTED row, and still proves the pointer trigger rejects it.

Falsifier: any test state in which S101 at 7/201 becomes current, a SEALED row can be mutated, or the pointer accepts an incomplete COMMITTED target.

### A5 — Minimal retry path

Stable identities are:

```text
source run: run_id
snapshot: snapshot_id
partition: (snapshot_id, section_key)
item: (snapshot_id, section_key, position)
```

Migration 0004 requires same-key retries to be identical; conflicting authority/content aborts. The interrupted S101 retries only missing deterministic partitions/items, then seals once 10/284 is exact, verifies sealed digests, and performs the atomic COMMITTED/pointer batch. If the snapshot is already COMMITTED and the pointer already names S101, finalization returns explicit idempotent success rather than writing a second epoch.

## Takeover / grounding chain

| Epoch | Basis | Result | Exact next action |
|---|---|---|---|
| GE-B001 | merged main `d6ffdf222...`, PR #495 allocation | SAFE / WRITE_ALLOWED | implement package/store |
| GE-B002 | implementation head `348720e626b9618c55f0c37b84392b0a1b662f6e`, main unchanged | implementation/focused validation complete; CI red UNKNOWN_ORIGIN; handover READY | owner review CI failure and merge decision |

## Closure disposition

Phase-B product scope is implemented and the focused authority/fault/retry/replay acceptance evidence is PASS within its stated local/source limitations. The repository-wide remote CI gate is FAIL with unknown origin and must remain visible in the merge decision.

No further Phase-B production mutation is currently justified without new CI diagnostics or review feedback. PR-C must not begin from this branch before PR #495 is merged into `main`.
