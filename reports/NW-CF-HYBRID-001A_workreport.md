# NW-CF-HYBRID-001A — living work report

## Recovery header

```text
WORK_ID=PR494
ISSUE=493
PR=494
BRANCH=agent/nw-cf-hybrid-001a-replay-authority
BASE_SHA=c37cc142e72945dd247d4d209c0378ed7c67447f
LAST_VERIFIED_REMOTE_MAIN_SHA=c37cc142e72945dd247d4d209c0378ed7c67447f
REPORT_BASIS_HEAD=cc3226ca808f691df67087500b033f5ed89457c4
WORK_INTENT=IMPLEMENT
REPOSITORY_STATE=OPEN_READY_FOR_REVIEW
MUTATION_AUTHORITY=WRITE_ALLOWED
CRITICALITY=DATA_PLANE_CRITICAL/RANKING_AUTHORITY_CRITICAL
COORDINATION_STATE=SAFE_WITH_LEGACY_AWARENESS
EXECUTION_MODE=AUTO
AUTO_STATE=OWNER_DECISION_REQUIRED
SCOPE_AUTHORITY=LOCKED_TO_APPROVED_MISSION
PHASE_PROGRESSION=AUTO
MERGE_AUTHORITY=OWNER_ONLY
```

PR #494 — `NW-CF-HYBRID-001A: Freeze Sections replay and shared authority` — is ready for review. AUTO MODE has completed the approved PR-A implementation/reconciliation work. The next state transition is merge, which remains owner-only under Issue #493 and the engineering PR delivery policy.

## Handover in 60 seconds

Live `main` remains `c37cc142e72945dd247d4d209c0378ed7c67447f` and has not drifted during PR-A. PR #494 is directly based on that SHA, is open, mergeable and no longer draft. No review comments or requested changes are pending.

PR-A now provides the shared deterministic authority required before Cloudflare Sections implementation:

```text
source registry authority
-> frozen input epoch
-> shared evaluateTopStories() execution
-> canonical candidate/source/classification/admission/score evidence
-> authoritative rank/selection trace
-> normalization/policy/decision digests
-> frozen A-O deterministic oracle
```

The production browser still reads `/newsdata/sections_latest.json`. No workflow, browser cutover, Cloudflare Sections Worker, D1 database, Daily Digest storage, or Up Ahead storage is changed by PR-A.

A dependency-free replay slice reconstructed from the exact GitHub sources at the PR head was executed locally with Node. The deterministic reference output is now frozen in the benchmark and enforced unconditionally by certification. Full-repository npm commands remain `NOT_RUN` because the execution container cannot obtain a complete checkout/dependency tree through external DNS; that limitation is not represented as product PASS.

## Mission and acceptance

Issue #493 Phase A requires:

1. one versioned frozen input epoch with explicit clock custody;
2. one semantic source-registry authority without a copied 41-feed list;
3. one shared deterministic evaluator using production Top Stories contracts;
4. exact candidate/source/classification/admission/score/rank/selection evidence;
5. a pre-shadow A-O benchmark with no Cloudflare-derived expected values;
6. canonical publisher-family behavior after #492;
7. browser/static serving authority unchanged.

All seven implementation targets are present in PR #494. Merge/deployment is not authorized by AUTO MODE.

## Live ground truth

### Serving authority

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

Protected runtime facts remain:

```text
memory TTL                    = 10 min
foreground snapshot budget   = 1500 ms
retry backoff                 = [250, 500] ms
snapshot schema support       = 1, 2
section snapshot max age      = 12 h
section item retention        = 36 h
Top Stories ordinary max age = 12 h
```

### Reference acquisition authority

```text
config/section_sources.json
 -> scripts/section_source_policy.py
 -> scripts/fetch_sections_stories.py
```

Current registry metrics reproduced by the PR-A authority:

```text
sourceRegistryVersion = section-source-policy-v1
sourceRegistryDigest  = d6e8c3d706c9848b7e63349ce08cd48c3670377f24c4163150cd368151e96716
sections              = 10
lanes                 = 41
minimum feeds/section = 3
source-group keys     = 17
Tier-A lanes          = 16
```

