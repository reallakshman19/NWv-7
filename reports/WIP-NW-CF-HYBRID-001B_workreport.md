# NW-CF-HYBRID-001B — living work report

## Recovery header

```text
WORK_ID=WIP-NW-CF-HYBRID-001B
ISSUE=493
PR=UNALLOCATED
BRANCH=agent/nw-cf-hybrid-001b-sections-shadow-store
BASE_SHA=d6ffdf222c8301037a96ca1fabc3bf1b929c8530
PR_HEAD_OBSERVED=d6ffdf222c8301037a96ca1fabc3bf1b929c8530
REPORT_BASIS_HEAD=d6ffdf222c8301037a96ca1fabc3bf1b929c8530
MAIN_HEAD_LAST_CHECKED=d6ffdf222c8301037a96ca1fabc3bf1b929c8530
MERGE_BASE=d6ffdf222c8301037a96ca1fabc3bf1b929c8530
HANDOVER_READINESS=READY
PR_RECOVERY_STATE=HEALTHY
TAKEOVER_AUTHORITY=WRITE_ALLOWED
REPORT_SYNC=CURRENT
APPENDIX_A_STATUS=CURRENT
GROUNDING_EPOCH=GE-B001
CURRENT_STAGE=PLAN
CURRENT_BLOCKER=NONE
HIGHEST_RISK=PARTIAL_EPOCH_PUBLICATION_OR_FALSE_ATOMICITY
WORK_INTENT=IMPLEMENT
REPOSITORY_STATE=NEW_PR_REQUIRED
MUTATION_AUTHORITY=WRITE_ALLOWED
CRITICALITY=DATA_PLANE_CRITICAL/RANKING_AUTHORITY_CRITICAL
COORDINATION_STATE=SAFE
EXECUTION_MODE=AUTO
AUTO_STATE=RUNNING
SCOPE_AUTHORITY=LOCKED_TO_ISSUE_493_PR_B
PHASE_PROGRESSION=AUTO
MERGE_AUTHORITY=OWNER_ONLY
EXACT_NEXT_ACTION=ALLOCATE_DRAFT_PR_AND_IMPLEMENT_ISOLATED_D1_ATOMIC_SHADOW_STORE
```

## Handover in 60 seconds

Issue #493 Phase B starts from merged PR #494 at `d6ffdf222c8301037a96ca1fabc3bf1b929c8530`. The production browser still serves `/newsdata/sections_latest.json`; this phase must not modify browser loading, workflows, production VITE variables, Daily Digest D1, or Up Ahead storage.

Phase-B target is a third independent Cloudflare package, `cloudflare/sections-dataset-api`, with an isolated D1 schema and read-only shadow API. It must preserve append-only epoch evidence, allow incomplete STAGED rows to remain useful for RCA, and make partial publication impossible by moving `current_snapshot_pointer` only when a complete snapshot is promoted to COMMITTED in one atomic D1 transaction boundary.

Cloudflare live acquisition is PR-C scope. PR-B may provide the Worker/runtime/store needed for acquisition, but scheduled live collection must remain disabled/fail-closed and no public write API is authorized.

## Live ground truth

```text
main = d6ffdf222c8301037a96ca1fabc3bf1b929c8530
PR #494 = merged
Cloudflare packages = daily-digest-api, upahead-dataset-api
Sections Cloudflare package = absent
open PR claiming Cloudflare Sections = none found
agents/MASTER_INDEX.md = absent
browser serving authority = /newsdata/sections_latest.json
source registry = config/section_sources.json
registry semantic digest = d6e8c3d706c9848b7e63349ce08cd48c3670377f24c4163150cd368151e96716
registry population = 10 sections / 41 lanes
```

Current Cloudflare documentation checked 2026-08-26:

```text
Workers Free external subrequests/invocation = 50
Workers Paid default subrequests/invocation = 10,000
redirect hops count as subrequests
simultaneous outgoing connections/request = 6
D1 batch() = transactional; failure rolls back the batch
```

Design target remains valid on the conservative 50-subrequest envelope; PR-B must not require paid-plan fanout.

## Mission / acceptance

Phase B is complete only when repository code provides:

1. independent `cloudflare/sections-dataset-api` package;
2. isolated D1 binding/config example and migration;
3. append-only source run + lane evidence + snapshot + item tables;
4. one `current_snapshot_pointer` publication authority;
5. STAGED rows never readable through latest/current endpoints;
6. COMMITTED promotion and pointer move share one transactional D1 batch;
7. cardinality/digest/run-state preconditions fail closed;
8. idempotent retry semantics for the same logical run/snapshot;
9. read-only `GET /api/shadow/sections/latest` and section endpoint;
10. deterministic replay executor uses merged PR-A shared evaluator rather than duplicated policy;
11. no public write API and no browser cutover;
12. focused fault/atomicity certification that proves S100 remains visible when S101 fails at 7/10 sections and 201/284 rows.

## Authority / invariants

```text
SERVING_AUTHORITY = GITHUB_STATIC
CLOUDFLARE_SECTIONS_ROLE = SHADOW_ONLY
CURRENT_POINTER_TARGET_STATE = COMMITTED_ONLY
STAGED_ROWS_VISIBLE = FALSE
PARTIAL_ROWS_RCA_RETAINED = TRUE
WRITE_API_PUBLIC = NONE
RANKING_POLICY_DUPLICATION = FORBIDDEN
SOURCE_REGISTRY_COPY = FORBIDDEN
```

Publication state machine:

```text
create source run
-> write lane evidence / source dispositions
-> create STAGED snapshot with expected cardinalities + digests
-> append/idempotently upsert snapshot rows
-> verify exact section/item counts + run state + digest authority
-> transactional D1.batch(
     conditional STAGED -> COMMITTED,
     conditional current pointer upsert
   )
-> reads resolve pointer -> COMMITTED snapshot only
```

