# NW-RANK-HYBRID-001 — Shared Sections Snapshot Single-Flight

# CURRENT RECOVERY STATE — READ FIRST

## 1. Recovery Header

```text
HANDOVER_READINESS: DEGRADED
PR_RECOVERY_STATE: RECOVERABLE
TAKEOVER_AUTHORITY: WRITE_ALLOWED

REPOSITORY: reallaksh19/NWv-7
SOURCE_TASK: User-approved Top Stories/Live/Hybrid repair plan; auto mode
PR_OR_WIP: WIP-NW-RANK-HYBRID-001
BRANCH: agent/nw-rank-hybrid-001-snapshot-singleflight

PR_HEAD_OBSERVED: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
REPORT_BASIS_HEAD: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
MAIN_HEAD_LAST_CHECKED: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
MERGE_BASE: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
REPORT_SYNC: CURRENT

APPENDIX_A_STATUS: CURRENT
GROUNDING_EPOCH: GE-001
CURRENT_TAKEOVER: NOT_APPLICABLE

CURRENT_STAGE: PLAN
LAST_COMPLETED_STAGE: COORDINATION_CHECK
CURRENT_BLOCKER: none
HIGHEST_RISK: a failed shared request could remain latched and block later retries
LAST_DURABLE_CHECKPOINT: 2026-08-24T22:09:30+04:00

EXACT_NEXT_ACTION: add one shared in-flight snapshot load with failure cleanup and focused concurrency certification
```

## 2. Handover in 60 Seconds

### What is now true

- Live `main` was grounded at `900daeac937bfd1b21a7fe63495cbe2388f50ecd`.
- Daily Digest PR #482 is merged into that main SHA.
- Open PRs #386/#387 overlap old Top Stories validation paths but not this batch's intended files.
- Open PR #396 is an unrelated blocked Up Ahead evidence report.
- Concurrent section callers currently enter `loadSectionsSnapshot()` independently while the memory cache is empty.

### What is currently being worked on

A bounded Hybrid acquisition fix that coalesces concurrent snapshot loads into one network/retry/budget operation.

### What remains unfinished

Implementation, focused tests, source self-review, branch reconciliation, PR creation, and full repository validation.

### What has been proven

Source inspection shows `sectionsDataset.load()` fetches sections concurrently and each Hybrid section can call the shared snapshot loader before `memorySnapshot` is populated.

### What has NOT been proven / NOT_RUN

- focused Vitest;
- lint;
- build;
- full certification;
- browser timing;
- deployed Hybrid timing.

### What must not be assumed

- This batch does not restore deleted workflows.
- This batch does not change stale-snapshot fallback policy.
- This batch does not unify the two Top Stories authorities.
- This batch does not change ranking, source identity, geography, UI, Daily Digest, or generated data.

### Highest-risk remaining item

Promise lifecycle cleanup must allow a later request to retry after a shared failure and must not let cache clear resurrect an invalid cached result.

### Exact next action

Implement a shared in-flight promise in `src/adapters/sectionsSnapshotFetcher.js` and add deterministic concurrency/failure tests.

## 3. Repository Ground Truth

```text
verified_at: 2026-08-24T22:09:30+04:00
default_branch: main
main_head: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
working_branch: agent/nw-rank-hybrid-001-snapshot-singleflight
pr: not yet allocated
merge_base: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
open_prs_checked: 396, 386, 387
checks_on_main: no reported commit statuses
workflow_files: absent from current main per preceding audit
coordination_state: SAFE
```

## 4. Mission / Scope / Acceptance

### Mission

Prevent Hybrid mode from issuing one identical sections-snapshot request per concurrently loaded section.

### Approved scope

- `src/adapters/sectionsSnapshotFetcher.js`;
- its focused certification test;
- this living report.

### Explicit non-goals

- no `.github/workflows/*`;
- no generated snapshots;
- no ranking formula or admission changes;
- no source registry/geography changes;
- no UI;
- no Daily Digest;
- no stale-fallback policy change;
- no dependency/package changes.

### Acceptance criteria

1. Concurrent cold-cache calls share one fetch operation.
2. All callers receive the same resolved snapshot.
3. A shared failure is cleared so the next call can retry.
4. Existing TTL cache and foreground budget/retry semantics remain.
5. `force` bypasses the resolved memory cache but does not create a concurrent request stampede.
6. Cache clearing prevents an earlier pending request from repopulating the cleared memory cache.
7. No unrelated file changes.

## 5. Current Implementation State

| Work item | Implementation | Integration | Validation | Location | Remaining |
|---|---|---|---|---|---|
| Shared in-flight load | UNSTARTED | existing loader is production consumer | NOT_RUN | `sectionsSnapshotFetcher.js` | implement |
| Concurrency certification | UNSTARTED | focused cert suite | NOT_RUN | cert test | implement |
| Full repository checks | UNSTARTED | repository | NOT_RUN | package scripts | run if checkout/dependencies become available |

## 6. Active Item Register

| ID | Type | Severity | Priority | Status | Summary | Evidence | Current PR? |
|---|---|---|---|---|---|---|---|
| ISS-001 | defect | high | P0 | OPEN | concurrent Hybrid sections duplicate the same snapshot request | source trace | yes |
| RISK-001 | risk | high | P0 | OPEN | rejected shared promise could remain latched | promise lifecycle | yes |
| RISK-002 | risk | medium | P1 | OPEN | cache clear during pending load could repopulate stale memory | cache lifecycle | yes |
| DEC-001 | decision | medium | P1 | ACCEPTED | limit this batch to request coalescing; preserve selection/freshness semantics | scope boundary | yes |
| QST-001 | question | high | P0 | DEFERRED | scheduled producer authority remains unresolved | WP0 decision gate | no |

