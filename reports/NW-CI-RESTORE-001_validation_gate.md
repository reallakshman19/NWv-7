# NW-CI-RESTORE-001 — Non-Deploying Validation Gate

# CURRENT RECOVERY STATE — READ FIRST

## 1. Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: HEALTHY
TAKEOVER_AUTHORITY: WRITE_ALLOWED

REPOSITORY: reallaksh19/NWv-7
SOURCE_TASK: Continue the approved Top Stories/Live/Hybrid remediation plan; restore CI before further production batches
PR_OR_WIP: PR#489
BRANCH: agent/nw-ci-restore-001-validation-gate

PR_HEAD_OBSERVED: 127bae7b83842b0477ed195707686b45881eaaef
REPORT_BASIS_HEAD: 127bae7b83842b0477ed195707686b45881eaaef
MAIN_HEAD_LAST_CHECKED: a498f256c309e8a3f40f5afd9065c369c8e5f38f
MERGE_BASE: a498f256c309e8a3f40f5afd9065c369c8e5f38f
REPORT_SYNC: CURRENT

APPENDIX_A_STATUS: NOT_REQUIRED
GROUNDING_EPOCH: GE-004
CURRENT_TAKEOVER: NOT_APPLICABLE

CURRENT_STAGE: CLOSURE
LAST_COMPLETED_STAGE: LOCAL_VALIDATION
CURRENT_BLOCKER: none for the explicitly authorized merge; repository baseline lint/unit failures are recorded as successor work
HIGHEST_RISK: treating the merged validation gate as green despite the known pre-existing lint and unit failures
LAST_DURABLE_CHECKPOINT: 2026-08-25T12:53:26+04:00

