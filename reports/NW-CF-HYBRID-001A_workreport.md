# NW-CF-HYBRID-001A — living work report

## Recovery header

```text
WORK_ID=PR494
ISSUE=493
PR=494
BRANCH=agent/nw-cf-hybrid-001a-replay-authority
BASE_SHA=c37cc142e72945dd247d4d209c0378ed7c67447f
LAST_VERIFIED_REMOTE_MAIN_SHA=c37cc142e72945dd247d4d209c0378ed7c67447f
REPORT_BASIS_HEAD=11746e8d5fa68ae62513ebb6f5b8191ae84f418e
WORK_INTENT=IMPLEMENT
REPOSITORY_STATE=OPEN_DRAFT_PR
MUTATION_AUTHORITY=WRITE_ALLOWED
CRITICALITY=DATA_PLANE_CRITICAL/RANKING_AUTHORITY_CRITICAL
COORDINATION_STATE=SAFE_WITH_LEGACY_AWARENESS
EXECUTION_MODE=AUTO
AUTO_STATE=RUNNING
SCOPE_AUTHORITY=LOCKED_TO_APPROVED_MISSION
PHASE_PROGRESSION=AUTO
MERGE_AUTHORITY=OWNER_ONLY
```

Draft PR: #494 — `NW-CF-HYBRID-001A: Freeze Sections replay and shared authority`.

AUTO MODE was explicitly authorized by the owner on 2026-08-25. It authorizes phase-by-phase progression through the approved Issue #493 plan, but not merge, browser cutover, workflow changes, destructive operations, or scope expansion.

## Handover in 60 seconds

Phase 0 grounding is complete and still current. Live `main` remains `c37cc142e72945dd247d4d209c0378ed7c67447f`, the merge of #492. PR #494 is based directly on that SHA and remains mergeable/draft. Current PR head before this report checkpoint was `11746e8d5fa68ae62513ebb6f5b8191ae84f418e`.

PR-A implementation now exists: shared source-registry authority, frozen input epoch, executable-version envelope, deterministic evaluator, A–O benchmark, focused certification, explicit authoritative rank evidence, explicit `nowMs=0` custody, and the Google News wrapper/publisher-family correction. Browser serving remains `/newsdata/sections_latest.json`; no Cloudflare package/D1/workflow/browser switch is in PR-A.

No local product validation has yet been recorded as PASS. Direct network checkout from the execution container failed because `github.com` DNS is unavailable there; that is an environment/tooling limitation, not product evidence. Continue with source-level reconciliation and any executable validation that can be performed without falsely upgrading NOT_RUN checks.

## Ground truth

### Browser / Hybrid runtime

```text
/newsdata/sections_latest.json
 -> src/adapters/sectionsSnapshotLoader.js
 -> src/adapters/sectionsSnapshotFetcher.js
 -> src/services/rssAggregator.js
 -> src/data/datasets/sectionsDataset.js
 -> deduplicateAndCluster(...)
 -> rankTopStories(...)
 -> src/services/topStories/topStoriesRanker.js
```

Protected baseline runtime contracts:

```text
memory TTL                         = 10 min
foreground snapshot budget        = 1500 ms
retry backoff                      = [250, 500] ms
supported snapshot schemas        = 1, 2
sections snapshot max age         = 12 h
section item max age              = 36 h
Top Stories ordinary max age      = 12 h
Top Stories live-like max age     = 36 h
```

### Reference acquisition

```text
config/section_sources.json
 -> scripts/section_source_policy.py
 -> scripts/fetch_sections_stories.py
 -> public/newsdata/sections_latest.json
```

Observed collector semantics:

```text
sections                           = 10
configured acquisition lanes       = 41
retention                           = 36 h
max stories / section              = 30
minimum before city backfill       = 10
trichy backfill                    = tn
muscat backfill                    = world
missing/malformed publication time = stale; no fetch-time freshness substitution
```

Lane recount:

```text
topStories 5 + india 4 + tn 3 + trichy 4 + muscat 5
+ world 4 + business 5 + technology 3 + sports 4 + entertainment 4
= 41
```

Registry version is `section-source-policy-v1`. Baseline Git blob SHA `d0f08b626ffca5be5a7b9311bf457c74580943a1` is only Git object identity. PR-A adds a semantic SHA-256 authority over the canonical registry value.

