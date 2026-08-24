# NW-RANK-CORR-001 — Mature Non-Local Critical-Event Evidence

# CURRENT RECOVERY STATE — READ FIRST

## 1. Recovery Header

```text
HANDOVER_READINESS: DEGRADED
PR_RECOVERY_STATE: RECOVERABLE
TAKEOVER_AUTHORITY: WRITE_ALLOWED

REPOSITORY: reallaksh19/NWv-7
SOURCE_TASK: User-approved Top Stories/Live/Hybrid repair plan; auto mode Batch 3
PR_OR_WIP: WIP-NW-RANK-CORR-001
BRANCH: agent/nw-rank-corr-001-mature-evidence
STACK_BASE: agent/nw-rank-geo-001-evidence-provenance / PR#484

PR_HEAD_OBSERVED: d1831e6624570eb0ba2017bd0346f6ad5adcf597
REPORT_BASIS_HEAD: d1831e6624570eb0ba2017bd0346f6ad5adcf597
MAIN_HEAD_LAST_CHECKED: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
MERGE_BASE_WITH_STACK: d9a58e93cebf1068f94bc87e66998038124b96ec
REPORT_SYNC: CURRENT

APPENDIX_A_STATUS: CURRENT
GROUNDING_EPOCH: GE-002
CURRENT_TAKEOVER: NOT_APPLICABLE

CURRENT_STAGE: PR_CREATE
LAST_COMPLETED_STAGE: VALIDATE
CURRENT_BLOCKER: none
HIGHEST_RISK: dependency-backed repository checks are unavailable in the connector-only checkout
LAST_DURABLE_CHECKPOINT: 2026-08-24T22:34:47+04:00

EXACT_NEXT_ACTION: open a draft stacked PR against the PR #484 branch and reconcile its remote state
```

## 2. Handover in 60 Seconds

### What is now true

- The current ranker rejects lack of evidence only for `eventQualified=false` and one fallback-aggregator case.
- Qualified `public_safety`, `disaster`, `war_conflict`, and `civic_alert` stories can remain eligible in secondary/fallback with one weak source and zero corroboration.
- The Seattle example is secondary, non-local, single-source, non-authoritative, and uncorroborated.
- PR #484 fixes the geography authority needed to classify that story as non-local; this batch is therefore stacked on #484.
- Open PRs #386/#387/#396/#483 do not touch this batch's intended files.

### What is currently being worked on

Implementation and focused certification are complete; stacked draft PR allocation is next.

### What remains unfinished

Draft PR creation/reconciliation and dependency-backed repository checks.

### What must not be assumed

- This batch does not change event classification or public-interest scores.
- This batch does not implement event materiality.
- This batch does not change primary-band admission, local critical-event admission, weights, thresholds, source tiers, or UI.
- “Authoritative” uses the existing source-quality signal; source-family registry reform remains separate.

## 3. Repository Ground Truth

```text
verified_at: 2026-08-24T22:34:47+04:00
default_branch: main
main_head: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
stack_base_branch: agent/nw-rank-geo-001-evidence-provenance
stack_base_head: d9a58e93cebf1068f94bc87e66998038124b96ec
working_branch: agent/nw-rank-corr-001-mature-evidence
pr: not yet allocated
branch_head: d1831e6624570eb0ba2017bd0346f6ad5adcf597
stack_relative_ahead_by: 4
stack_relative_behind_by: 0
coordination_state: SAFE_STACKED
```

## 4. Mission / Scope / Acceptance

### Mission

Prevent secondary/fallback non-local critical events from entering Top Stories on one weak source with no independent evidence.

### Approved scope

- `src/services/topStories/topStoriesRanker.js`;
- one pure evidence-admission module;
- focused pure and ranker-integration certification;
- this living report.

### Explicit non-goals

- no classifier/materiality/public-interest changes;
- no primary-band/local admission changes;
- no ranking weights/thresholds;
- no source registry;
- no UI/workflows/generated data/dependencies.

### Acceptance criteria

