# NW-CI-SMOKE-001 — Local smoke baseline repair

# CURRENT RECOVERY STATE — READ FIRST

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: HEALTHY
TAKEOVER_AUTHORITY: WRITE_ALLOWED
REPOSITORY: reallaksh19/NWv-7
SOURCE_TASK: Owner continuation after PR #489; repair lint and stale unit baseline locally
PR_OR_WIP: WIP-NW-CI-SMOKE-001
BRANCH: codex/nw-ci-smoke-baseline-001
PR_HEAD_OBSERVED: ed9036494ffbc6d6964af9e2f4a75b56bc34c2d1
REPORT_BASIS_HEAD: ed9036494ffbc6d6964af9e2f4a75b56bc34c2d1
MAIN_HEAD_LAST_CHECKED: ed9036494ffbc6d6964af9e2f4a75b56bc34c2d1
MERGE_BASE: ed9036494ffbc6d6964af9e2f4a75b56bc34c2d1
REPORT_SYNC: CURRENT
APPENDIX_A_STATUS: CURRENT
GROUNDING_EPOCH: GE-001
CURRENT_STAGE: PLAN
CURRENT_BLOCKER: none
HIGHEST_RISK: changing ranking expectations without preserving the merged geography/evidence policy
LAST_DURABLE_CHECKPOINT: branch created from current main
EXACT_NEXT_ACTION: apply the bounded lint and stale-contract repairs, then rerun focused tests
```

## Handover in 60 Seconds

Current `main` is `ed903649...`, the squash merge of Daily Digest PR #488 on top of CI restoration PR #489. The exact 17 target files were verified byte-for-byte against current `main`. Local baseline is 4 lint errors plus 1 warning and 20 failed unit tests. GitHub Actions starts no runner (`runner_id: 0`, no steps), so validation is local.

This batch must not recreate or edit operational workflow files, change Top Stories production policy, change ranking weights/thresholds, or touch `NewsContext.jsx`. It may repair lint, mark missing optional workflow contracts explicitly skipped, and rebase test fixtures onto merged geography PR #484 and evidence PR #485.

## Mission / Scope / Acceptance

- Make `npm run lint` pass without suppressing rules.
- Make local unit execution green; absent retired/disabled workflow contracts must be reported as skipped, not passed.
- Preserve standalone CLI/algorithm tests even when their optional workflow wrapper is absent.
- Reconcile Top Stories fixtures using explicit story geography and corroboration evidence; do not change production ranking code.
- Run `npm run test:certify:smoke` and record exact pass/skip counts.
- Non-goals: workflow restoration, deployment repair, ranking/source architecture work, UI changes, dependency changes.

## Active Item Register

| ID | Type | Status | Summary |
|---|---|---|---|
| ISS-001 | lint | OPEN | Three empty catches and one React callback dependency mismatch |
| ISS-002 | test | OPEN | Eleven workflow-source assertions target files deleted from current main |
| ISS-003 | test | OPEN | MainPage migration assertion predates composite Main + Daily Digest refresh |
| ISS-004 | test | OPEN | Top Stories fixtures predate explicit geography and mature-event evidence gates |
| RISK-001 | overlap | CONTROLLED | PRs #386/#387 are non-mergeable and stale; no exact-file overlap, but ranking validation authority overlaps |
| DEC-001 | scope | ACTIVE | Preserve missing workflow contracts with conditional skips; do not claim them PASS |

## Technical Diagnosis and Falsifiers

- Lint hypothesis: comments in intentionally ignored catches plus destructuring `dailyDigest.refresh` resolve all 5 findings. Falsifier: lint reports any remaining error/warning.
- Workflow hypothesis: only the workflow-dependent assertions are stale; local CLIs and algorithms remain valid. Falsifier: a non-workflow test still fails.
- Ranking hypothesis: fixtures rely on section provenance as geography and omit evidence now required after 4 hours. Falsifier: explicit `region`/independent evidence still produces policy or golden drift.

## Validation Ledger

| ID | Status | Observation | Oracle | Command / actual | Origin |
|---|---|---|---|---|---|
| VAL-001 | PASS | SOURCE_INSPECTION | INDEPENDENT_REPRODUCTION | 17 local target blobs match `main` Git blob SHAs | PREEXISTING |
| VAL-002 | FAIL | LOCAL_EXECUTION | IMPLEMENTATION_COUPLED | `npm run lint`: 4 errors, 1 warning | PREEXISTING |
| VAL-003 | FAIL | LOCAL_EXECUTION | IMPLEMENTATION_COUPLED | `npm run test:unit`: 20 failed, 1305 passed in 226 files | PREEXISTING |
| VAL-004 | PASS | LOCAL_EXECUTION | IMPLEMENTATION_COUPLED | prior `npm run build`: passed | PREEXISTING |
| VAL-005 | PASS | LOCAL_EXECUTION | NONE | prior `npm ci`: 299 packages installed | PREEXISTING |

## Authority / Invariants

- Production ranking authority remains `rankTopStories` plus current policy/admission/location modules.
- `.github/workflows/ci.yml` remains untouched.
- Missing workflow contracts are `NOT_RUN`/skipped, never product PASS.
- Golden values must be derived from frozen fixture inputs and merged policy math, not copied blindly from runtime output.

## Coordination

Open PRs checked: #396, #387, #386. PRs #386/#387 overlap the ranking-validation domain but are non-mergeable, last updated 2026-07-08, and change different exact files. This batch does not modify their claimed `NewsContext.jsx`, ViewModel, or report files. Coordination state: `COORDINATION_REQUIRED_RESOLVED_BY_BOUNDED_SUCCESSOR_SCOPE`.

## Planned Changed Files

- Lint: two Daily Digest adapters and `src/pages/MainPage.jsx`.
- Stale migration/workflow contracts: nine certification files plus the MainPage migration certification.
- Ranking fixture rebase: regression fixture, golden snapshot, evaluator certification, and ranker certification.
- This report.

# APPENDIX A — IMPLEMENTATION TAKEOVER QUALIFICATION

- A1: Trace `test:certify:smoke` to lint, hotfix lint, Vitest, and build; identify which stage currently fails first.
- A2: Reproduce why the 10-hour fallback fixture moved below 0.33 after PR #484 without using the golden snapshot as an oracle.
- A3: Explain why `section=world` is provenance rather than strong geography and name the accepted explicit field used in this repair.
- A4: Show which workflow tests remain executable locally and which exact assertions are skipped when their YAML is absent.
- A5: Propose the smallest next commit that clears remaining failures without modifying workflow or production ranking code.