## Current Phase-A implementation

### IMP-001 — source registry authority

**State:** IMPLEMENTED / validation pending.

`scripts/top-stories-shadow/sectionsShadowSourceRegistry.mjs`:

- accepts only registry schema 1;
- requires the exact ten qualified section keys;
- validates feed fields;
- preserves the registry value rather than copying the 41 lanes;
- derives canonical semantic SHA-256;
- exposes section and acquisition-lane cardinality.

### IMP-002 — frozen input epoch

**State:** IMPLEMENTED / validation pending.

`scripts/top-stories-shadow/sectionsShadowInputEpoch.mjs` defines `nw-sections-shadow-input-epoch/v1` and fails closed on:

- missing/unsupported schema;
- missing/string/non-finite/negative clock;
- invalid captured timestamp;
- invalid registry digest/version boundary;
- invalid input source;
- invalid section/top-feed/settings/source-health shape;
- benchmark circularity flags;
- input evidence digest mismatch.

The frozen evaluator never needs wall-clock fallback because the epoch contract requires explicit numeric `nowMs`.

### IMP-003 — shared executable evaluator

**State:** IMPLEMENTED / validation pending.

`scripts/top-stories-shadow/sectionsShadowEvaluator.mjs` imports and calls the production `evaluateTopStories()` authority. It emits:

```text
source registry version/digest
input evidence digest
explicit nowMs
source identity / normalization / classifier / ranker versions
normalization digest
ranker policy digest
candidate-build trace
candidate publisher-family/classification/admission/score evidence
authoritative rank
selected/displayed positions
selection trace
decisionOutputDigest
```

No Worker-local ranking weights, thresholds, event rules, source aliases or diversity limits exist in PR-A.

### IMP-004 — explicit authoritative rank

**State:** IMPLEMENTED / validation pending.

`evaluateTopStories()` now assigns `authoritativeRank=index+1` after the existing deterministic sort and before selection. This is evidence-only metadata over the already-authoritative sorted order; it does not change comparator or slot selection semantics.

### IMP-005 — publisher-family wrapper correction

**State:** IMPLEMENTED / validation pending.

`getStorySourceFamilies()` removes `google_news` from independent publisher evidence whenever at least one known non-aggregator publisher family exists. Aggregator-only stories retain the `google_news` family. Raw acquisition provenance remains available in the source rows; only independent publisher evidence is corrected.

`TOP_STORIES_SOURCE_IDENTITY_VERSION = nw-top-stories-source-identity-v1` is now explicit so future repository/Worker comparisons can fail closed on incompatible source-identity semantics.

### IMP-006 — deterministic benchmark

**State:** IMPLEMENTED / frozen before Cloudflare observation.

Fixture: `scripts/top-stories-shadow/fixtures/nw-cf-hybrid-001a-benchmark.json`.

It carries:

```text
frozenBeforeShadowObservation=true
shadowOutputUsedToChooseExpected=false
```

and covers cases A–O:

```text
A nominal 10-section epoch
B TOI / Times of India alias duplication
C google_news / google_news_alt / google_news_oman lane aliases
D original publisher behind Google News wrapper
E missing timestamp
F malformed timestamp
G exact 12 h Top Stories boundary
H exact 36 h section-retention boundary
I duplicate canonical story across sections
J Trichy <- TN backfill representation
K Muscat <- World backfill representation
L one Tier-A publisher failure
M multiple source failures with retained partial evidence
N mature non-local public_safety evidence gate
O routine business / sports / entertainment classification
```

The frozen epoch has 19 raw rows and an expected 18-candidate deduplicated population. `decisionOutputDigest` intentionally remains null until a valid reference execution can freeze it; Cloudflare output may not be used to populate it.

## Item register

### ISS-001 — semantic source-registry digest absent

**State:** RESOLVED_BY_PR pending execution validation.

PR-A now provides canonical registry digest authority; do not substitute Git blob SHA.

### ISS-002 — Google News wrapper inflates publisher evidence

**State:** RESOLVED_BY_PR pending regression execution.

The intended corrected Case-D publisher set is exactly:

```text
reuters
times_of_india
```

not `reuters + google_news + times_of_india`.

### RISK-001 — hidden wall clock in deterministic replay

