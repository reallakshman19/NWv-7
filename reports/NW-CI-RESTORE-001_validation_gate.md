# NW-CI-RESTORE-001 — Non-Deploying Validation Gate

# CURRENT RECOVERY STATE — READ FIRST

## 1. Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: HEALTHY
TAKEOVER_AUTHORITY: WRITE_ALLOWED

REPOSITORY: reallaksh19/NWv-7
SOURCE_TASK: Continue the approved Top Stories/Live/Hybrid remediation plan; restore CI before further production batches
PR_OR_WIP: WIP-NW-CI-RESTORE-001
BRANCH: agent/nw-ci-restore-001-validation-gate

PR_HEAD_OBSERVED: 2b56700082109fc376b98d78c8bc4958dd94ebaa
REPORT_BASIS_HEAD: 2b56700082109fc376b98d78c8bc4958dd94ebaa
MAIN_HEAD_LAST_CHECKED: a498f256c309e8a3f40f5afd9065c369c8e5f38f
MERGE_BASE: a498f256c309e8a3f40f5afd9065c369c8e5f38f
REPORT_SYNC: CURRENT

APPENDIX_A_STATUS: CURRENT
GROUNDING_EPOCH: GE-002
CURRENT_TAKEOVER: NOT_APPLICABLE

CURRENT_STAGE: VALIDATE
LAST_COMPLETED_STAGE: IMPLEMENT
CURRENT_BLOCKER: none
HIGHEST_RISK: restoring a stale or privileged workflow could accidentally deploy, publish, or conceal current product failures
LAST_DURABLE_CHECKPOINT: 2026-08-25T07:26:20+04:00

EXACT_NEXT_ACTION: open a draft PR, observe the restored workflow run, and classify any failure without weakening the gate
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

The bounded workflow is implemented and statically validated; draft PR allocation and remote execution are next.

### What remains unfinished

Remote PR execution, PR reconciliation, and owner merge authorization.

### What has been proven

- No active PR changes `.github/workflows/ci.yml` or this report.
- PR #488 changes three Daily Digest scripts plus its report; PR #396 is report-only; PRs #386/#387 change ranking/view-model files and reports.
- `scripts/certification_manifest.json` defines `smoke` as lint, unit, and build, with the additional lint guard.
- The branch diff is exactly the 63-line workflow plus this report, ahead 2 and behind 0.
- Independent local assertions parsed the YAML and rejected forbidden write/deploy/secret/schedule capabilities.
- The remote workflow content exactly matches the locally validated content.

### What has NOT been proven / NOT_RUN

- The smoke profile has not run on this branch.
- GitHub Actions execution has not started because no pull request exists yet.
- Branch protection could not be read (`403 Resource not accessible by integration`).

### What must not be assumed

- This work does not restore deployment, data generation, scheduled refresh, Pages publication, or snapshot workflows.
- This work does not switch Live/Hybrid runtime behavior.
- A workflow start is not a product PASS; only its completed result can be classified.

### Highest-risk remaining item

Current source may fail lint/unit/build after the long no-CI interval. Such failures must be reported, not weakened or hidden.

### Exact next action

Open a draft PR from `agent/nw-ci-restore-001-validation-gate`, observe the workflow, and classify its result.

## 3. Repository Ground Truth

```text
verified_at: 2026-08-25T07:23:17+04:00
default_branch: main
main_head: a498f256c309e8a3f40f5afd9065c369c8e5f38f
working_branch: agent/nw-ci-restore-001-validation-gate
branch_head: 2b56700082109fc376b98d78c8bc4958dd94ebaa
pr: none
current_workflows: none; `.github` is absent
main_status_contexts: 0
main_pull_request_workflow_runs: 0
open_prs_checked: 488, 396, 387, 386
coordination_state: SAFE
compare_to_main: ahead 2, behind 0, two intended files
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
| Validation workflow | COMPLETE | branch content exact | static PASS; Actions NOT_RUN | `.github/workflows/ci.yml` | run on PR |
| Living report | CURRENT | durable branch checkpoint | source review + diff reconciliation PASS | this file | allocate PR and reconcile |

## 6. Active Engineering Item Register

| ID | Type | Severity | Priority | Status | Summary | Evidence | Current PR? |
|---|---|---|---|---|---|---|---|
| ISS-001 | defect | high | P0 | MITIGATING | repository main has no executable CI gate; branch now restores one | `.github` 404 on main; branch workflow exact | yes |
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
Next isolating experiment: open the workflow's own pull request and inspect every job/step result.
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
Tested HEAD: 2b56700082109fc376b98d78c8bc4958dd94ebaa
Evidence: exact local/remote content comparison and GitHub compare
Expected: workflow content exact; two intended files; behind 0
Actual: exact match; ahead 2, behind 0; workflow + report only
Limitations: no Actions execution yet
Origin: RESOLVED_BY_PR
```

### VAL-005 — Workflow execution

```text
Status: NOT_RUN
Observation: NOT_OBSERVED
Oracle: NONE
Tested HEAD: 2b56700082109fc376b98d78c8bc4958dd94ebaa
Reason: workflow is committed but no pull request exists yet
```

## 10. Changed-File Ledger

| File | Intended? | First stage | Latest stage | Purpose | Sensitive? | Validation |
|---|---:|---|---|---|---:|---|
| `.github/workflows/ci.yml` | yes | IMPLEMENT | VALIDATE | read-only validation control plane | yes | static/security PASS; Actions NOT_RUN |
| `reports/NW-CI-RESTORE-001_validation_gate.md` | yes | BASELINE | VALIDATE | continuous recovery authority | no | source review + reconciliation PASS |

Current branch file count: 2. Ledger count: 2. Unexplained files: 0. Reconciled at `2b56700082109fc376b98d78c8bc4958dd94ebaa`.

## 11. Review / CI State

No PR exists. Branch head reports zero status contexts because the workflow has not had a PR event. Current `main` reports zero status contexts and zero pull-request workflow runs. Branch protection is unobserved because the endpoint is inaccessible to the connector.

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
Start here: branch agent/nw-ci-restore-001-validation-gate at 2b56700082109fc376b98d78c8bc4958dd94ebaa
Exact file: `.github/workflows/ci.yml`
Current value/path under investigation: missing workflow control plane
Do not redo: workflow deletion history or manifest trace unless main/package scripts move
Do not change: production code, dependencies, deploy/data workflows, runtime, secrets
Validation still required: static YAML/security assertions and remote Actions execution
Highest-risk remaining item: pre-existing product failures exposed by the restored gate
Exact next action: synchronize this report, open a draft PR, and observe the Actions run
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

# APPENDIX A — IMPLEMENTATION TAKEOVER QUALIFICATION

```text
Qualification basis: GE-002
PR_HEAD: 2b56700082109fc376b98d78c8bc4958dd94ebaa
MAIN_HEAD: a498f256c309e8a3f40f5afd9065c369c8e5f38f
Generated from: ISS-001, RISK-001, RISK-002
PARTIAL implementation: none; workflow content complete
NOT_RUN validation: GitHub Actions execution of current smoke profile
Next intended stage: PR_RECONCILIATION
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
- 2026-08-25T07:26:20+04:00 — branch created; baseline report and read-only workflow persisted; local static/security contract and exact remote reconciliation passed at GE-002.