The frozen registry fixture was created before Cloudflare observation and carries:

```text
frozenBeforeShadowObservation=true
shadowOutputUsedToChooseExpected=false
```

## Current implementation state

### IMP-001 — source registry semantic authority — COMPLETE

`scripts/top-stories-shadow/sectionsShadowSourceRegistry.mjs`:

- accepts registry schema 1 only;
- requires the exact ten qualified sections;
- validates URL/source/sourceGroup/tier/topic;
- accepts only tiers A/B/C;
- validates all requiredCoverage fields;
- fails closed when actual coverage falls below the registry declaration;
- computes section/lane/source-group/Tier-A metrics;
- derives canonical SHA-256 without copying the feed table.

Frozen authority fixture:

`fixtures/nw-cf-hybrid-001a-source-registry-authority.json`.

### IMP-002 — frozen input epoch — COMPLETE

`sectionsShadowInputEpoch.mjs` defines `nw-sections-shadow-input-epoch/v1` and requires:

- valid `capturedAt`;
- finite non-negative numeric `nowMs`;
- registry version + SHA-256 digest;
- `frozen-replay-fixture/<id>` source;
- section/top-feed/settings/source-health shapes;
- anti-circularity flags;
- replay-sanitized evidence only;
- exact input-evidence digest.

The input digest retains section/row sequence because candidate construction observes input order. Explicit `nowMs=0` is preserved rather than falling through to wall time.

### IMP-003 — shared deterministic evaluator — COMPLETE

`sectionsShadowEvaluator.mjs` imports the production `evaluateTopStories()` implementation. It does not own ranking weights, thresholds, event regexes, aliases or diversity policy.

It emits at least:

```text
sourceRegistryVersion/sourceRegistryDigest
inputEvidenceDigest
nowMs
sourceIdentityVersion
normalizationVersion
eventClassifierVersion
rankerVersion
normalizationDigest
rankerPolicyDigest
candidateBuildTrace
candidateEvidence
classification/admission/score components
authoritativeRank
selected/displayed identities
selectionTrace
decisionOutputDigest
```

### IMP-004 — executable version custody — COMPLETE

Version identifiers are exported from the executable modules and consumed by the shadow envelope:

```text
rankerVersion           = nw-top-stories-ranker-observed-v1
eventClassifierVersion  = nw-top-stories-event-classifier-v1
sourceIdentityVersion   = nw-top-stories-source-identity-v1
normalizationVersion    = nw-top-stories-normalization-v1
```

The shadow wrapper does not invent replacement ranker/classifier identifiers.

### IMP-005 — Google News wrapper / publisher evidence — COMPLETE

`getStorySourceFamilies()` removes `google_news` from independent publisher evidence when a non-aggregator publisher family is known. Aggregator-only evidence remains `google_news`.

Frozen Case D:

```text
source='Reuters'
sourceGroup='google_news_oman'
allSources=['Reuters','Google News Oman','TOI','Times of India']
```

now yields exactly:

```text
reuters
times_of_india
```

not `reuters + google_news + times_of_india`.

### IMP-006 — frozen A-O benchmark + deterministic oracle — COMPLETE

Benchmark: `scripts/top-stories-shadow/fixtures/nw-cf-hybrid-001a-benchmark.json`.

Cases A-O cover nominal epoch, publisher aliases, Google News lane aliases, wrapper/original publisher, missing/malformed timestamps, exact 12h and 36h boundaries, duplicate canonical identity, Trichy/TN and Muscat/World backfill provenance, source failures, mature non-local critical admission, and low-interest business/sports/entertainment classes.

The frozen reference authority is now:

```text
rawInputCount        = 19
candidateCount       = 18
inputEvidenceDigest  = e5b047ca97a412411a927d091add3c274129b7949a1f178a14eeedbbc1f01e6a
normalizationDigest  = 050b7201b09b427d7f0e5174802e79899dedc7c9380596124d37f3229f89a4fc
rankerPolicyDigest   = eafcebdabc60c4b4b6340311d323c0088470e3d5466d9f6765ba8fe9a2b5346a
decisionOutputDigest = 74a012724be58b1c834c88f699d0627eb3e82a2d24721a279ca70e6eff429fe2
selected/displayed   = case-j-trichy-backfill
                       case-c-google-alias
                       case-g-exact-12h
```