**State:** BOUNDED_BY_CONTRACT pending test execution.

Frozen replay requires numeric `nowMs`; production `evaluateTopStories()` also changed from truthy clock selection to nullish clock selection so explicit zero remains zero.

### RISK-002 — benchmark circularity

**State:** CONTROLLED.

Expected semantic invariants were frozen before Cloudflare observation. The final decision digest remains unset until reference execution; shadow output is forbidden as oracle.

### RISK-003 — Worker fanout capacity

**State:** DEFERRED_TO_PR-B / NOT_RUN.

Issue Appendix-A hypothetical `41 + 12 = 53 > 50` proves a one-invocation design would fail under a 50-subrequest envelope. Actual current Cloudflare limits must be retrieved and measured in PR-B; no source deletion is allowed.

### RISK-004 — validation environment cannot clone GitHub

**State:** ACTIVE TOOLING LIMITATION.

Attempted local checkout:

```text
git clone --depth 1 --branch agent/nw-cf-hybrid-001a-replay-authority https://github.com/reallaksh19/NWv-7.git /tmp/NWv7
```

Observed:

```text
fatal: unable to access ... Could not resolve host: github.com
```

Classification: environment/tooling limitation. It is not a product FAIL and must not be represented as PASS.

## D1 custody carried forward to PR-B

```text
source_runs
source_fetch_evidence
section_snapshots
section_snapshot_items
current_snapshot_pointer
parity_results
```

Publication invariant:

```text
create run
-> acquire all lane dispositions
-> build complete epoch
-> validate
-> write STAGED snapshot/items
-> verify cardinality + digests
-> COMMIT
-> atomically move current pointer
```

A STAGED/partial epoch is never current.

## Validation ledger

| Check | Status | Observation | Oracle | Basis / limitation |
|---|---|---|---|---|
| live `main` grounding | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | main=`c37cc142...` rechecked after AUTO activation |
| PR #494 live state | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | open, draft, mergeable; pre-report head=`11746e8...` |
| open overlap gate | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | no exact Phase-A claim; legacy awareness only |
| 10-section / 41-lane source recount | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | `config/section_sources.json` |
| collector retention/backfill/timestamps | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | reference collector |
| browser serving authority unchanged | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | loader still targets `/newsdata/sections_latest.json` |
| PR-A registry authority structure | PASS | SOURCE_INSPECTION | IMPLEMENTATION_COUPLED | pure canonical digest helper; execution pending |
| PR-A frozen epoch fail-closed structure | PASS | SOURCE_INSPECTION | IMPLEMENTATION_COUPLED | explicit clock/digest/anti-circularity checks present |
| PR-A evaluator uses shared ranker | PASS | SOURCE_INSPECTION | IMPLEMENTATION_COUPLED | direct `evaluateTopStories()` import |
| focused Vitest | NOT_RUN | NOT_OBSERVED | NONE | local repository checkout unavailable in current container |
| npm lint | NOT_RUN | NOT_OBSERVED | NONE | no runnable checkout in current container |
| unit suite | NOT_RUN | NOT_OBSERVED | NONE | no runnable checkout in current container |
| build | NOT_RUN | NOT_OBSERVED | NONE | no runnable checkout in current container |
| full certification | NOT_RUN | NOT_OBSERVED | NONE | no runnable checkout in current container |
| GitHub Actions | NOT_APPLICABLE | NOT_OBSERVED | NONE | Issue/user execution path does not rely on Actions |
| Wrangler dry-run | NOT_APPLICABLE | NOT_OBSERVED | NONE | Worker is PR-B scope |
| actual Worker capacity | NOT_RUN | NOT_OBSERVED | NONE | PR-B deployment gate |

No unexecuted check is represented as PASS.

## Negative assurance

PR-A must not change and current changed-file inventory does not include:

```text
.github/workflows/**
src/adapters/sectionsSnapshotLoader.js
browser VITE configuration
production browser serving authority
Top Stories weights / thresholds / event taxonomy / source tiers
public/newsdata/sections_latest.json
cloudflare/daily-digest-api/**
cloudflare/upahead-dataset-api/**
```

## Changed-file ledger — reconciled to PR #494

