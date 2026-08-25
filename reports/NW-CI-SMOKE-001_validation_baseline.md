# NW-CI-SMOKE-001 — Local smoke baseline repair

# CURRENT RECOVERY STATE — READ FIRST

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: HEALTHY
TAKEOVER_AUTHORITY: WRITE_ALLOWED
REPOSITORY: reallaksh19/NWv-7
SOURCE_TASK: Owner continuation after PR #489; repair lint and stale unit baseline locally
PR_OR_WIP: PR #490
BRANCH: codex/nw-ci-smoke-baseline-001
PR_HEAD_OBSERVED: e5d35bcdaa3b3e35a3e6004c6f1ac8ee691c7d91
REPORT_BASIS_HEAD: 21e39fb72a22f80f423bfa319646d32b15b89f93
MAIN_HEAD_LAST_CHECKED: ed9036494ffbc6d6964af9e2f4a75b56bc34c2d1
MERGE_BASE: ed9036494ffbc6d6964af9e2f4a75b56bc34c2d1
REPORT_SYNC: CURRENT
APPENDIX_A_STATUS: NOT_REQUIRED
GROUNDING_EPOCH: GE-002
CURRENT_STAGE: HANDOVER
CURRENT_BLOCKER: remote validation unavailable (`runner_id: 0`, zero steps); local validation complete
HIGHEST_RISK: GitHub Actions remains unable to allocate a runner
LAST_DURABLE_CHECKPOINT: draft PR #490 opened and reconciled at e5d35bcd
EXACT_NEXT_ACTION: owner reviews PR #490 and explicitly authorizes or declines merge
```

## Handover in 60 Seconds

Current `main` is `ed903649...`, the squash merge of Daily Digest PR #488 on top of CI restoration PR #489. Implementation head `21e39fb7...` is two commits ahead: one recovery report checkpoint and one bounded repair commit. The exact 18-file branch diff is reconciled and contains no workflow, dependency, or production-ranking-policy modification.

Lint is clean. All 226 Vitest files pass with 1,316 tests passed and 12 unavailable-workflow assertions explicitly skipped. The hotfix guard and 371-module production build pass. The smoke wrapper itself was blocked before launch by the execution environment; every command in its smoke manifest was executed individually.

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
| ISS-001 | lint | RESOLVED | Intentional catches are documented; composite refresh dependencies are explicit |
| ISS-002 | test | RESOLVED | Twelve absent-workflow assertions are conditionally skipped while local CLI/algorithm coverage remains active |
| ISS-003 | test | RESOLVED | MainPage certification now asserts composite Main + Daily Digest refresh |
| ISS-004 | test | RESOLVED | Fixtures now carry explicit geography/evidence and analytically reconciled golden scores |
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
| VAL-002 | PASS | LOCAL_EXECUTION | IMPLEMENTATION_COUPLED | `npm run lint`: 0 findings | RESOLVED_BY_PR |
| VAL-003 | PASS | LOCAL_EXECUTION | IMPLEMENTATION_COUPLED | `npm run test:unit`: 226 files passed; 1,316 passed, 12 skipped | RESOLVED_BY_PR |
| VAL-004 | PASS | LOCAL_EXECUTION | IMPLEMENTATION_COUPLED | `./node_modules/.bin/vite build`: 371 modules, build complete | RESOLVED_BY_PR |
| VAL-005 | PASS | LOCAL_EXECUTION | NONE | `npm ci`: 299 packages installed | PREEXISTING |
| VAL-006 | PASS | LOCAL_EXECUTION | IMPLEMENTATION_COUPLED | `node scripts/test_lint_hotfix_static.mjs` | RESOLVED_BY_PR |
| VAL-007 | PASS | LOCAL_EXECUTION | INDEPENDENT_REPRODUCTION | Frozen audit fixture math matches merged geography/evidence policy | RESOLVED_BY_PR |
| VAL-008 | NOT_RUN | NOT_OBSERVED | NONE | `test:certify:smoke` wrapper blocked before launch by tool approval transport; all four delegated components passed separately | UNKNOWN_ORIGIN |

## Authority / Invariants

- Production ranking authority remains `rankTopStories` plus current policy/admission/location modules.
- `.github/workflows/ci.yml` remains untouched.
- Missing workflow contracts are `NOT_RUN`/skipped, never product PASS.
- Golden values must be derived from frozen fixture inputs and merged policy math, not copied blindly from runtime output.

## Coordination

Open PRs checked: #396, #387, #386. PRs #386/#387 overlap the ranking-validation domain but are non-mergeable, last updated 2026-07-08, and change different exact files. This batch does not modify their claimed `NewsContext.jsx`, ViewModel, or report files. Coordination state: `COORDINATION_REQUIRED_RESOLVED_BY_BOUNDED_SUCCESSOR_SCOPE`.

## Changed-File Ledger

| File | Purpose |
|---|---|
| `cloudflare/daily-digest-api/src/adapters/html.js` | Document intentional malformed-input catches |
| `cloudflare/daily-digest-api/src/adapters/indianExpressDailyBriefing.js` | Document candidate-edition fallthrough |
| `src/pages/MainPage.jsx` | Preserve composite refresh with compiler-safe dependencies |
| `src/pages/MainPage.release6A.cert.test.jsx` | Certify the current composite refresh contract |
| `src/services/travelNewsWorkflow.cert.test.js` | Skip only absent travel-workflow contract |
| `src/services/topStories/topStoriesPilotAuthorityExclusivity.cert.test.js` | Skip only two absent pilot-workflow assertions |
| `src/services/topStories/topStoriesPilotWorkflow.cert.test.js` | Skip absent workflow assertion; retain downloader test |
| `src/services/topStories/topStoriesShadowAggregationWorkflow.cert.test.js` | Skip absent workflow assertion; retain CLI tests |
| `src/services/topStories/topStoriesShadowWorkflowCli.cert.test.js` | Skip absent workflow assertion; retain repository-shadow tests |
| `src/services/topStories/topStoriesOperationalValidationWorkflow.cert.test.js` | Skip absent workflow assertion; retain validation CLI tests |
| `src/services/topStories/topStoriesPagesDeploymentProvenance.cert.test.js` | Skip two absent workflow assertions; retain provenance tests |
| `src/insight/src/quality/auditRemediation.cert.test.ts` | Skip absent deploy-workflow assertion only |
| `src/services/worldHealthDeploymentSmoke.cert.test.js` | Skip two deploy-workflow assertions; retain smoke-source contract |
| `src/services/topStories/fixtures/topStoriesRegressionFixtures.js` | Declare strong world geography independently of feed section |
| `src/services/topStories/fixtures/topStoriesGoldenReviewSnapshot.js` | Reconcile three geo-dependent scores analytically |
| `src/services/topStories/topStoriesEvaluator.cert.test.js` | Keep fallback-aggregator gate reachable with a non-critical event |
| `src/services/topStories/topStoriesRanker.cert.test.js` | Supply mature-event evidence to secondary/LIVE fixtures |
| `reports/NW-CI-SMOKE-001_validation_baseline.md` | Recovery, scope, validation, and closure evidence |

Actual branch diff: 18 files; ledger: 18; unexplained: 0. Reconciled at `21e39fb7...` against `ed903649...`.

## Review / CI State

PR #490 is open, draft, and mergeable with 18 changed files and 3 commits at grounding epoch GE-002. Reviews: 0. Review threads: 0. Comments: 0. CI run `32834826337` ended `failure` before execution: job `97761251338`, `runner_id: 0`, empty runner name, zero steps. This is infrastructure `NOT_RUN`, not product failure or PASS.

# APPENDIX A — IMPLEMENTATION TAKEOVER QUALIFICATION

- A1: Trace `test:certify:smoke` to lint, hotfix lint, Vitest, and build; identify which stage currently fails first.
- A2: Reproduce why the 10-hour fallback fixture moved below 0.33 after PR #484 without using the golden snapshot as an oracle.
- A3: Explain why `section=world` is provenance rather than strong geography and name the accepted explicit field used in this repair.
- A4: Show which workflow tests remain executable locally and which exact assertions are skipped when their YAML is absent.
- A5: Propose the smallest next commit that clears remaining failures without modifying workflow or production ranking code.