1. Secondary/fallback non-local critical events with no independent evidence and source quality below `0.95` are rejected.
2. Independent corroboration preserves eligibility.
3. Existing authoritative source quality `>=0.95` preserves eligibility as primary evidence.
4. Primary-band critical events are unchanged.
5. Local critical events are unchanged.
6. Non-critical event types are unchanged.
7. Rejection exposes `mature_nonlocal_critical_without_evidence`.
8. No score weights, normalization, or thresholds change.
9. PR diff against its stack base contains only intended Batch 3 files.

## 5. Current Implementation State

| Work item | Implementation | Validation | Remaining |
|---|---|---|---|
| Pure mature-evidence decision | COMPLETE | syntax + standalone PASS | repository suite |
| Ranker integration | COMPLETE | syntax + exact remote match PASS | repository suite |
| Pure/integration cert | COMPLETE | syntax PASS; Vitest runner NOT_RUN | run Vitest |
| Full repository checks | NOT_RUN | NOT_RUN | full checkout/dependencies required |

## 6. Active Item Register

| ID | Type | Severity | Status | Summary | Evidence |
|---|---|---|---|---|---|
| ISS-001 | defect | high | RESOLVED | qualified critical type bypassed corroboration at mature ages | mature evidence gate |
| RISK-001 | risk | high | MITIGATED | gate could suppress authoritative or local reports | explicit primary/local/authoritative/independent exceptions |
| DEC-001 | decision | high | ACCEPTED | secondary/fallback are mature bands; primary remains unchanged | age-band boundary |
| DEC-002 | decision | medium | ACCEPTED | source quality `>=0.95` is bounded authoritative evidence | existing signal reuse |

## 7. Technical Diagnosis

```text
Current admission sequence:
  age band -> unqualified/no-evidence guard -> score threshold -> fallback aggregator guard -> admit

Missing policy:
  qualified critical + secondary/fallback + non-local + weak single source + no independent evidence -> reject

Required exceptions:
  independent evidence OR authoritative existing source-quality signal

Seattle expected transition:
  current: public_safety + secondary + score 0.55 -> admitted
  patched: non-local + source quality 0.48 + independent evidence 0 -> rejected before threshold admission
```

## 8. Authority and Invariants

```text
event authority: existing classifier
age authority: existing age band
geography authority: PR #484 story-only relevance
independent evidence authority: existing source/top-feed corroboration signals
authoritative evidence proxy: existing sourceQualityScore >= 0.95
score/publication: unchanged
```

## 9. Current Validation

### VAL-001 — Production source trace

```text
Status: PASS
Observation: SOURCE_INSPECTION
Oracle: NONE
Tested HEAD: stack base d9a58e93cebf1068f94bc87e66998038124b96ec
Actual: qualified critical events have no mature-age evidence guard
Origin: PREEXISTING
```

### VAL-002 — Pure decision cert

```text
Status: PASS (syntax/source review); Vitest runner NOT_RUN
Observation: STATIC_AND_STANDALONE_EQUIVALENT
Oracle: IMPLEMENTATION_COUPLED
Cases: missing; independent; authoritative; primary; local; non-critical
```

### VAL-003 — Ranker integration cert

```text
Status: PASS (syntax/source review); Vitest runner NOT_RUN
Observation: STATIC_INTEGRATION_TRACE
Oracle: IMPLEMENTATION_COUPLED
Cases: Seattle rejection; corroborated Seattle; Reuters Seattle
```

### VAL-004 — Independent standalone validation

```text
Status: PASS
Observation: EXECUTED
Oracle: INDEPENDENT
Tested content: exact admission module published at d1831e6624570eb0ba2017bd0346f6ad5adcf597
Actual: Top Stories mature evidence admission: PASS
```

### VAL-005 — Repository Vitest/lint/build/full certification

```text
Status: NOT_RUN
Observation: NOT_OBSERVED
Oracle: NONE
Reason: full authenticated checkout/dependency environment unavailable; current main has no Actions workflows
```

### VAL-006 — Stack-relative remote reconciliation

```text
Status: PASS
Observation: CONNECTOR_COMPARE
Oracle: INDEPENDENT
Base: agent/nw-rank-geo-001-evidence-provenance @ d9a58e93cebf1068f94bc87e66998038124b96ec
Head: d1831e6624570eb0ba2017bd0346f6ad5adcf597
Result: ahead 4, behind 0; four intended files; all three source/test files match validated local contents exactly
```

## 10. Changed-File Ledger

