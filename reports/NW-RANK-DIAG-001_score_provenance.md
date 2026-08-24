# NW-RANK-DIAG-001 — Rank Score and Geography Provenance

# CURRENT RECOVERY STATE — READ FIRST

## 1. Recovery Header

```text
HANDOVER_READINESS: DEGRADED
PR_RECOVERY_STATE: RECOVERABLE
TAKEOVER_AUTHORITY: WRITE_ALLOWED

REPOSITORY: reallaksh19/NWv-7
SOURCE_TASK: User-approved Top Stories/Live/Hybrid repair plan; auto mode Batch 4
PR_OR_WIP: WIP-NW-RANK-DIAG-001
BRANCH: agent/nw-rank-diag-001-score-provenance
STACK_BASE: agent/nw-rank-corr-001-mature-evidence / PR#485

PR_HEAD_OBSERVED: 2170616cd06c4967b872864b3393e28ef9198eb9
REPORT_BASIS_HEAD: 2170616cd06c4967b872864b3393e28ef9198eb9
MAIN_HEAD_LAST_CHECKED: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
MERGE_BASE_WITH_STACK: 2170616cd06c4967b872864b3393e28ef9198eb9
REPORT_SYNC: CURRENT

APPENDIX_A_STATUS: CURRENT
GROUNDING_EPOCH: GE-001
CURRENT_TAKEOVER: NOT_APPLICABLE

CURRENT_STAGE: PLAN
LAST_COMPLETED_STAGE: COORDINATION_CHECK
CURRENT_BLOCKER: none
HIGHEST_RISK: diagnostics arithmetic could diverge from the score actually used for admission
LAST_DURABLE_CHECKPOINT: 2026-08-24T22:38:22+04:00

EXACT_NEXT_ACTION: make one pure score-breakdown result the calculation authority and expose evidence/rank metadata
```

## 2. Handover in 60 Seconds

### What is now true

- `_topStoryRank` stores raw/normalized score and several signal values, but omits location score/evidence, weighted contributions, maximum weighted score, threshold margin, and authoritative rank.
- The Seattle RCA had to reconstruct hidden score inputs mathematically.
- PR #484 already provides a pure geography-evidence signal; PR #485 provides the corrected admission stack.
- This batch is stacked on #485 so its diff contains diagnostics only.
- Browser-visible position remains a later UI/ViewModel work pack and must not be mislabeled as authoritative rank.

### What is currently being worked on

A non-ranking diagnostics contract sourced from the exact arithmetic and evidence used by the ranker.

### What remains unfinished

Implementation, focused tests, standalone validation, remote reconciliation, PR creation, and dependency-backed repository checks.

### What must not be assumed

- This batch does not change score values, ordering, selection, admission, weights, thresholds, or source policy.
- `authoritativeRank` is pre-selection ranker order, not selected position or browser position.
- UI rendering of the new fields is outside this batch.

## 3. Repository Ground Truth

```text
verified_at: 2026-08-24T22:38:22+04:00
main_head: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
stack_base_pr: 485
stack_base_head: 2170616cd06c4967b872864b3393e28ef9198eb9
working_branch: agent/nw-rank-diag-001-score-provenance
pr: not yet allocated
coordination_state: SAFE_STACKED
```

## 4. Mission / Scope / Acceptance

### Mission

Make Top Stories rank diagnostics self-contained and arithmetically identical to the score used for admission.

### Approved scope

- `src/services/topStories/topStoriesRanker.js`;
- `src/services/topStories/topStoriesSignals.js`;
- one pure score-breakdown module;
- focused certification;
- this living report.

### Explicit non-goals

- no score/admission/selection policy changes;
- no browser-position or personalization changes;
- no UI rendering;
- no workflows/generated data/dependencies.

### Acceptance criteria

1. One pure result authors raw score, normalized score, max weighted score, and per-signal contributions.
2. Contribution sum minus penalty exactly equals raw score.
3. Normalized score exactly equals raw/max clamped to `[0,1]`.
4. `_topStoryRank` exposes location score, target, confidence, and evidence.
5. Geography evidence excludes `section`/`sourceSection` provenance.
6. `_topStoryRank.thresholdMargin` is normalized score minus the applicable threshold, or `null`.
7. Every scored candidate exposes a 1-based `authoritativeRank` after authoritative sorting.
8. Existing scores, order, admission decisions, and selected IDs remain unchanged.
9. Stack-relative diff contains only intended files.

## 5. Current Implementation State

| Work item | Implementation | Validation | Remaining |
|---|---|---|---|
| Pure score-breakdown authority | UNSTARTED | NOT_RUN | implement |
| Geography provenance propagation | UNSTARTED | NOT_RUN | implement |
| Authoritative rank annotation | UNSTARTED | NOT_RUN | implement |
| Focused certification | UNSTARTED | NOT_RUN | implement |
| Full repository checks | UNSTARTED | NOT_RUN | dependencies required |

## 6. Active Item Register