A failed or interrupted writer may leave source evidence and STAGED rows. Those rows are not deleted merely to hide failure and are never selected by current endpoints.

## Planned files

```text
cloudflare/sections-dataset-api/README.md
cloudflare/sections-dataset-api/DEPLOYMENT.md
cloudflare/sections-dataset-api/wrangler.toml.example
cloudflare/sections-dataset-api/migrations/0001_sections_shadow.sql
cloudflare/sections-dataset-api/src/contracts.js
cloudflare/sections-dataset-api/src/epochStore.js
cloudflare/sections-dataset-api/src/replayExecutor.js
cloudflare/sections-dataset-api/src/index.js
cloudflare/sections-dataset-api/src/epochStore.cert.test.js
cloudflare/sections-dataset-api/src/replayExecutor.cert.test.js
reports/PR<NUMBER>_workreport.md
```

Expected shared imports from merged PR-A:

```text
scripts/top-stories-shadow/sectionsShadowEvaluator.mjs
scripts/top-stories-shadow/sectionsShadowInputEpoch.mjs
scripts/top-stories-shadow/sectionsShadowSourceRegistry.mjs
config/section_sources.json
```

## Active register

### DEC-001 — conservative Worker capacity boundary

Design PR-B so storage/replay does not depend on >50 external subrequests. Live 41-lane acquisition/sharding is deferred to PR-C. No feed deletion is permitted.

### DEC-002 — D1 atomic publication

Use D1 `batch()` only for the final state transition + pointer move. STAGED accumulation may span calls; visibility is pointer-gated. Finalization must condition on exact expected section/item cardinality and source-run completeness.

### RISK-001 — false atomicity

A pre-check followed by separate non-transactional COMMIT and pointer writes would allow a crash window. The final state transition and pointer update must therefore be in the same D1 transactional batch and both must be conditional on the same snapshot.

Falsifier: any execution in which `current_snapshot_pointer` can reference `state != COMMITTED` or a snapshot with observed cardinality below expected.

### RISK-002 — retry duplication

Retries must preserve stable logical `run_id` / `snapshot_id`; snapshot items use deterministic `(snapshot_id, section_key, position)` identity. Repeated writes may no-op/update same row, never append duplicate visible positions.

### RISK-003 — schema/runtime drift

Wrangler config and D1 API semantics are time-sensitive. Current Cloudflare docs are authoritative; do not rely on historical limits or obsolete D1 transaction assumptions.

### RISK-004 — hidden production activation

No route/VITE/browser loader/cron deployment is authorized here. A `scheduled()` handler may exist only as disabled foundation and must not perform live acquisition unless a later phase explicitly enables it.

## Validation ledger

| Check | Status | Observation | Oracle | Notes |
|---|---|---|---|---|
| merged PR-A base | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | main=`d6ffdf222...` |
| Phase-B overlap gate | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | no open Cloudflare Sections PR found |
| existing Cloudflare package isolation | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | only Daily Digest + Up Ahead on main |
| Workers subrequest current limits | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | Cloudflare docs checked 2026-08-26 |
| D1 batch transactional semantics | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | Cloudflare D1 docs checked 2026-08-26 |
| Phase-B implementation | NOT_RUN | NOT_OBSERVED | NONE | not started |
| focused atomicity tests | NOT_RUN | NOT_OBSERVED | NONE | not started |
| Wrangler dry-run | NOT_RUN | NOT_OBSERVED | NONE | not started |
| full npm lint/unit/build/certification | NOT_RUN | NOT_OBSERVED | NONE | environment capability to be re-evaluated |
| live Cloudflare deployment | NOT_APPLICABLE | NOT_OBSERVED | NONE | not authorized in PR-B |

## Negative assurance

PR-B must not modify:

```text
.github/workflows/**
src/adapters/sectionsSnapshotLoader.js
src/adapters/sectionsSnapshotFetcher.js
browser VITE_* production source selection
public/newsdata/**
cloudflare/daily-digest-api/**
cloudflare/upahead-dataset-api/**
Top Stories weights/thresholds/event taxonomy/source tiers
config/section_sources.json feed population
```

## Appendix A — takeover qualification

### A1 Production trace — 20
Trace `GET /api/shadow/sections/latest` from request routing through pointer lookup, COMMITTED-state validation, section/item reads, and response assembly. Identify the exact predicate that prevents a STAGED snapshot from being returned.

### A2 Failure isolation — 20
For S100 current and S101 expected 10 sections/284 rows but interrupted after 7/201, state exactly which D1 rows may remain, what pointer value remains, and what response latest must return. Give the first invariant whose failure would make partial publication possible.

### A3 Authority / invariant — 20
Explain why verifying cardinality in one call and then separately updating snapshot state and pointer is insufficient. Show how the transactional finalization statements are coupled so pointer promotion cannot succeed when snapshot promotion is ineligible.

### A4 Independent validation — 20
Construct a fake-D1 or SQLite-backed fault test that stages 7/201 for S101 while S100 is current, invokes finalization, and independently proves pointer=S100, S101=STAGED, and latest=S100. State the falsifier.

### A5 Next commit / minimal patch — 20
Given a retry of the same logical S101 after the interrupted attempt, identify the deterministic primary keys/upsert rules needed to finish to 10/284 without duplicates, then specify the minimal finalization sequence that makes S101 current exactly once.

Takeover target: total >=92/100 and every answer >=17/20.

## Takeover / grounding chain

| Epoch | Basis | Result | Next action |
|---|---|---|---|
| GE-B001 | merged main `d6ffdf222...` | SAFE, WRITE_ALLOWED | allocate draft PR and implement isolated D1 atomic store |
