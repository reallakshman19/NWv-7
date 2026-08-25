# NW-PAGES-001 — Pages Publishing Recovery

# CURRENT RECOVERY STATE — READ FIRST

## 1. Recovery Header

```text
HANDOVER_READINESS: DEGRADED
PR_RECOVERY_STATE: RECOVERABLE
TAKEOVER_AUTHORITY: WRITE_ALLOWED

REPOSITORY: reallaksh19/NWv-7
SOURCE_TASK: Repair Pages publishing configuration before further ranking/source work
PR_OR_WIP: WIP-NW-PAGES-001
BRANCH: agent/nw-pages-001-pages-publishing-recovery

PR_HEAD_OBSERVED: NOT_CREATED
REPORT_BASIS_HEAD: a3641d6a0de0208cc31b1ff823e1d2178796faf3
MAIN_HEAD_LAST_CHECKED: a3641d6a0de0208cc31b1ff823e1d2178796faf3
MERGE_BASE: a3641d6a0de0208cc31b1ff823e1d2178796faf3
REPORT_SYNC: CURRENT

APPENDIX_A_STATUS: CURRENT
GROUNDING_EPOCH: GE-001
CURRENT_TAKEOVER: NOT_APPLICABLE

CURRENT_STAGE: BASELINE
LAST_COMPLETED_STAGE: COORDINATION_CHECK
CURRENT_BLOCKER: Pages repository setting is observed indirectly through the dynamic branch/Jekyll run and is not writable through the connected GitHub API
HIGHEST_RISK: suppressing Jekyll without publishing the Vite dist would produce a green but unusable site
LAST_DURABLE_CHECKPOINT: 2026-08-25T11:15:00Z

EXACT_NEXT_ACTION: restore the last qualified dist-based deploy workflow and validate its source, build, manifest, artifact, and deployment contract locally
```

## 2. Handover in 60 Seconds

### What is now true

- `main` is `a3641d6a0de0208cc31b1ff823e1d2178796faf3` after PR #490.
- Dynamic Pages run #32839261877 used Jekyll against repository root and failed on Liquid syntax in `agent_prompts/Wave2_Agent05_Prompt.md`.
- The failing Markdown file was not changed by PR #490; the failure is pre-existing publishing configuration behavior.
- `public/.nojekyll` is copied only into a Vite build. There is no root `.nojekyll` and no tracked `dist` or built `docs` application on `main`.
- The last qualified deploy workflow built Vite `dist`, wrote the Pages data manifest, uploaded the official Pages artifact, deployed it, and verified provenance.

### What is currently being worked on

Restore only the last qualified official Pages deploy path from commit `f6cecb059a9dac5103469ef819bcd52eb945f1c6`.

### What remains unfinished

Workflow restoration, local validation, PR allocation/reconciliation, owner merge authorization, and the repository Pages source setting change from branch/Jekyll to GitHub Actions.

### What has been proven

- The Jekyll job received a runner and failed while parsing repository Markdown, not application source.
- The CI validation job is a separate infrastructure no-start: runner ID `0`, zero steps.
- Open PRs #396, #387, and #386 do not touch the deploy workflow or this report.

### What has NOT been proven / NOT_RUN

- The restored workflow has not yet been executed remotely.
- A deployed URL has not been verified in this work item.
- The repository Pages source setting has not been changed.

### What must not be assumed

- Adding a root `.nojekyll` alone would not deploy a usable Vite application.
- A locally successful build does not prove a GitHub Pages deployment.
- This work does not restore scheduled data-refresh workflows.

### Highest-risk remaining item

The repository can remain on branch/Jekyll publishing after code restoration; that external source-mode setting must be changed before deployment can be claimed.

### Exact next action

Add `.github/workflows/deploy.yml` from the last qualified provenance-bound implementation, then run focused workflow tests and the local smoke baseline.

## 3. Repository Ground Truth

```text
verified_at: 2026-08-25T11:15:00Z
default_branch: main
main_head: a3641d6a0de0208cc31b1ff823e1d2178796faf3
working_branch: agent/nw-pages-001-pages-publishing-recovery
pr: NOT_CREATED
current_workflows: .github/workflows/ci.yml only
failing_pages_run: #32839261877, Jekyll build failure
ci_run: #32839262140, runner_id=0, steps=0
open_prs_checked: #396, #387, #386
coordination_state: SAFE
```

## 4. Mission / Scope / Acceptance

### Mission

Restore an official Vite-build-to-Pages artifact path so repository Markdown is not treated as the application build input.

### Approved scope

- `.github/workflows/deploy.yml`;
- this living report.

### Explicit non-goals

- no ranking, source, fallback, Live/Hybrid, browser-ordering, or UI changes;
- no generated data or built artifact commits;
- no dependency or lockfile changes;
- no restoration of news, market, weather, travel, or other refresh workflows;
- no claim of successful remote deployment before execution evidence exists;
- no merge without separate explicit owner authorization.