Certification now requires these values unconditionally; the previous nullable decision-digest escape hatch has been removed.

## Technical diagnosis and falsifiers

### ISS-001 — semantic registry digest absent on baseline

**State:** RESOLVED_BY_PR-A.

Falsifier: any exact execution of the unchanged registry that does not produce `d6e8c3d...e96716`, or any silently narrowed registry that still passes coverage authority.

### ISS-002 — Google News acquisition wrapper inflated publisher evidence

**State:** RESOLVED_BY_PR-A.

Reference negative comparison on frozen Case D:

```text
old families       = reuters, google_news, times_of_india
old sourceCount    = 3
old independent    = 2
old consensus      = 0.7124143742160444
old normalized     = 0.49306394458216907

new families       = reuters, times_of_india
new sourceCount    = 2
new independent    = 1
new consensus      = 0.6437928128919779
new normalized     = 0.48518933918432533
```

Case-D authoritative rank remains 4 and the benchmark selected Top-3 remains unchanged. Aggregator-only Case C remains a single `google_news` family with zero independent evidence.

Falsifier: any known original-publisher story in which `google_news` reappears as an independent publisher family, or any aggregator-only story in which the aggregator family disappears entirely.

### RISK-001 — hidden wall-clock fallback

**State:** RESOLVED/BONDED_BY_EXECUTION.

Local exact-source replay proved explicit zero clock custody and invalid null/string clock rejection.

### RISK-002 — benchmark circularity

**State:** CONTROLLED.

All frozen fixtures declare pre-shadow custody; Cloudflare output was not used to choose expected values. Reference digests were produced by repository/shared execution before any Cloudflare Sections implementation exists.

### RISK-003 — Worker fanout/capacity

**State:** DEFERRED_TO_PR-B.

No Worker exists in PR-A. Under the Issue Appendix-A hypothetical, `41 + 12 = 53 > 50`; a 50-subrequest environment would require sharding under one atomic logical epoch. No source may be deleted to fit the envelope. Actual current Cloudflare limits must be retrieved and measured in PR-B.

### RISK-004 — full repository validation unavailable in current container

**State:** OPEN TOOLING LIMITATION, EXPLICIT.

Direct checkout failed because external GitHub DNS is unavailable. Therefore `npm lint`, full unit suite, build and full certification remain `NOT_RUN`. The dependency-free replay authority was reconstructed from exact GitHub source content and executed independently with Node; this does not convert the unavailable repository-wide commands into PASS.

## Validation ledger