EXACT_NEXT_ACTION: persist this report-only closure checkpoint, re-reconcile the expected head, and squash-merge PR #489 as explicitly authorized
```

## 2. Handover in 60 Seconds

### What is now true

- Live `main` is `a498f256c309e8a3f40f5afd9065c369c8e5f38f`, after Daily Digest PR #487.
- The repository currently has no `.github` directory and no Actions workflows.
- Historical `.github/workflows/ci.yml` was deleted by commit `2eab2ee92a16eba4bdcd08a238c9086c87ae46f4` on 2026-07-21.
- The historical CI ran lint, build, a benchmark, Up Ahead smoke, and a market snapshot test, but did not run the current unit suite.
- The current manifest-driven smoke profile runs lint, the lint guard, `test:unit`, and build.
- The user explicitly authorized the previously flagged workflow-restoration prerequisite by replying “ok continue”.
- The user subsequently instructed “merge” and explicitly substituted local validation because GitHub Actions is unavailable.
- Draft PR #489 exists with exactly the workflow and this report.
- Pull-request runs #32805217206 and #32805755305 both failed before a runner or workflow step started.
- Local validation was executed against PR head `127bae7b83842b0477ed195707686b45881eaaef`.

### What is currently being worked on

The bounded workflow and local validation record are complete. The PR is in closure under explicit owner merge authorization.

### What remains unfinished

Only the report-only closure commit, expected-head reconciliation, squash merge, and post-merge main verification remain.

### What has been proven

- No active PR changes `.github/workflows/ci.yml` or this report.
- PR #488 changes three Daily Digest scripts plus its report; PR #396 is report-only; PRs #386/#387 change ranking/view-model files and reports.
- `scripts/certification_manifest.json` defines `smoke` as lint, unit, and build, with the additional lint guard.
- At the observed head, the PR diff is exactly the 63-line workflow plus this report, ahead 4 and behind 0.
- Independent local assertions parsed the YAML and rejected forbidden write/deploy/secret/schedule capabilities.
- The remote workflow content exactly matches the locally validated content.
- GitHub parsed the workflow, registered `CI Validation Gate`, and created job `Lint, unit tests, and build`.
- Jobs #97673908934 and #97675421019 completed as failure with `runner_id: 0`, no runner name, and no step records; their log and artifact collections are empty.
- The exact tracked path set was materialized locally: 1,434 expected and 1,434 present. The text-only transfer preserved 1,231 blobs byte-for-byte, normalized line endings/final newlines in 202 files, and decoded one non-executable UTF-16 `.bak` file.
- `npm ci` passed and installed 299 lockfile-resolved packages.
- The lint-hotfix guard and production build passed; Vite transformed 371 modules and completed the build in 3.09 seconds.

### What has NOT been proven / NOT_RUN

- The overall smoke profile is not green: lint failed with 4 errors and 1 warning, and the unit suite failed 20 of 1,325 tests across 15 of 226 test files; 1,305 tests and 211 test files passed.
- The exact text of GitHub's single check annotation and therefore the exact repository/account no-start cause are not observable through the connected API.
- Branch protection could not be read (`403 Resource not accessible by integration`).

### What must not be assumed

- This work does not restore deployment, data generation, scheduled refresh, Pages publication, or snapshot workflows.
- This work does not switch Live/Hybrid runtime behavior.
- The local lint/unit failures are not introduced by PR #489: none of their source/test paths is in the two-file PR diff.
- This merge does not assert a green product baseline; it installs the truthful validation control plane and preserves the failures for successor remediation.

### Highest-risk remaining item

The successor must repair the known baseline instead of weakening the manifest, excluding failing tests, or relabeling the local failures as PASS.

### Exact next action

Persist this closure record, verify the PR still has exactly two files and no base drift, then squash-merge with expected head protection.

## 3. Repository Ground Truth

```text
verified_at: 2026-08-25T12:53:26+04:00
default_branch: main
main_head: a498f256c309e8a3f40f5afd9065c369c8e5f38f
working_branch: agent/nw-ci-restore-001-validation-gate
branch_head: 127bae7b83842b0477ed195707686b45881eaaef
pr: #489, open draft, mergeable=true at last observation
current_workflows: none on main; PR adds only `.github/workflows/ci.yml`
main_status_contexts: 0
main_pull_request_workflow_runs: 0
open_prs_checked: 488, 396, 387, 386
coordination_state: SAFE
compare_to_main: ahead 4, behind 0, two intended files
workflow_runs: #32805217206 and #32805755305 completed/failure before runner assignment
local_validation: npm ci PASS; lint FAIL; lint-hotfix PASS; unit FAIL; build PASS
owner_decision: merge explicitly authorized with local validation substituted for unavailable Actions
```

## 4. Mission / Scope / Acceptance

### Mission

Restore a trustworthy, non-deploying pull-request/main validation gate before additional ranking production changes.

### Approved scope

- `.github/workflows/ci.yml`;
- this living report.

### Explicit non-goals

- no deploy or Pages workflow;
- no snapshot/data producer or scheduled refresh;
- no secrets, write token, OIDC, environments, or external deployment credentials;
- no source, ranking, fallback, browser, UI, dependency, lockfile, or generated-data changes;
- no runtime switch;
- no merge without a separate explicit instruction.

### Acceptance criteria

1. Run on pull requests to `main`, pushes to `main`, and manual dispatch.
2. Grant only `contents: read` to `GITHUB_TOKEN`.
3. Do not persist checkout credentials.
4. Use Node 22 and deterministic `npm ci` with the root lockfile.
5. Reject `.rej` and `.orig` artifacts.
6. Execute the current manifest authority through `npm run test:certify:smoke`.
7. Preserve a failure log without requiring write/deploy permissions.
8. Contain no secret, publish, deploy, cron, D1, Cloudflare, Pages, or snapshot steps.
9. PR changed-file list contains exactly the workflow and this report.

## 5. Current Implementation State

| Work item | Implementation | Integration | Validation | Location | Remaining |
|---|---|---|---|---|---|
| Validation workflow | COMPLETE | branch content exact | static PASS; local gate truthfully exposes baseline FAIL | `.github/workflows/ci.yml` | merge, then repair baseline in successor work |
| Living report | CURRENT | PR #489 closure checkpoint | source review + local validation + reconciliation complete | this file | report-only sync and merge |

## 6. Active Engineering Item Register

| ID | Type | Severity | Priority | Status | Summary | Evidence | Current PR? |
|---|---|---|---|---|---|---|---|
| ISS-001 | defect | high | P0 | RESOLVED_BY_PR | repository main has no executable CI gate; branch restores one | `.github` absent on main; branch workflow exact | yes |
| ISS-002 | blocker | high | P0 | DISPOSITIONED | GitHub creates validation jobs but fails before runner assignment | two reproduced no-start runs; owner substituted local validation | yes |
| ISS-003 | defect | high | P0 | OPEN_SUCCESSOR | current baseline fails lint and unit validation | local smoke at `127bae7b…`; 4 lint errors; 20 unit failures | no |
| RISK-001 | risk | high | P0 | REALIZED | current product suite exposes accumulated failures | local smoke results | no |
| RISK-002 | risk | high | P0 | MITIGATING | workflow restoration could accidentally restore deployment authority | bounded read-only workflow scope | yes |
| DEC-001 | decision | medium | P0 | ACCEPTED | use current manifest smoke profile instead of stale 2026-07 command list | package scripts + certification manifest | yes |
| DEC-002 | decision | high | P0 | ACCEPTED | merge after local validation despite known pre-existing red baseline | explicit owner instruction: “merge”; local validation substitute explicitly requested | yes |

## 7. Current Technical Diagnosis

```text
Observed symptom: GitHub Actions cannot assign a runner, while exact-head local execution exposes 4 lint errors and 20 unit-test failures; build still passes.
Current hypothesis: the remote no-start and the product baseline failures are independent pre-existing conditions; PR #489 correctly exposes rather than causes them.
Supporting evidence: two remote jobs have runner_id 0/steps null; the PR diff contains only the workflow and report; local failures occur in unchanged product/test/workflow-expectation paths.
Alternative hypotheses: PR workflow content causes the lint/unit failures, or local source transport removed executable content.
Already ruled out: failing paths are outside the PR diff; all 1,434 tracked paths are present locally; 1,231 blobs are byte-exact and remaining executable files differ only by line-ending/final-newline normalization.
Falsifier: a clean current-main run without PR files passes these same lint/unit cases, which would require reclassifying origin.
Next isolating experiment: successor baseline-remediation PR reproduces failures from merged main, repairs the first failing boundary without weakening the gate, and reruns the unchanged smoke profile.
```

## 8. Authority and Invariants

```text
command authority: package.json -> scripts/certification_manifest.json -> run_certification_gate.mjs
dependency authority: package-lock.json -> npm ci
workflow authority: .github/workflows/ci.yml
runtime/deployment authority: unchanged and out of scope
```

Negative assurance:

- intentionally changed: availability of read-only validation on PR/main/manual events;
- unchanged: application/runtime behavior, ranking, data generation, deployment, secrets, Pages, Cloudflare, schedules, and dependencies.

## 9. Current Validation

### VAL-001 — Live repository and deletion-history trace

```text
Status: PASS
Observation: SOURCE_INSPECTION
Oracle: INDEPENDENT_REPRODUCTION
Tested HEAD: a498f256c309e8a3f40f5afd9065c369c8e5f38f
Evidence: live GitHub contents/status/workflow-run queries plus deletion commit patches
Expected: no current workflow; historical CI content recoverable
Actual: `.github` absent; ci.yml deletion content recovered
Limitations: branch protection endpoint returned 403
Origin: PREEXISTING
```

### VAL-002 — Current command authority trace

```text
Status: PASS
Observation: SOURCE_INSPECTION
Oracle: INDEPENDENT_REPRODUCTION
Tested HEAD: a498f256c309e8a3f40f5afd9065c369c8e5f38f
Evidence: package.json, scripts/run_certification_gate.mjs, scripts/certification_manifest.json
Expected: smoke profile includes lint, unit, and build through manifest execution
Actual: lint, lint-hotfix, unit, build entries require smoke; runner filters and executes them
Limitations: commands not yet executed
Execution disposition: see VAL-007 and VAL-008
Origin: PREEXISTING
```

### VAL-003 — Static workflow and security contract

```text
Status: PASS
Observation: LOCAL_EXECUTION
Oracle: INDEPENDENT_REPRODUCTION
Tested HEAD/content: exact `.github/workflows/ci.yml` blob `7dd9a275f6aec0913c0d6ac84adc89f8c09e8a04`
Command/evidence: PyYAML BaseLoader structural assertions plus forbidden-capability scan
Expected: three bounded triggers; contents read; checkout/setup-node/artifact actions; npm ci; smoke profile; no write/secrets/deploy/schedule
Actual: all assertions passed; 63 workflow lines
Limitations: this does not emulate GitHub's runner
Origin: RESOLVED_BY_PR
```

### VAL-004 — Remote branch reconciliation

```text
Status: PASS
Observation: SOURCE_INSPECTION
Oracle: INDEPENDENT_REPRODUCTION
Tested HEAD: 127bae7b83842b0477ed195707686b45881eaaef
Evidence: exact local/remote content comparison and GitHub compare
Expected: workflow content exact; two intended files; behind 0
Actual: exact match; ahead 4, behind 0; workflow + report only
Limitations: report-only checkpoint commit follows this observed head
Origin: RESOLVED_BY_PR
```

### VAL-005 — Workflow execution

```text
Status: FAIL
Observation: REMOTE_EXECUTION
Oracle: NONE
Tested HEADs: fae5105c07d8c91bb5745463e50d17d2950879fe and 127bae7b83842b0477ed195707686b45881eaaef
Evidence: runs #32805217206/#32805755305 and jobs #97673908934/#97675421019
Expected: an Ubuntu runner is assigned and the checkout, install, and smoke steps execute
Actual: completed/failure before runner assignment; runner_id 0; runner name empty; steps null; no logs or artifacts
Limitations: one check annotation exists but its text is inaccessible through the connector; exact account/repository cause remains unclassified
Product result: NOT_RUN remotely; executed locally in VAL-008
Origin: UNCLASSIFIED_PRE_RUN_CONTROL
```

### VAL-006 — Exact-head local source materialization

```text
Status: PASS
Observation: LOCAL_EXECUTION
Oracle: INDEPENDENT_REPRODUCTION
Tested HEAD: 127bae7b83842b0477ed195707686b45881eaaef
Command/evidence: recursive Git tree plus local tracked-path and git hash-object reconciliation
Expected: all 1,434 tracked paths present with no extra source paths
Actual: 1,434 expected, 1,434 present, 0 missing, 0 extra; 1,231 byte-exact; 202 text files transport-normalized only; one non-executable UTF-16 `.bak` decoded
Limitations: connector/apply-patch text transport normalizes CRLF/final newlines and cannot preserve the UTF-16 backup byte-for-byte
Origin: RESOLVED_BY_PR
```

### VAL-007 — Deterministic dependency installation

```text
Status: PASS
Observation: LOCAL_EXECUTION
Oracle: IMPLEMENTATION_COUPLED
Tested HEAD: 127bae7b83842b0477ed195707686b45881eaaef
Command/evidence: npm --cache /tmp/nwv7-npm-cache ci
Expected: package-lock resolves and installs without mutation
Actual: exit 0; 299 packages installed in 10 seconds
Limitations: two upstream deprecation warnings; no dependency or lockfile change in PR
Origin: PREEXISTING
```

### VAL-008 — Local smoke certification

```text
Status: FAIL
Observation: LOCAL_EXECUTION
Oracle: IMPLEMENTATION_COUPLED
Tested HEAD: 127bae7b83842b0477ed195707686b45881eaaef
Command/evidence: npm run test:certify:smoke, followed by independent execution of the remaining manifest commands after fail-fast lint
Expected: lint, lint-hotfix, unit, and build all exit 0
Actual: lint FAIL (4 errors, 1 warning); lint-hotfix PASS; unit FAIL (15/226 files, 20/1325 tests; 211 files and 1305 tests PASS); build PASS (371 modules, 3.09 seconds)
Limitations: smoke is knowingly red; remote runner remains unavailable
Origin: PREEXISTING relative to PR #489 because no failing product/test path is changed by the two-file PR
```

## 10. Changed-File Ledger

| File | Intended? | First stage | Latest stage | Purpose | Sensitive? | Validation |
|---|---:|---|---|---|---:|---|
| `.github/workflows/ci.yml` | yes | IMPLEMENT | CLOSURE | read-only validation control plane | yes | static/security PASS; local execution exposes pre-existing baseline FAIL |
| `reports/NW-CI-RESTORE-001_validation_gate.md` | yes | BASELINE | CLOSURE | continuous recovery authority | no | source review + local validation + reconciliation complete |

Current branch file count: 2. Ledger count: 2. Unexplained files: 0. Reconciled at `127bae7b83842b0477ed195707686b45881eaaef` before this report-only closure checkpoint.

## 11. Review / CI State

PR #489 is an open draft and mergeable with no reviews, review threads, or comments at the last observation. Two `CI Validation Gate` runs fail before runner assignment. Local validation is fully dispositioned: install/build/lint-hotfix PASS; lint/unit FAIL with pre-existing origin. The owner explicitly authorized merge after requesting local validation in place of unavailable Actions.

## 12. Repository Coordination / Overlap

```text
MASTER_INDEX_CHECKED: not present
STATUS_RECORD: this report
CLAIM_RECORD: report scope declaration
LAST_OVERLAP_CHECK: 2026-08-25T12:53:26+04:00
FILE_OVERLAP: none with open PRs #488/#396/#387/#386
AUTHORITY_OVERLAP: none; this work validates but does not alter their domains
DEPENDENCY_OVERLAP: soft dependency on current package/manifest commands
COORDINATION_STATE: SAFE
```

## 13. Continuation State

```text
Start here: draft PR #489, branch agent/nw-ci-restore-001-validation-gate, observed head 127bae7b83842b0477ed195707686b45881eaaef
Exact file: `.github/workflows/ci.yml`
Current value/path under investigation: closure/merge of the restored validation control plane
Do not redo: workflow deletion history or manifest trace unless main/package scripts move
Do not change: production code, dependencies, deploy/data workflows, runtime, secrets
Validation still required: none for PR #489 closure; baseline lint/unit repair remains successor work
Highest-risk remaining item: forgetting that the merged gate is expected to report a red baseline until successor remediation
Exact next action: expected-head guarded squash merge, then verify main and PR terminal state
```

## 14. Takeover / Custody Chain

### GE-001

```text
verified_at: 2026-08-25T07:23:17+04:00
PR_HEAD: not allocated
MAIN_HEAD: a498f256c309e8a3f40f5afd9065c369c8e5f38f
MERGE_BASE: a498f256c309e8a3f40f5afd9065c369c8e5f38f
changed_files_verified: 0 current / 2 planned
reviews_verified: no PR
checks_verified: main has 0 statuses and 0 PR workflow runs
claims_verified: open PR exact-file comparison
result: SAFE; WRITE_ALLOWED
```

### GE-002

```text
verified_at: 2026-08-25T07:26:20+04:00
PR_HEAD: 2b56700082109fc376b98d78c8bc4958dd94ebaa
MAIN_HEAD: a498f256c309e8a3f40f5afd9065c369c8e5f38f
MERGE_BASE: a498f256c309e8a3f40f5afd9065c369c8e5f38f
changed_files_verified: 2 intended, 0 unexplained
reviews_verified: no PR
checks_verified: 0 statuses before PR allocation
claims_verified: no active PR file overlap
result: implementation complete; local static/security and remote-content reconciliation PASS; Actions NOT_RUN
```

### GE-003

```text
verified_at: 2026-08-25T07:32:51+04:00
PR_HEAD: fae5105c07d8c91bb5745463e50d17d2950879fe
MAIN_HEAD: a498f256c309e8a3f40f5afd9065c369c8e5f38f
MERGE_BASE: a498f256c309e8a3f40f5afd9065c369c8e5f38f
changed_files_verified: 2 intended, 0 unexplained
reviews_verified: 0 reviews, 0 threads, 0 comments
checks_verified: run #32805217206 failure; job #97673908934 runner_id=0, steps=null, no logs/artifacts
claims_verified: workflow static contract PASS; product lint/unit/build NOT_RUN
result: RECOVERABLE but BLOCKED on an unclassified GitHub Actions pre-run control; do not merge or weaken gate
```

### GE-004

```text
verified_at: 2026-08-25T12:53:26+04:00
PR_HEAD: 127bae7b83842b0477ed195707686b45881eaaef
MAIN_HEAD: a498f256c309e8a3f40f5afd9065c369c8e5f38f
MERGE_BASE: a498f256c309e8a3f40f5afd9065c369c8e5f38f
changed_files_verified: 2 intended, 0 unexplained, ahead 4, behind 0
reviews_verified: 0 reviews, 0 threads, 0 comments
checks_verified: two remote pre-run failures; local install/build/lint-hotfix PASS; lint/unit FAIL with pre-existing origin
claims_verified: workflow static/security contract PASS; owner explicitly authorized merge with local validation substitute
result: READY for expected-head guarded squash merge; known red baseline preserved as ISS-003 successor work
```

# APPENDIX A — IMPLEMENTATION TAKEOVER QUALIFICATION

```text
Qualification basis: GE-004
PR_HEAD: 127bae7b83842b0477ed195707686b45881eaaef
MAIN_HEAD: a498f256c309e8a3f40f5afd9065c369c8e5f38f
Generated from: no open technical implementation in PR #489; ISS-003 is successor scope
PARTIAL implementation: none; workflow content complete
NOT_RUN validation: none locally; remote execution unavailable and explicitly substituted by owner
Next intended stage: CLOSURE / MERGE
APPENDIX_A_STATUS: NOT_REQUIRED
```

1. **A1 Production Trace (20):** Trace a pull-request commit through checkout, lockfile install, manifest profile selection, lint, unit tests, build, job conclusion, and GitHub check presentation.
2. **A2 Current Failure Isolation (20):** Distinguish workflow syntax/no-start, dependency-install failure, and product test failure; identify the evidence and next action for each.
3. **A3 Authority / Invariant (20):** Prove the workflow cannot deploy or publish and identify every token permission and credential path.
4. **A4 Independent Validation (20):** Validate YAML structure and prohibited-capability absence independently of a successful Actions run.
5. **A5 Next-Commit / Minimal Patch (20):** Name the exact two files, current main SHA, trigger set, command authority, and stop conditions for the next commit.

# HISTORICAL RECORD — NOT CURRENT AUTHORITY

## Stage Execution Log

- 2026-08-25T07:23:17+04:00 — GE-001 established; no workflows present; historical CI and current smoke-manifest authority traced; scope classified SAFE.
- 2026-08-25T07:26:20+04:00 — branch created; baseline report and read-only workflow persisted; local static/security contract and exact remote reconciliation passed at GE-002.
- 2026-08-25T07:32:51+04:00 — draft PR #489 and run #32805217206 observed; job failed before runner/steps; exact annotation inaccessible; product commands classified NOT_RUN at GE-003.
- 2026-08-25T12:53:26+04:00 — exact-head local tree materialized; npm ci and build/lint-hotfix passed; lint and unit baseline failures recorded without weakening; owner merge authorization reconciled at GE-004.
