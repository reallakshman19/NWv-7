# NW-CI-RESTORE-001 — Non-Deploying Validation Gate

# CURRENT RECOVERY STATE — READ FIRST

## 1. Recovery Header

```text
HANDOVER_READINESS: NOT_READY
PR_RECOVERY_STATE: HEALTHY
TAKEOVER_AUTHORITY: WRITE_ALLOWED

REPOSITORY: reallaksh19/NWv-7
SOURCE_TASK: Continue the approved Top Stories/Live/Hybrid remediation plan; restore CI before further production batches
PR_OR_WIP: WIP-NW-CI-RESTORE-001
BRANCH: agent/nw-ci-restore-001-validation-gate

PR_HEAD_OBSERVED: NOT_ALLOCATED
REPORT_BASIS_HEAD: a498f256c309e8a3f40f5afd9065c369c8e5f38f
MAIN_HEAD_LAST_CHECKED: a498f256c309e8a3f40f5afd9065c369c8e5f38f
MERGE_BASE: a498f256c309e8a3f40f5afd9065c369c8e5f38f
REPORT_SYNC: CURRENT

APPENDIX_A_STATUS: CURRENT
GROUNDING_EPOCH: GE-001
CURRENT_TAKEOVER: NOT_APPLICABLE

CURRENT_STAGE: PLAN
LAST_COMPLETED_STAGE: BASELINE
CURRENT_BLOCKER: none
HIGHEST_RISK: restoring a stale or privileged workflow could accidentally deploy, publish, or conceal current product failures
LAST_DURABLE_CHECKPOINT: 2026-08-25T07:23:17+04:00

EXACT_NEXT_ACTION: create the branch, persist this report, then add only the bounded read-only CI workflow
```

## 2. Handover in 60 Seconds

### What is now true

- Live `main` is `a498f256c309e8a3f40f5afd9065c369c8e5f38f`, after Daily Digest PR #487.
- The repository currently has no `.github` directory and no Actions workflows.
- Historical `.github/workflows/ci.yml` was deleted by commit `2eab2ee92a16eba4bdcd08a238c9086c87ae46f4` on 2026-07-21.
- The historical CI ran lint, build, a benchmark, Up Ahead smoke, and a market snapshot test, but did not run the current unit suite.
- The current manifest-driven smoke profile runs lint, the lint guard, `test:unit`, and build.
- The user explicitly authorized the previously flagged workflow-restoration prerequisite by replying “ok continue”.

### What is currently being worked on

One non-deploying validation workflow that invokes the current smoke certification profile.

### What remains unfinished

Workflow implementation, static validation, remote PR execution, PR reconciliation, and owner merge authorization.

### What has been proven

- No active PR changes `.github/workflows/ci.yml` or this report.
- PR #488 changes three Daily Digest scripts plus its report; PR #396 is report-only; PRs #386/#387 change ranking/view-model files and reports.
- `scripts/certification_manifest.json` defines `smoke` as lint, unit, and build, with the additional lint guard.

### What has NOT been proven / NOT_RUN

- The smoke profile has not run on current `main`.
- GitHub Actions execution has not started because no workflow exists yet.
- Branch protection could not be read (`403 Resource not accessible by integration`).

### What must not be assumed

- This work does not restore deployment, data generation, scheduled refresh, Pages publication, or snapshot workflows.
- This work does not switch Live/Hybrid runtime behavior.
- A workflow start is not a product PASS; only its completed result can be classified.

### Highest-risk remaining item

Current source may fail lint/unit/build after the long no-CI interval. Such failures must be reported, not weakened or hidden.

### Exact next action

Persist this baseline report on a new branch, then create `.github/workflows/ci.yml` with read-only permissions and no secrets or deployment steps.

## 3. Repository Ground Truth

