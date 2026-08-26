# PR495 — NW-CF-HYBRID-001B living work report

## Recovery header

```text
WORK_ID=PR495
ISSUE=493
PR=495
BRANCH=agent/nw-cf-hybrid-001b-sections-shadow-store
BASE_SHA=d6ffdf222c8301037a96ca1fabc3bf1b929c8530
PR_HEAD_OBSERVED=bb6df1cfa97959d572e6292455ece5ed22f25ce3
REPORT_BASIS_HEAD=bb6df1cfa97959d572e6292455ece5ed22f25ce3
MAIN_HEAD_LAST_CHECKED=d6ffdf222c8301037a96ca1fabc3bf1b929c8530
MERGE_BASE=d6ffdf222c8301037a96ca1fabc3bf1b929c8530
HANDOVER_READINESS=READY
PR_RECOVERY_STATE=HEALTHY
TAKEOVER_AUTHORITY=WRITE_ALLOWED
REPORT_SYNC=CURRENT
APPENDIX_A_STATUS=CURRENT
GROUNDING_EPOCH=GE-B001
LAST_DURABLE_CHECKPOINT=PR_ALLOCATED
CURRENT_STAGE=IMPLEMENT
CURRENT_BLOCKER=NONE
HIGHEST_RISK=PARTIAL_EPOCH_PUBLICATION_OR_FALSE_ATOMICITY
WORK_INTENT=IMPLEMENT
REPOSITORY_STATE=EXISTING_PR
MUTATION_AUTHORITY=WRITE_ALLOWED
CRITICALITY=DATA_PLANE_CRITICAL/RANKING_AUTHORITY_CRITICAL
COORDINATION_STATE=SAFE
EXECUTION_MODE=AUTO
AUTO_STATE=RUNNING
SCOPE_AUTHORITY=LOCKED_TO_ISSUE_493_PR_B
PHASE_PROGRESSION=AUTO
MERGE_AUTHORITY=OWNER_ONLY
EXACT_NEXT_ACTION=IMPLEMENT_ISOLATED_D1_SCHEMA_ATOMIC_STORE_AND_READ_ONLY_WORKER
```

Draft PR #495 implements Issue #493 Phase B from merged PR-A authority `d6ffdf222c8301037a96ca1fabc3bf1b929c8530`.

## Handover in 60 seconds

The production browser still reads `/newsdata/sections_latest.json`. Phase B adds a third Cloudflare package only: `cloudflare/sections-dataset-api`. Daily Digest and Up Ahead storage are protected and untouched. No workflow, browser source selection, public write endpoint, production route, or live acquisition is authorized in this PR.

The core invariant is pointer-gated publication: source/lane evidence and incomplete STAGED snapshot rows may persist for RCA, but they are never readable as current. A snapshot becomes visible only when exact expected section/item cardinality and provenance/run state are satisfied and a single transactional D1 `batch()` both promotes STAGED→COMMITTED and moves `current_snapshot_pointer`.

Cloudflare docs checked 2026-08-26 confirm Free Workers remain limited to 50 external subrequests per invocation, redirects count, and D1 `batch()` is transactional/rollback-on-failure. PR-B therefore does not depend on paid-plan fanout; live 41-lane acquisition/sharding remains PR-C.

## Ground truth

```text
main                              = d6ffdf222c8301037a96ca1fabc3bf1b929c8530
PR #494                           = merged
PR #495                           = open draft
source registry                   = config/section_sources.json
source registry digest            = d6e8c3d706c9848b7e63349ce08cd48c3670377f24c4163150cd368151e96716
source registry population        = 10 sections / 41 lanes
browser serving authority         = /newsdata/sections_latest.json
Cloudflare Sections package       = not present on base
open Cloudflare Sections overlap  = none found
agents/MASTER_INDEX.md            = absent
```

## Mission / acceptance

1. Independent `cloudflare/sections-dataset-api` package and D1 binding example.
2. D1 migration with append-only run/evidence/snapshot/item/parity authority and one current pointer.
3. Deterministic ids/upserts make retries idempotent.
4. STAGED/incomplete snapshots cannot be returned by current endpoints.
5. Final COMMITTED promotion and pointer movement are one D1 transaction boundary.
6. Exact cardinality + source-run/provenance/digest gates fail closed.
7. Read-only shadow endpoints: latest and named section; parity endpoint may return no-record until PR-C.
8. Worker deterministic replay imports merged PR-A shared authority rather than duplicating ranking policy.
9. No public write API, browser cutover, source registry copy, workflow, cron deployment, or live acquisition activation.
10. Focused certification includes S100 current / S101 7-of-10 + 201-of-284 failure and same-epoch retry.

## Planned state machine

```text
RUN CREATED
 -> lane evidence accumulated
 -> run COMPLETE or FAILED
 -> snapshot STAGED with expected counts/digests
 -> item rows idempotently written
 -> inspect exact observed section/item counts
 -> transactional finalize:
      conditional snapshot STAGED -> COMMITTED
      conditional pointer -> same committed snapshot
 -> GET latest resolves pointer + COMMITTED predicate
```