### Acceptance criteria

1. Build the current application with `npm ci` and `npm run build`.
2. Publish only `dist` through official Pages artifact/deploy actions.
3. Preserve the existing Pages data-manifest and immutable-source provenance contract.
4. Preserve post-deployment provenance and World-health verification jobs.
5. Pass focused workflow certification, lint, unit tests, and production build locally.
6. Keep remote execution and Pages source-mode status explicit.

## 5. Current Implementation State

| Work item | Implementation | Integration | Validation | Location | Remaining |
|---|---|---|---|---|---|
| Deploy workflow | NOT_STARTED | NOT_STARTED | NOT_RUN | `.github/workflows/deploy.yml` | restore qualified content |
| Recovery report | CURRENT | WIP | SOURCE_INSPECTION | this file | update after every stage |

## 6. Active Item Register

| ID | Type | Severity | Priority | Status | Summary | Evidence | Current PR? |
|---|---|---:|---:|---|---|---|---:|
| ISS-001 | defect | high | P0 | ACTIVE | branch/Jekyll Pages source parses repository Markdown and fails | run #32839261877 | yes |
| RISK-001 | risk | high | P0 | ACTIVE | source-mode setting remains external to the code diff | dynamic Pages run path | yes |
| DEC-001 | decision | medium | P0 | ACCEPTED | restore the last qualified official dist workflow instead of adding root `.nojekyll` | source and history inspection | yes |

## 7. Current Technical Diagnosis

```text
Observed symptom: GitHub Pages runs dynamic Jekyll over repository root and fails on Liquid syntax in a Markdown prompt.
Current hypothesis: Pages remains configured for branch/root publishing after the qualified deploy workflow was deleted.
Supporting evidence: run path is dynamic/pages/pages-build-deployment; Build with Jekyll is the failing step; only ci.yml exists on main.
Alternative hypotheses: malformed Vite output or application build failure.
Already ruled out: Vite was not invoked in the failing Pages run; PR #490 local Vite build passed.
Falsifier: a Pages run that consumes an uploaded `dist` artifact and still fails on the same Markdown file.
Next isolating experiment: validate the restored workflow and, after merge/source-mode change, inspect the first official artifact deployment.
```

## 8. Authority and Invariants

```text
application build authority: package-lock.json + Vite configuration
publication artifact authority: dist/
deployment workflow authority: .github/workflows/deploy.yml
served-data provenance authority: scripts/write_pages_data_manifest.mjs + scripts/pagesDeploymentProvenance.mjs
```

Negative assurance: only deployment orchestration changes; application, ranking, source collection, snapshots, and runtime behavior remain unchanged.

## 9. Current Validation

All implementation checks are currently `NOT_RUN`. The baseline diagnosis is `PASS / SOURCE_INSPECTION / INDEPENDENT_REPRODUCTION` against `main` `a3641d6a…`.

## 10. Changed-File Ledger

| File | Intended? | First stage | Latest stage | Purpose | Sensitive? | Validation |
|---|---:|---|---|---|---:|---|
| `.github/workflows/deploy.yml` | yes | implementation | pending | official Vite Pages deployment | yes | NOT_RUN |
| `reports/NW-PAGES-001_pages_publishing_recovery.md` | yes | baseline | baseline | durable recovery evidence | no | source inspection |

Expected file count: 2. Unexplained files: 0.

## 11. Review / CI State

No PR exists yet. Remote workflow execution is `NOT_RUN`.

## 12. Repository Coordination / Overlap

```text
MASTER_INDEX_CHECKED: repository has no agents/MASTER_INDEX.md
STATUS_RECORD: this report
CLAIM_RECORD: this report scope
LAST_OVERLAP_CHECK: 2026-08-25T11:15:00Z
FILE_OVERLAP: none with open PRs #396, #387, #386
AUTHORITY_OVERLAP: none
DEPENDENCY_OVERLAP: ranking work follows this deployment repair
COORDINATION_STATE: SAFE
```

## 13. Continuation State

```text
Start here: .github/workflows/deploy.yml
Do not redo: Jekyll failure isolation and open-PR overlap check
Do not change: ranking/source/runtime/generated data/dependencies
Validation still required: focused workflow tests, lint, unit, build, remote execution
Highest-risk remaining item: repository Pages source-mode setting
Exact next action: restore and validate the qualified workflow
```

# APPENDIX A — IMPLEMENTATION TAKEOVER QUALIFICATION

APPENDIX_A_STATUS is `CURRENT`. A takeover must trace the dynamic Jekyll failure, prove why root `.nojekyll` is insufficient, identify the official artifact boundary, reproduce the focused checks, and propose the exact next minimal commit without expanding into data-refresh workflow restoration.

# HISTORICAL RECORD — NOT CURRENT AUTHORITY

## GE-001

Grounded `main` `a3641d6a…`, three open PRs, exact Jekyll failure, last qualified workflow commit, and absence of deploy workflow on current main.