```text
verified_at: 2026-08-25T07:23:17+04:00
default_branch: main
main_head: a498f256c309e8a3f40f5afd9065c369c8e5f38f
working_branch: not yet allocated
pr: none
current_workflows: none; `.github` is absent
main_status_contexts: 0
main_pull_request_workflow_runs: 0
open_prs_checked: 488, 396, 387, 386
coordination_state: SAFE
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
| Validation workflow | PLANNED | NOT_STARTED | NOT_RUN | `.github/workflows/ci.yml` | implement and run |
| Living report | DRAFTED | repository checkpoint pending | source review | this file | persist and reconcile |

## 6. Active Engineering Item Register

| ID | Type | Severity | Priority | Status | Summary | Evidence | Current PR? |
|---|---|---|---|---|---|---|---|
| ISS-001 | defect | high | P0 | OPEN | repository has no executable CI gate | `.github` 404; zero main workflow runs/statuses | yes |
| RISK-001 | risk | high | P0 | ACTIVE | current product suite may expose accumulated failures | all recent PRs recorded dependency checks as NOT_RUN | yes |
| RISK-002 | risk | high | P0 | MITIGATING | workflow restoration could accidentally restore deployment authority | bounded read-only workflow scope | yes |
| DEC-001 | decision | medium | P0 | ACCEPTED | use current manifest smoke profile instead of stale 2026-07 command list | package scripts + certification manifest | yes |

## 7. Current Technical Diagnosis

```text
Observed symptom: current main has no Actions workflows, status contexts, or pull-request workflow runs.
Current hypothesis: restoring one read-only PR/main workflow around the current smoke manifest is the smallest reliable control-plane prerequisite.
Supporting evidence: historical CI was deleted; current manifest already defines lint/unit/build authority.
Alternative hypotheses: restore historical CI verbatim; restore full certification; restore deploy/data workflows together.
Already ruled out: historical CI verbatim is stale; deploy/data restoration violates this bounded prerequisite.
Falsifier: the new workflow contains write permissions, secrets, deploy/publish commands, or bypasses the current manifest.
Next isolating experiment: run the workflow on its own pull request and inspect every job/step result.
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
Origin: PREEXISTING
```

### VAL-003 — Workflow execution

```text
Status: NOT_RUN
Observation: NOT_OBSERVED
Oracle: NONE
Tested HEAD: not allocated
Reason: workflow has not been committed or opened as a PR
```

## 10. Changed-File Ledger

| File | Intended? | First stage | Latest stage | Purpose | Sensitive? | Validation |
|---|---:|---|---|---|---:|---|
| `.github/workflows/ci.yml` | yes | IMPLEMENT | planned | read-only validation control plane | yes | pending |
| `reports/NW-CI-RESTORE-001_validation_gate.md` | yes | BASELINE | BASELINE | continuous recovery authority | no | source review |

Current branch file count: 0. Ledger count: 2 planned. Unexplained files: 0.

## 11. Review / CI State

No PR exists. Current `main` reports zero status contexts and zero pull-request workflow runs. Branch protection is unobserved because the endpoint is inaccessible to the connector.

## 12. Repository Coordination / Overlap

```text
MASTER_INDEX_CHECKED: not present
STATUS_RECORD: this report
CLAIM_RECORD: report scope declaration
LAST_OVERLAP_CHECK: 2026-08-25T07:23:17+04:00
FILE_OVERLAP: none with open PRs #488/#396/#387/#386
AUTHORITY_OVERLAP: none; this work validates but does not alter their domains
DEPENDENCY_OVERLAP: soft dependency on current package/manifest commands
COORDINATION_STATE: SAFE
```

## 13. Continuation State

```text
Start here: create branch from main a498f256c309e8a3f40f5afd9065c369c8e5f38f
Exact file: `.github/workflows/ci.yml`
Current value/path under investigation: missing workflow control plane
Do not redo: workflow deletion history or manifest trace unless main/package scripts move
Do not change: production code, dependencies, deploy/data workflows, runtime, secrets
Validation still required: static YAML/security assertions and remote Actions execution
Highest-risk remaining item: pre-existing product failures exposed by the restored gate
Exact next action: persist report, add workflow, validate, open draft PR
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

# APPENDIX A — IMPLEMENTATION TAKEOVER QUALIFICATION

```text
Qualification basis: GE-001
PR_HEAD: not allocated
MAIN_HEAD: a498f256c309e8a3f40f5afd9065c369c8e5f38f
Generated from: ISS-001, RISK-001, RISK-002
PARTIAL implementation: none
NOT_RUN validation: current smoke profile and GitHub Actions execution
Next intended stage: IMPLEMENT
APPENDIX_A_STATUS: CURRENT
```

1. **A1 Production Trace (20):** Trace a pull-request commit through checkout, lockfile install, manifest profile selection, lint, unit tests, build, job conclusion, and GitHub check presentation.
2. **A2 Current Failure Isolation (20):** Distinguish workflow syntax/no-start, dependency-install failure, and product test failure; identify the evidence and next action for each.
3. **A3 Authority / Invariant (20):** Prove the workflow cannot deploy or publish and identify every token permission and credential path.
4. **A4 Independent Validation (20):** Validate YAML structure and prohibited-capability absence independently of a successful Actions run.
5. **A5 Next-Commit / Minimal Patch (20):** Name the exact two files, current main SHA, trigger set, command authority, and stop conditions for the next commit.

# HISTORICAL RECORD — NOT CURRENT AUTHORITY

## Stage Execution Log

- 2026-08-25T07:23:17+04:00 — GE-001 established; no workflows present; historical CI and current smoke-manifest authority traced; scope classified SAFE.
