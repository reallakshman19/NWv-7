# NW-RANK-GEO-001 — Story Geography Evidence Provenance

# CURRENT RECOVERY STATE — READ FIRST

## 1. Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: RECOVERABLE
TAKEOVER_AUTHORITY: WRITE_ALLOWED

REPOSITORY: reallaksh19/NWv-7
SOURCE_TASK: User-approved Top Stories/Live/Hybrid repair plan; auto mode Batch 2
PR_OR_WIP: PR#484
BRANCH: agent/nw-rank-geo-001-evidence-provenance

PR_HEAD_OBSERVED: e62e09def4de2f0280d3ef7860facc5a805399e6
REPORT_BASIS_HEAD: e779c49540885ef5c6c5db79aa1849980b4b9e92
MAIN_HEAD_LAST_CHECKED: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
MERGE_BASE: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
REPORT_SYNC: CURRENT

APPENDIX_A_STATUS: CURRENT
GROUNDING_EPOCH: GE-003
CURRENT_TAKEOVER: NOT_APPLICABLE

CURRENT_STAGE: HANDOVER_READY
LAST_COMPLETED_STAGE: PR_RECONCILIATION
CURRENT_BLOCKER: none
HIGHEST_RISK: dependency-backed repository checks are unavailable in the connector-only checkout
LAST_DURABLE_CHECKPOINT: 2026-08-24T22:27:24+04:00

