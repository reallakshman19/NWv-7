# NW-RANK-GEO-001 — Story Geography Evidence Provenance

# CURRENT RECOVERY STATE — READ FIRST

## 1. Recovery Header

```text
HANDOVER_READINESS: DEGRADED
PR_RECOVERY_STATE: RECOVERABLE
TAKEOVER_AUTHORITY: WRITE_ALLOWED

REPOSITORY: reallaksh19/NWv-7
SOURCE_TASK: User-approved Top Stories/Live/Hybrid repair plan; auto mode Batch 2
PR_OR_WIP: WIP-NW-RANK-GEO-001
BRANCH: agent/nw-rank-geo-001-evidence-provenance

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
HIGHEST_RISK: removing provenance fields could suppress legitimate geography if the story lacks explicit location evidence
LAST_DURABLE_CHECKPOINT: 2026-08-24T22:22:14+04:00

EXACT_NEXT_ACTION: implement a pure geography-evidence scorer that excludes acquisition fields and add focused contamination tests
```

## 2. Handover in 60 Seconds

### What is now true

- Current `main` is grounded at `900daeac937bfd1b21a7fe63495cbe2388f50ecd`.
- `getLocationRelevanceScore()` currently concatenates `section`, `sourceSection`, `region`, and `title`.
- Hybrid normalization uses `section`/`sourceSection` as requested/acquisition lane metadata.
- Therefore a Seattle story acquired through an India lane can receive India relevance despite no India evidence in the story.
- Open PRs #386/#387/#396/#483 do not touch this batch's intended files.

### What is currently being worked on

A bounded scoring-signal correction that separates story geography from acquisition provenance.

### What remains unfinished

Implementation, focused tests, standalone validation, remote reconciliation, PR creation, and dependency-backed repository checks.

### What must not be assumed

- This batch will not decide event materiality or corroboration policy.
- This batch will not change ranking weights or admission thresholds.
- This batch will not change source tiers, workflow producers, generated data, or browser ordering.
- Correcting geography alone is not expected to reject the Seattle example under current thresholds.

## 3. Repository Ground Truth

```text
verified_at: 2026-08-24T22:22:14+04:00
default_branch: main
main_head: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
working_branch: agent/nw-rank-geo-001-evidence-provenance
pr: not yet allocated
merge_base: 900daeac937bfd1b21a7fe63495cbe2388f50ecd
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
| Pure story-geography evidence scorer | UNSTARTED | NOT_RUN | implement |
| Top Stories signal integration | UNSTARTED | NOT_RUN | implement |
| Contamination certification | UNSTARTED | NOT_RUN | implement |
| Full repository checks | UNSTARTED | NOT_RUN | full checkout/dependencies required |

## 6. Active Item Register

| ID | Type | Severity | Status | Summary | Evidence |
|---|---|---|---|---|---|
| ISS-001 | defect | high | OPEN | acquisition provenance is treated as story geography | `section`/`sourceSection` concatenation |
| RISK-001 | risk | medium | OPEN | legitimate local evidence could be lost if explicit fields are incomplete | field-contract uncertainty |
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
Status: NOT_RUN
Observation: NOT_OBSERVED
Oracle: IMPLEMENTATION_COUPLED
```

### VAL-003 — Standalone pure-module validation

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
Reason: implementation not yet complete; full connector-authenticated checkout unavailable
```

## 10. Changed-File Ledger

| File | Intended? | Purpose | Validation |
|---|---:|---|---|
| `reports/NW-RANK-GEO-001_location_evidence.md` | yes | living recovery report | source review |

Actual branch file count after report creation: 1.  
Ledger count: 1.  
Unexplained files: 0.

## 11. Review / CI State

No PR allocated. No review threads. Dependency-backed checks are NOT_RUN. No workflow changes are authorized.

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
Start here: src/services/topStories/topStoriesSignals.js#getLocationRelevanceScore
Do not redo: live-main/open-PR grounding at GE-001 unless main moves
Do not change: weights, thresholds, materiality, corroboration, source tiers, UI, workflows
Validation required: provenance invariance, explicit local/world evidence, standalone syntax/behavior
Exact next action: add pure evidence module, integrate numeric score, add cert
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

# APPENDIX A — IMPLEMENTATION TAKEOVER QUALIFICATION

```text
Qualification basis: GE-001
Generated from: ISS-001, RISK-001
Next intended stage: IMPLEMENT
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