| ID | Type | Severity | Status | Summary | Evidence |
|---|---|---|---|---|---|
| ISS-001 | diagnostics | high | OPEN | score inputs require manual reconstruction | `_topStoryRank` omissions |
| ISS-002 | diagnostics | high | OPEN | visible position can be confused with ranker order | no authoritative-rank field |
| RISK-001 | risk | high | OPEN | duplicate arithmetic could drift | single-authority requirement |
| DEC-001 | decision | medium | ACCEPTED | UI consumption deferred; backend contract first | scope boundary |

## 7. Technical Diagnosis

```text
Current score arithmetic: inline in scoreTopStoryCandidate
Current output: raw/normalized plus selected unweighted signal values
Missing: weight, contribution, max score, location evidence, threshold margin, authoritative rank
Required: compute once -> consume for admission -> publish same result
```

## 8. Authority and Invariants

```text
score authority: pure score-breakdown result
geography authority: PR #484 pure location signal
ordering authority: compareRankedTopStories result
selected/browser positions: unchanged and not represented as authoritative rank
```

Invariants:

- score formula and operation order remain equivalent;
- admission consumes the same normalized score exposed in diagnostics;
- candidate input objects remain unmutated;
- no UI makes new claims in this batch.

## 9. Current Validation

### VAL-001 — Source trace

```text
Status: PASS
Observation: SOURCE_INSPECTION
Oracle: NONE
Tested HEAD: stack base 2170616cd06c4967b872864b3393e28ef9198eb9
Actual: diagnostics omit location provenance/contributions/ranker index
```

### VAL-002 — Arithmetic cert

```text
Status: NOT_RUN
Observation: NOT_OBSERVED
Oracle: IMPLEMENTATION_COUPLED
```

### VAL-003 — Independent standalone validation

```text
Status: NOT_RUN
Observation: NOT_OBSERVED
Oracle: INDEPENDENT
```

### VAL-004 — Repository Vitest/lint/build/full certification

```text
Status: NOT_RUN
Observation: NOT_OBSERVED
Oracle: NONE
```

## 10. Changed-File Ledger

| File | Intended? | Purpose | Validation |
|---|---:|---|---|
| `reports/NW-RANK-DIAG-001_score_provenance.md` | yes | living recovery report | source review |

Stack-relative changed-file count after report creation: 1.  
Ledger count: 1.  
Unexplained files: 0.

## 11. Review / CI State

No PR allocated. No review threads. Dependency-backed checks are NOT_RUN. Merge authority is not granted.

## 12. Repository Coordination / Overlap

```text
MASTER_INDEX_CHECKED: not present
STATUS_RECORD: this living report
CLAIM_RECORD: report scope declaration
LAST_OVERLAP_CHECK: 2026-08-24T22:38:22+04:00
FILE_OVERLAP: none outside explicit PR #485 stack dependency
AUTHORITY_OVERLAP: score/rank changes are diagnostics-only and stacked on current ranker authority
DEPENDENCY_OVERLAP: PR #484 -> PR #485 -> this batch
COORDINATION_STATE: SAFE_STACKED
```

## 13. Continuation State

```text
Start here: scoreTopStoryCandidate and extractTopStorySignals
Do not change: policy values, admission logic, comparator, selection, browser processing, UI
Validation required: arithmetic identity, evidence provenance, authoritative-rank stability
Exact next action: add pure breakdown, propagate location signal, annotate sorted candidates
Merge authority: NOT_GRANTED
```

## 14. Grounding / Custody Chain

### GE-001

```text
verified_at: 2026-08-24T22:38:22+04:00
BRANCH_HEAD: 2170616cd06c4967b872864b3393e28ef9198eb9
STACK_BASE_HEAD: 2170616cd06c4967b872864b3393e28ef9198eb9
MAIN_HEAD: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
stack_relative_changed_files_verified: 0 before report creation
reviews_verified: no PR
checks_verified: no PR
```

# APPENDIX A — IMPLEMENTATION TAKEOVER QUALIFICATION

```text
Qualification basis: GE-001
Generated from: ISS-001, ISS-002, RISK-001
Next intended stage: IMPLEMENT
APPENDIX_A_STATUS: CURRENT
```

1. **A1 Production Trace (20):** Trace score values from signals through arithmetic, admission, sorting, selection, and Story Intelligence metadata.
2. **A2 Failure Isolation (20):** Prove a diagnostic-only patch preserves scored order and selected IDs for the same fixture.
3. **A3 Authority / Invariant (20):** Define authoritative rank separately from selected rank and browser position.
4. **A4 Independent Validation (20):** Reconstruct a known score from pure breakdown outputs and verify contribution equality.
5. **A5 Minimal Patch (20):** Reuse PR #484 evidence, add one pure arithmetic module, and avoid UI/browser changes.

# HISTORICAL RECORD — NOT CURRENT AUTHORITY

## Stage Execution Log

- 2026-08-24T22:38:22+04:00 — GE-001 established on PR #485 stack base; implementation not started.