| Check | Status | Observation | Oracle | Basis / limitation |
|---|---|---|---|---|
| live `main` grounding | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | `c37cc142...` unchanged |
| PR #494 state | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | open, mergeable, ready for review |
| review/requested-change scan | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | no reviews/comments pending at reconciliation |
| 10-section / 41-lane registry | PASS | LOCAL_EXECUTION | AUTHORITATIVE_REFERENCE | exact GitHub-sourced registry authority reproduces frozen fixture |
| registry semantic digest | PASS | LOCAL_EXECUTION | AUTHORITATIVE_REFERENCE | exact `d6e8c3d...e96716` |
| registry narrowing/tier/topic fail-closed | PASS | LOCAL_EXECUTION | IMPLEMENTATION_COUPLED | negative mutations rejected |
| exact frozen input contract | PASS | LOCAL_EXECUTION | IMPLEMENTATION_COUPLED | clock, digest, sensitive evidence, anti-circularity tested |
| order-sensitive input digest | PASS | LOCAL_EXECUTION | IMPLEMENTATION_COUPLED | reversed section order changes digest |
| shared replay evaluator | PASS | LOCAL_EXECUTION | IMPLEMENTATION_COUPLED | exact module slice executes production ranker path |
| A-O deterministic repeat | PASS | LOCAL_EXECUTION | IMPLEMENTATION_COUPLED | repeated evidence exactly equal |
| frozen candidate population | PASS | LOCAL_EXECUTION | AUTHORITATIVE_REFERENCE | 19 raw -> 18 candidates |
| frozen classification/admission boundaries | PASS | LOCAL_EXECUTION | AUTHORITATIVE_REFERENCE | benchmark expectations matched |
| Case-D publisher-family regression | PASS | LOCAL_EXECUTION | AUTHORITATIVE_REFERENCE | exactly Reuters + Times of India |
| Top Feed one-independent-hit arithmetic | PASS | LOCAL_EXECUTION | ANALYTICAL | consensus `0.8270874753469162` |
| frozen decision digests/order | PASS | LOCAL_EXECUTION | AUTHORITATIVE_REFERENCE | all pinned values reproduced |
| reconstructed module syntax | PASS | LOCAL_EXECUTION | IMPLEMENTATION_COUPLED | `node --check` on replay slice |
| browser serving authority unchanged | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | loader still uses `/newsdata/sections_latest.json` |
| workflow absence from PR | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | no `.github/workflows/**` changed |
| focused Vitest command | NOT_RUN | NOT_OBSERVED | NONE | full repository checkout/dependencies unavailable |
| npm lint | NOT_RUN | NOT_OBSERVED | NONE | full repository checkout/dependencies unavailable |
| full unit suite | NOT_RUN | NOT_OBSERVED | NONE | full repository checkout/dependencies unavailable |
| build | NOT_RUN | NOT_OBSERVED | NONE | full repository checkout/dependencies unavailable |
| full certification gate | NOT_RUN | NOT_OBSERVED | NONE | full repository checkout/dependencies unavailable |
| GitHub Actions | NOT_APPLICABLE | NOT_OBSERVED | NONE | Issue prohibits relying on new Actions workflow |
| Wrangler dry-run | NOT_APPLICABLE | NOT_OBSERVED | NONE | PR-B scope |
| actual Worker capacity | NOT_RUN | NOT_OBSERVED | NONE | PR-B scope |

A first local assertion invocation from the wrong working directory failed before product execution; rerunning the same harness from its intended root passed. This is recorded as harness invocation error, not product FAIL or PASS.

## Negative assurance

The following remain unchanged and outside PR-A:

```text
.github/workflows/**
src/adapters/sectionsSnapshotLoader.js
browser VITE configuration
production browser serving authority
Top Stories weights
Top Stories thresholds
Top Stories public-interest taxonomy/source tiers
public/newsdata/sections_latest.json
cloudflare/daily-digest-api/**
cloudflare/upahead-dataset-api/**
Cloudflare Sections Worker/D1
```

No Cloudflare browser production use is introduced.

## Changed-file ledger — reconciled

```text
reports/NW-CF-HYBRID-001A_workreport.md                                       UPDATE recovery/evidence
scripts/top-stories-shadow/fixtures/nw-cf-hybrid-001a-benchmark.json           ADD    frozen A-O input + exact oracle
scripts/top-stories-shadow/fixtures/nw-cf-hybrid-001a-source-registry-authority.json ADD frozen registry oracle
scripts/top-stories-shadow/sectionsShadowAuthorityVersions.mjs                 ADD    shared version envelope
scripts/top-stories-shadow/sectionsShadowEvaluator.mjs                         ADD    deterministic evaluator/evidence
scripts/top-stories-shadow/sectionsShadowInputEpoch.mjs                        ADD    frozen input contract
scripts/top-stories-shadow/sectionsShadowSourceRegistry.mjs                    ADD    semantic registry authority
src/services/topStories/topStoriesEventClassifier.js                           UPDATE executable version export only
src/services/topStories/topStoriesRanker.js                                    UPDATE explicit-zero clock + rank evidence/version
src/services/topStories/topStoriesSectionsShadowAuthority.cert.test.js         ADD    deterministic authority certification
src/services/topStories/topStoriesSectionsSourceRegistry.cert.test.js          ADD    registry authority certification
src/services/topStories/topStoriesSignals.js                                   UPDATE explicit-zero clock custody
src/services/topStories/topStoriesSourceIdentity.js                            UPDATE publisher-family wrapper boundary/version
```