```text
reports/NW-CF-HYBRID-001A_workreport.md                                      UPDATE   recovery/evidence
scripts/top-stories-shadow/fixtures/nw-cf-hybrid-001a-benchmark.json          ADD      frozen A-O benchmark
scripts/top-stories-shadow/sectionsShadowAuthorityVersions.mjs                ADD      executable version envelope
scripts/top-stories-shadow/sectionsShadowEvaluator.mjs                        ADD      deterministic shared evaluator
scripts/top-stories-shadow/sectionsShadowInputEpoch.mjs                       ADD      frozen input contract
scripts/top-stories-shadow/sectionsShadowSourceRegistry.mjs                   ADD      registry semantic authority
src/services/topStories/topStoriesRanker.js                                   UPDATE   explicit zero-clock custody + authoritative rank evidence
src/services/topStories/topStoriesSectionsShadowAuthority.cert.test.js        ADD      focused PR-A certification
src/services/topStories/topStoriesSignals.js                                  UPDATE   explicit zero-clock custody
src/services/topStories/topStoriesSourceIdentity.js                           UPDATE   wrapper/publisher evidence boundary + version
```

Every currently changed path is explained. No workflow/browser/Cloudflare package file is in the PR.

## Coordination

```text
FILE_OVERLAP=SAFE
AUTHORITY_OVERLAP=SAFE_WITH_LEGACY_AWARENESS
DEPENDENCY_OVERLAP=SAFE
```

Re-check before handover/merge recommendation and before starting PR-B.

## Appendix A — takeover qualification

### A1 — The extra candidate

188 vs 189 = net `+1` (`0.532%`). Top-10 intersection 9/10 = 90%, Jaccard `9/11 = 81.82%`, symmetric difference 2; deterministic parity FAILS. Inspect `candidateBuildTrace` / dedupe identities first, then `normalizationDigest`. Identical input evidence means it cannot be acquisition drift; classify at the first deterministic divergence or fail closed `UNKNOWN_DRIFT`.

### A2 — Are these really three sources?

The old path could treat `{reuters, google_news, times_of_india}` as three publisher families. Correct semantic authority is Reuters + Times of India; Google News Oman is acquisition wrapper provenance. PR-A implements and freezes that boundary.

### A3 — Worker died at 201

S101 expected 10/284 but failed 7/201; deficit 3 sections/83 rows. `latest` must remain S100. S101 stays STAGED/FAILED; partial evidence is RCA-only. Retry is idempotent; pointer moves only after full cardinality/digest verification and COMMIT.

### A4 — Forty-one feeds fit until redirects

`41 + 12 = 53`, envelope 50: over by 3, 106%; one-invocation acquisition would be unqualified under that hypothetical. Use bounded shards under one logical epoch with an epoch barrier/finalizer. All 41 lanes end in explicit dispositions; no source deletion.

### A5 — 4.8-hour Seattle public safety

Freshness `0.60`; weighted raw score `64.20`; normalized `64.20/122 ~= 0.52623`; secondary threshold margin about `+0.12623`. Nevertheless mature/non-local critical admission rejects because location `0.42 < 0.82`, independent evidence absent, source quality `0.48 < 0.95`; reason `mature_nonlocal_critical_without_evidence`.

**Takeover qualification:** PASS for current repository authority. Implementation execution evidence is still pending.

## Takeover / grounding chain

| Session | Role | Start basis | End/basis head | Work performed | Next action |
|---|---|---|---|---|---|
| Phase-A bootstrap | implementer | `c37cc142...` | `0e3487e...` | grounding, overlap, call paths, work report, draft PR | implement contracts |
| Phase-A implementation | implementer | `0e3487e...` | `11746e8...` | registry/input/evaluator/version contracts, wrapper fix, rank evidence, A-O fixture, focused tests | validate/reconcile |
| AUTO continuation | implementer | `11746e8...` | report basis `11746e8...` | re-grounded main/PR, activated AUTO MODE, reconciled changed files and validation truth | inspect/fix PR-A, execute available validation, finalize PR-A handover |

## EXACT_NEXT_ACTION

Review the current PR-A diff for semantic/test defects, repair only defects inside Issue #493 Phase-A scope, execute any locally reproducible validation available without GitHub Actions, freeze reference-only expected digest only if a valid reference execution is obtained, reconcile work report/PR body, and continue automatically to a merge-ready handover. Do not merge without separate owner authorization.