EXACT_NEXT_ACTION: run dependency-backed repository checks when a full checkout is available; keep PR #484 draft and unmerged meanwhile
```

## 2. Handover in 60 Seconds

### What is now true

- Current `main` is grounded at `900daeac937bfd1b21a7fe63495cbe2388f50ecd`.
- Grounded `main` concatenates `section`, `sourceSection`, `region`, and `title`; this branch replaces that authority with story-only evidence.
- Hybrid normalization uses `section`/`sourceSection` as requested/acquisition lane metadata.
- Therefore a Seattle story acquired through an India lane can receive India relevance despite no India evidence in the story.
- Open PRs #386/#387/#396/#483 do not touch this batch's intended files.

### What is currently being worked on

The implementation and focused certification are complete; draft PR allocation and reconciliation are next.

### What remains unfinished

Dependency-backed repository checks, owner review, and explicit user authorization before any merge.

### What must not be assumed

- This batch will not decide event materiality or corroboration policy.
- This batch will not change ranking weights or admission thresholds.
- This batch will not change source tiers, workflow producers, generated data, or browser ordering.
- Correcting geography alone is not expected to reject the Seattle example under current thresholds.

## 3. Repository Ground Truth

```text
verified_at: 2026-08-24T22:27:24+04:00
default_branch: main
main_head: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
working_branch: agent/nw-rank-geo-001-evidence-provenance
pr: 484 (open, draft, mergeable)
merge_base: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
branch_head_observed: e62e09def4de2f0280d3ef7860facc5a805399e6
ahead_by: 5
behind_by: 0
open_prs_checked: 386, 387, 396, 483
coordination_state: SAFE
```

## 4. Mission / Scope / Acceptance

### Mission

Ensure Top Stories location relevance is derived from story evidence, not the feed or section through which the story was acquired.

### Approved scope

- `src/services/topStories/topStoriesSignals.js`;
- one focused pure geography-signal module;
- one focused certification test;
- this living report.

### Explicit non-goals

- no ranker weights/thresholds;
- no event classifier/materiality;
- no corroboration policy;
- no source-quality registry;
- no UI/explainability surface;
- no workflows/generated data/dependencies.

### Acceptance criteria

1. `section=india` or `sourceSection=india` alone cannot produce India relevance.
2. Explicit India/Oman evidence in story fields retains local relevance `0.82`.
3. Explicit world/international evidence retains world relevance `0.66`.
4. A Seattle story with India acquisition metadata falls to generic relevance `0.42` unless separate world evidence exists.
5. Both provenance fields may vary without changing an otherwise identical story's score.
6. Existing exported `getLocationRelevanceScore()` contract remains numeric.
7. No unrelated files change.

## 5. Current Implementation State

| Work item | Implementation | Validation | Remaining |
|---|---|---|---|
| Pure story-geography evidence scorer | COMPLETE | syntax + standalone PASS | repository suite |
| Top Stories signal integration | COMPLETE | syntax + exact remote match PASS | repository suite |
| Contamination certification | COMPLETE | syntax PASS; runner NOT_RUN | run Vitest |
| Full repository checks | NOT_RUN | NOT_RUN | full checkout/dependencies required |

## 6. Active Item Register

| ID | Type | Severity | Status | Summary | Evidence |
|---|---|---|---|---|---|
| ISS-001 | defect | high | RESOLVED | acquisition provenance was treated as story geography | pure evidence authority |
| RISK-001 | risk | medium | MITIGATED | legitimate local evidence could be lost if explicit fields are incomplete | explicit region/country/code/city/location/title/summary fields retained |
| DEC-001 | decision | medium | ACCEPTED | preserve numeric scores; change evidence authority only | bounded compatibility |
| DEC-002 | decision | medium | ACCEPTED | UI evidence display is a later work pack | scope boundary |

## 7. Technical Diagnosis

```text
Current authority: section + sourceSection + region + title
Defect: section/sourceSection represent acquisition/routing provenance in Hybrid normalization
Required authority: region/country/city/location entities plus story headline/summary text
Falsifier: changing only sourceSection from world to india does not change the current score
Expected current observation: score changes to 0.82 when sourceSection contains india
Expected patched observation: score remains based on story evidence
```

## 8. Authority and Invariants

```text
strong geography evidence: region, country, countryCode, city, location, locations, title/headline, summary/description
excluded provenance: section, sourceSection, acquisition feed, publisher edition
consumer: Top Stories weighted score
UI/publication: unchanged
```

Invariants:

- return values remain `0.82`, `0.66`, or `0.42`;
- no ranking weight or normalization denominator changes;
- acquisition metadata remains available to its existing consumers;
- only geography evidence authority changes.

## 9. Current Validation

### VAL-001 — Production source trace

```text
Status: PASS
Observation: SOURCE_INSPECTION
Oracle: NONE
Tested HEAD: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
Evidence: topStoriesSignals.getLocationRelevanceScore concatenates section/sourceSection/region/title
Origin: PREEXISTING
```

### VAL-002 — Focused contamination test

```text
Status: PASS (syntax/source review); Vitest runner NOT_RUN
Observation: STATIC_AND_STANDALONE_EQUIVALENT
Oracle: IMPLEMENTATION_COUPLED
Cases: Seattle/India lane; provenance invariance; explicit India/Oman/country-code/location; explicit international evidence
```

### VAL-003 — Standalone pure-module validation

```text
Status: PASS
Observation: EXECUTED
Oracle: INDEPENDENT
Tested content: exact pure module published at e779c49540885ef5c6c5db79aa1849980b4b9e92
Actual: Top Stories geography evidence provenance: PASS
```

### VAL-004 — Repository Vitest/lint/build/full certification

```text
Status: NOT_RUN
Observation: NOT_OBSERVED
Oracle: NONE
Reason: full connector-authenticated checkout/dependency environment unavailable; current main has no Actions workflows
```

### VAL-005 — Remote reconciliation

```text
Status: PASS
Observation: CONNECTOR_COMPARE
Oracle: INDEPENDENT
Base: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
Head: e779c49540885ef5c6c5db79aa1849980b4b9e92
Result: ahead 4, behind 0; four intended files; all three source/test files match validated local contents exactly
```

## 10. Changed-File Ledger

| File | Intended? | Purpose | Validation |
|---|---:|---|---|
| `reports/NW-RANK-GEO-001_location_evidence.md` | yes | living recovery report | source review |
| `src/services/topStories/topStoriesSignals.js` | yes | delegate numeric geography score to pure evidence authority | syntax + exact remote match |
| `src/services/topStories/topStoriesLocationSignals.js` | yes | story-only geography evidence scorer | syntax + standalone behavior + exact remote match |
| `src/services/topStories/topStoriesLocationSignals.cert.test.js` | yes | provenance contamination certification | syntax + source review + exact remote match |

Actual branch file count: 4.  
Ledger count: 4.  
Unexplained files: 0.

## 11. Review / CI State

PR #484 is open, draft, and mergeable. It has four intended changed files, no reviews, comments, review threads, or reported commit statuses. Dependency-backed checks are NOT_RUN, not passed. No workflow changes are authorized.

## 12. Repository Coordination / Overlap

```text
MASTER_INDEX_CHECKED: not present
STATUS_RECORD: this living report
CLAIM_RECORD: report scope declaration
LAST_OVERLAP_CHECK: 2026-08-24T22:22:14+04:00
FILE_OVERLAP: none with open PRs #386/#387/#396/#483
AUTHORITY_OVERLAP: none; PR #483 changes Hybrid request concurrency, not rank signals
DEPENDENCY_OVERLAP: none
COORDINATION_STATE: SAFE
```

## 13. Continuation State

```text
Start here: PR #484 and this report
Do not redo: live-main/open-PR grounding at GE-001 unless main moves
Do not change: weights, thresholds, materiality, corroboration, source tiers, UI, workflows
Validation still required: repository Vitest/lint/build/full certification when available
Exact next action: run repository Vitest/lint/build/full certification when an authenticated checkout with dependencies is available
Merge authority: NOT_GRANTED
```

## 14. Grounding / Custody Chain

### GE-001

```text
verified_at: 2026-08-24T22:22:14+04:00
BRANCH_HEAD: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
MAIN_HEAD: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
MERGE_BASE: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
changed_files_verified: 0 before report creation
reviews_verified: no PR
checks_verified: no PR
claims_verified: open PR changed-file inspection
```

### GE-002

```text
verified_at: 2026-08-24T22:25:43+04:00
BRANCH_HEAD: e779c49540885ef5c6c5db79aa1849980b4b9e92
MAIN_HEAD: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
MERGE_BASE: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
changed_files_verified: 4 intended, 0 unexplained
reviews_verified: no PR
checks_verified: no PR; dependency-backed suite NOT_RUN
claims_verified: no overlapping file claims in open PRs checked
```

### GE-003

```text
verified_at: 2026-08-24T22:27:24+04:00
PR: 484 (open, draft, mergeable)
PR_HEAD_OBSERVED: e62e09def4de2f0280d3ef7860facc5a805399e6
MAIN_HEAD: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
MERGE_BASE: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
changed_files_verified: 4 intended, 0 unexplained
reviews_verified: 0
threads_verified: 0
comments_verified: 0
checks_verified: 0 reported statuses; dependency-backed suite NOT_RUN
result: handover-ready draft; merge authority not granted
```

# APPENDIX A — IMPLEMENTATION TAKEOVER QUALIFICATION

```text
Qualification basis: GE-003
Generated from: ISS-001, RISK-001
Next intended stage: DEPENDENCY_BACKED_VALIDATE / OWNER_REVIEW
APPENDIX_A_STATUS: CURRENT
```

1. **A1 Production Trace (20):** Trace `section` and `sourceSection` from Hybrid normalization into `getLocationRelevanceScore()` and distinguish routing metadata from story geography.
2. **A2 Failure Isolation (20):** Construct two identical Seattle stories differing only in acquisition section and predict current versus patched scores.
3. **A3 Authority / Invariant (20):** Define which fields may authoritatively establish story geography while preserving the existing numeric score contract.
4. **A4 Independent Validation (20):** Test the pure geography module without importing the rest of the ranker dependency graph.
5. **A5 Minimal Patch (20):** Limit changes to one pure module, one import/delegation point, one cert, and this report.

# HISTORICAL RECORD — NOT CURRENT AUTHORITY

## Stage Execution Log

- 2026-08-24T22:22:14+04:00 — GE-001 established; Batch 2 scope classified SAFE; implementation not started.
- 2026-08-24T22:25:43+04:00 — implementation, syntax, standalone behavior, and GE-002 remote reconciliation completed.
- 2026-08-24T22:27:24+04:00 — Draft PR #484 allocated and reconciled; GE-003 handover state recorded.