All 13 PR paths are explained. There is no workflow/browser/Cloudflare-package file in the diff.

## Coordination

```text
FILE_OVERLAP=SAFE
AUTHORITY_OVERLAP=SAFE_WITH_LEGACY_AWARENESS
DEPENDENCY_OVERLAP=SAFE
```

Legacy Top Stories PRs remain awareness-only and are not treated as authority. `main` did not move during this phase.

## D1 / PR-B invariants carried forward

PR-B must preserve the planned append-only epoch custody:

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
create logical run
-> acquire every configured lane disposition
-> build complete epoch
-> validate
-> write STAGED snapshot/items
-> verify cardinality + digests
-> mark COMMITTED
-> atomically advance current pointer
```

A STAGED/partial epoch must never be served as latest. Retry must be idempotent under stable epoch/lane/item identities.

## Appendix A — takeover qualification

### A1 — The extra candidate

188 vs 189 is net `+1` (`0.532%`). Top-10 intersection 9/10 = 90%; Jaccard = `9/11 = 81.82%`; symmetric difference = 2. Identical input evidence rules out acquisition drift. Compare candidate-build identities/trace first, then normalization digest; classify first deterministic divergence or `UNKNOWN_DRIFT` fail-closed.

### A2 — Are these really three sources?

Baseline path could count Reuters + Google News + Times of India. PR-A authority makes Google News wrapper provenance non-independent when publisher identity exists. Correct Case-D publisher count=2, corroborating=1, independent evidence without Top Feed=1, consensus=`0.6437928128919779`; one independent Top Feed family makes independent count=2 and consensus=`0.8270874753469162`.

### A3 — Worker died at 201

If S101 expected 10 sections/284 rows but fails at 7/201, latest remains committed S100. S101 is STAGED/FAILED RCA evidence only; deficit 3 sections/83 rows. Pointer moves only after full cardinality/digest verification and COMMIT.

### A4 — Forty-one feeds fit until redirects

`41 + 12 = 53`; under envelope 50, single-invocation acquisition is unqualified by 3 subrequests (106%). Shard acquisition under one logical epoch/barrier; all 41 lanes retain explicit dispositions; no source deletion.

### A5 — 4.8-hour Seattle public safety

Freshness=0.60; contributions `25.20 + 32.64 + 0 + 0 + 3.84 + 2.52 = 64.20`; normalized `64.20/122 = 0.52623`. It clears secondary score threshold 0.40 but current mature/non-local critical admission still rejects because location 0.42 < 0.82, independent evidence absent and quality 0.48 < 0.95; reason `mature_nonlocal_critical_without_evidence`.

**Takeover qualification state:** PASS for PR-A authority. Further production implementation belongs to PR-B after the PR-A merge boundary is resolved.

## Takeover / grounding chain

| Session | Basis | Durable end/basis | Outcome |
|---|---|---|---|
| Phase-A bootstrap | `c37cc142...` | `0e3487e...` | grounding, overlap, work report, draft PR |
| Phase-A implementation | `0e3487e...` | `11746e8...` | registry/input/evaluator/source-family/A-O implementation |
| AUTO hardening | `11746e8...` | `fe9bebd...` | version custody, sensitive/order digest, coverage hardening, registry fixture |
| AUTO validation/closure | `fe9bebd...` | report basis `cc3226c...` | exact-source local replay, frozen digests, unconditional oracle, ready-for-review |

## EXACT_NEXT_ACTION

**OWNER DECISION REQUIRED:** authorize merge of PR #494, or request specific changes. AUTO MODE cannot infer merge authority. After an authorized merge, re-ground `main` and start Issue #493 PR-B (`Cloudflare Sections Worker + isolated D1 + atomic shadow epochs`) as a new coherent PR. Do not begin PR-B on unmerged PR-A authority.