| File | Intended? | Purpose | Validation |
|---|---:|---|---|
| `reports/NW-RANK-CORR-001_mature_evidence.md` | yes | living recovery report | source review |
| `src/services/topStories/topStoriesRanker.js` | yes | delegate slot admission to focused policy module | syntax + exact remote match |
| `src/services/topStories/topStoriesEvidenceAdmission.js` | yes | preserve existing guards and add mature evidence gate | syntax + standalone behavior + exact remote match |
| `src/services/topStories/topStoriesEvidenceAdmission.cert.test.js` | yes | pure and Seattle integration certification | syntax + source review + exact remote match |

Stack-relative changed-file count: 4.  
Ledger count: 4.  
Unexplained files: 0.

## 11. Review / CI State

No PR allocated. No review threads. Dependency-backed checks are NOT_RUN. Merge authority is not granted.

## 12. Repository Coordination / Overlap

```text
MASTER_INDEX_CHECKED: not present
STATUS_RECORD: this living report
CLAIM_RECORD: report scope declaration
LAST_OVERLAP_CHECK: 2026-08-24T22:29:42+04:00
FILE_OVERLAP: none with open PRs #386/#387/#396/#483/#484
AUTHORITY_OVERLAP: depends on PR #484 geography authority; represented as an explicit stack base
DEPENDENCY_OVERLAP: PR #484 required
COORDINATION_STATE: SAFE_STACKED
```

## 13. Continuation State

```text
Start here: create a draft PR from agent/nw-rank-corr-001-mature-evidence to agent/nw-rank-geo-001-evidence-provenance
Do not redo: main/stack/open-PR grounding unless either base moves
Do not change: classifier, materiality, public-interest values, primary/local policy, weights, thresholds, UI, workflows
Validation still required: repository Vitest/lint/build/full certification when available
Exact next action: create stacked draft PR and reconcile metadata/reviews/threads/checks
Merge authority: NOT_GRANTED
```

## 14. Grounding / Custody Chain

### GE-001

```text
verified_at: 2026-08-24T22:29:42+04:00
BRANCH_HEAD: d9a58e93cebf1068f94bc87e66998038124b96ec
STACK_BASE_HEAD: d9a58e93cebf1068f94bc87e66998038124b96ec
MAIN_HEAD: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
stack_relative_changed_files_verified: 0 before report creation
reviews_verified: no PR
checks_verified: no PR
claims_verified: open PR changed-file inspection
```

### GE-002

```text
verified_at: 2026-08-24T22:34:47+04:00
BRANCH_HEAD: d1831e6624570eb0ba2017bd0346f6ad5adcf597
STACK_BASE_HEAD: d9a58e93cebf1068f94bc87e66998038124b96ec
MAIN_HEAD: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
stack_relative_changed_files_verified: 4 intended, 0 unexplained
reviews_verified: no PR
checks_verified: no PR; dependency-backed suite NOT_RUN
stack_base_pr_verified: PR #484 open, draft, mergeable, unchanged head
```

# APPENDIX A — IMPLEMENTATION TAKEOVER QUALIFICATION

```text
Qualification basis: GE-002
Generated from: ISS-001, RISK-001
Next intended stage: PR_CREATE / RECONCILE
APPENDIX_A_STATUS: CURRENT
```

1. **A1 Production Trace (20):** Trace Seattle through event qualification, age band, existing evidence guard, threshold, and final slot decision.
2. **A2 Failure Isolation (20):** Hold score constant and vary age band, geography, source quality, and independent evidence one at a time.
3. **A3 Authority / Invariant (20):** Explain why the gate changes admission but not score calculation, ordering among admitted candidates, or source classification.
4. **A4 Independent Validation (20):** Exercise every pure decision branch without importing the ranker and separately certify ranker integration.
5. **A5 Minimal Patch (20):** Add one pure module and one call site; do not alter weights, thresholds, classifier, signals, or selection.

# HISTORICAL RECORD — NOT CURRENT AUTHORITY

## Stage Execution Log

- 2026-08-24T22:29:42+04:00 — GE-001 established on PR #484 stack base; implementation not started.
- 2026-08-24T22:34:47+04:00 — implementation, syntax, standalone behavior, and GE-002 stack reconciliation completed.