## 7. Current Technical Diagnosis

```text
Observed symptom: Hybrid can feel slower than Live.
Current hypothesis: concurrent section loads each start the same 1.5-second-budget snapshot request before memorySnapshot exists.
Supporting evidence: sectionsDataset uses Promise.allSettled over sections; loadSectionsSnapshot has resolved-memory caching but no in-flight caching.
Alternative hypotheses: stale fallback behavior; duplicate Main/NewsContext orchestration; proxy latency.
Already ruled out: the ranking score calculation itself does not create the snapshot network wait.
Falsifier: a deterministic concurrent test observes only one fetch call on current main.
Next isolating experiment: hold the first fetch unresolved, start multiple loadSectionsSnapshot calls, then inspect fetch-call count.
```

## 8. Authority and Invariants

```text
authority: served sections_latest.json payload
transformation: snapshot schema validation and memory caching
consumer: per-section selection and downstream ranking
publication/UI: unchanged
```

Invariants:

- snapshot URL, schema support, retry backoff, foreground budget and TTL remain unchanged;
- all callers observe the same snapshot payload;
- no failure becomes cached as success;
- clearing the cache invalidates resolved-memory authority;
- ranking and presentation remain outside this PR.

## 9. Current Validation

### VAL-001 — Production trace

```text
Status: PASS
Observation: SOURCE_INSPECTION
Oracle: NONE
Tested HEAD: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
Evidence: sectionsDataset concurrent section map -> fetchSectionNews -> fetchPrefetchedSectionNews -> loadSectionsSnapshot
Expected: more than one cold caller can enter before memorySnapshot is set
Actual: no in-flight promise exists
Limitations: source-level diagnosis, not deployed timing
Origin: PREEXISTING
```

### VAL-002 — Focused concurrency test

```text
Status: NOT_RUN
Observation: NOT_OBSERVED
Oracle: IMPLEMENTATION_COUPLED
Tested HEAD: not yet implemented
```

### VAL-003 — Full repository validation

```text
Status: NOT_RUN
Observation: NOT_OBSERVED
Oracle: NONE
Tested HEAD: not yet implemented
```

## 10. Changed-File Ledger

| File | Intended? | First stage | Latest stage | Purpose | Sensitive? | Validation |
|---|---:|---|---|---|---:|---|
| `reports/NW-RANK-HYBRID-001_snapshot_singleflight.md` | yes | PLAN | PLAN | living recovery report | no | source review |

Actual branch file count: 1 after this report commit.  
Ledger count: 1.  
Unexplained files: 0.

## 11. Review / CI State

No PR allocated. No review threads. Current main reports no commit statuses. Workflow restoration is outside this batch.

## 12. Repository Coordination / Overlap

```text
MASTER_INDEX_CHECKED: not present
STATUS_RECORD: this living report
CLAIM_RECORD: report scope declaration
LAST_OVERLAP_CHECK: 2026-08-24T22:09:30+04:00
FILE_OVERLAP: none with open PRs #396/#386/#387
AUTHORITY_OVERLAP: old ranking validation PRs exist, but this batch changes acquisition concurrency only
DEPENDENCY_OVERLAP: none
COORDINATION_STATE: SAFE
```

## 13. Continuation State

```text
Start here: src/adapters/sectionsSnapshotFetcher.js
Exact function: loadSectionsSnapshot
Current value/path under investigation: memorySnapshot is resolved-only; no shared pending load
Do not redo: live-main/open-PR grounding at GE-001 unless main moves
Do not change: freshness, selection, fallback, ranking, UI, workflows
Validation still required: concurrency, failure retry, cache clear, syntax, focused cert
Highest-risk remaining item: promise cleanup after failure/cache clear
Exact next action: implement shared pending-load lifecycle
```

## 14. Grounding / Custody Chain

### GE-001

```text
verified_at: 2026-08-24T22:09:30+04:00
PR_HEAD: not allocated
BRANCH_HEAD: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
MAIN_HEAD: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
MERGE_BASE: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
changed_files_verified: 0 before report creation
reviews_verified: no PR
checks_verified: no reported main statuses
claims_verified: open PR changed-file inspection
```

# APPENDIX A — IMPLEMENTATION TAKEOVER QUALIFICATION

Qualification basis:

```text
PR_HEAD: not allocated
MAIN_HEAD: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
GROUNDING_EPOCH: GE-001
Generated from: ISS-001, RISK-001, RISK-002
Next intended stage: IMPLEMENT
APPENDIX_A_STATUS: CURRENT
```

1. **A1 Production Trace (20):** Trace one Main Hybrid refresh from `sectionsDataset.load()` to the actual snapshot fetch and identify the exact boundary at which concurrent section calls duplicate work. Include a request-count prediction and falsifier.
2. **A2 Failure Isolation (20):** Design a deferred-fetch experiment distinguishing resolved-cache reuse from in-flight reuse. State what observation would disprove ISS-001.
3. **A3 Authority / Invariant (20):** Explain why request coalescing may change network count but must not change snapshot payload, freshness classification, item selection, or ranking authority.
4. **A4 Independent Validation (20):** Specify a test in which two callers wait on one externally controlled fetch and prove both success sharing and later retry after rejection.
5. **A5 Minimal Patch (20):** Identify the smallest production/test change that coalesces requests, cleans up rejection, and prevents cache-clear resurrection without changing fallback semantics.

# HISTORICAL RECORD — NOT CURRENT AUTHORITY

## Stage Execution Log

- 2026-08-24T22:09:30+04:00 — GE-001 established; scope classified SAFE; implementation not started.