Allowed lane dispositions for future PR-C custody:

```text
OK | EMPTY | TIMEOUT | HTTP_ERROR | PARSE_ERROR | POLICY_BLOCKED
```

## Authority / invariants

```text
SERVING_AUTHORITY=GITHUB_STATIC
CLOUDFLARE_SECTIONS_ROLE=SHADOW_ONLY
CURRENT_POINTER_TARGET_STATE=COMMITTED_ONLY
STAGED_ROWS_VISIBLE=FALSE
PARTIAL_ROWS_RCA_RETAINED=TRUE
PUBLIC_WRITE_API=NONE
RANKING_POLICY_DUPLICATION=FORBIDDEN
SOURCE_REGISTRY_COPY=FORBIDDEN
LIVE_ACQUISITION=DEFERRED_TO_PR_C
```

## Active register

### DEC-001 — conservative fanout
PR-B contains no live 41-feed collector. PR-C must shard/batch against a conservative <=50 external-subrequest envelope unless deployed-plan authority is explicitly proven otherwise.

### DEC-002 — finalization transaction
Use D1 `batch()` for the coupled snapshot-state + pointer transition. Pre-finalization cardinality inspection is diagnostic; the state transition itself must re-check eligibility in SQL so a stale pre-check cannot publish partial rows.

### RISK-001 — false atomicity
Falsifier: pointer can reference a STAGED snapshot or snapshot with fewer rows/sections than declared expected counts.

### RISK-002 — retry duplication
Use stable logical run/snapshot ids and deterministic `(snapshot_id, section_key, position)` row identity. Retrying the same epoch must complete missing rows, not duplicate positions.

### RISK-003 — transaction no-op ambiguity
D1 statements that affect zero rows do not necessarily throw. Finalization must inspect returned write metadata and fail closed unless both snapshot promotion and pointer write are proven to have occurred together, while an already-committed same-pointer retry is an explicit idempotent success path.

### RISK-004 — hidden activation
No scheduled live collector or production route is enabled. A scheduled handler, if present, must return a disabled status only.

## Validation ledger

| Check | Status | Observation | Oracle | Basis |
|---|---|---|---|---|
| merged PR-A base | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | main=`d6ffdf222...` |
| PR-B overlap | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | no open Sections/Cloudflare claimant |
| current Worker limits | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | Cloudflare docs, 2026-08-26 |
| D1 batch semantics | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | Cloudflare D1 docs, 2026-08-26 |
| implementation | NOT_RUN | NOT_OBSERVED | NONE | pending |
| focused atomicity certification | NOT_RUN | NOT_OBSERVED | NONE | pending |
| Wrangler dry-run | NOT_RUN | NOT_OBSERVED | NONE | pending |
| full lint/unit/build/certify | NOT_RUN | NOT_OBSERVED | NONE | pending environment check |
| live deployment | NOT_APPLICABLE | NOT_OBSERVED | NONE | not authorized in PR-B |

## Negative assurance

Must remain unchanged:

```text
.github/workflows/**
src/adapters/sectionsSnapshotLoader.js
src/adapters/sectionsSnapshotFetcher.js
public/newsdata/**
cloudflare/daily-digest-api/**
cloudflare/upahead-dataset-api/**
config/section_sources.json feed population
Top Stories weights/thresholds/event taxonomy/source tiers
browser VITE source selection
```

## Changed-file ledger

```text
reports/PR495_workreport.md  ADD  recovery authority
reports/WIP-NW-CF-HYBRID-001B_workreport.md  DELETE_PENDING  superseded after PR allocation
```

## Appendix A — implementation takeover qualification

### A1 Production trace — 20
Trace `GET /api/shadow/sections/latest` from router through pointer lookup, COMMITTED verification, item read and response assembly. Name the exact SQL/contract predicate that excludes STAGED rows.

### A2 Current failure isolation — 20
S100 is current. S101 expects 10 sections/284 rows and fails at 7/201. State the surviving rows/state/pointer and exactly what latest returns. Identify the first invariant whose removal would expose partial S101.

### A3 Authority/invariant — 20
Explain why a separate cardinality pre-check followed by independent snapshot and pointer writes is unsafe. Show the transaction coupling and conditional eligibility required in finalization.

### A4 Independent validation — 20
Design a fake-D1/SQLite fault test that stages S101 at 7/201 and proves pointer=S100, S101=STAGED and latest=S100. State the falsifier.

### A5 Next commit/minimal patch — 20
For same-logical-epoch retry, identify deterministic primary keys/upsert behavior and the minimal exactly-once finalization path from 7/201 to 10/284/current.

Qualification target: total >=92/100 and every question >=17/20.

## Takeover / grounding chain

| Epoch | Basis | State | Next action |
|---|---|---|---|
| GE-B001 | main `d6ffdf222...`, PR-A merged | SAFE / WRITE_ALLOWED | implement Phase-B store + Worker |
