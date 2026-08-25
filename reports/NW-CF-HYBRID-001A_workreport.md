# NW-CF-HYBRID-001A — living work report

## Recovery header

```text
WORK_ID=WIP-NW-CF-HYBRID-001A
ISSUE=493
PR=UNALLOCATED
BRANCH=agent/nw-cf-hybrid-001a-replay-authority
BASE_SHA=c37cc142e72945dd247d4d209c0378ed7c67447f
LAST_VERIFIED_REMOTE_MAIN_SHA=c37cc142e72945dd247d4d209c0378ed7c67447f
REPORT_BASIS_HEAD=c37cc142e72945dd247d4d209c0378ed7c67447f
WORK_INTENT=IMPLEMENT
REPOSITORY_STATE=NO_PR
MUTATION_AUTHORITY=WRITE_ALLOWED_AFTER_PHASE0
CRITICALITY=DATA_PLANE_CRITICAL/RANKING_AUTHORITY_CRITICAL
COORDINATION_STATE=SAFE_WITH_LEGACY_AWARENESS
AUTO_MODE=OFF
OWNER_MERGE_AUTHORITY=REQUIRED
```

Verified against live GitHub state on 2026-08-25 before production mutation.

## Handover snapshot

Phase 0 takeover and anti-overlap grounding is complete. Current `main` remains the Issue #493 baseline `c37cc142e72945dd247d4d209c0378ed7c67447f`, the squash/merge result containing PR #492 publisher-family canonicalization. No open PR claims the planned Phase-A replay/authority files. Legacy Top Stories PRs #386/#387 remain open against old bases and are treated as awareness-only; PR #396 is an Up Ahead workstream. Exact-file overlap for this phase is not present.

The current browser serving authority remains `/newsdata/sections_latest.json`. Cloudflare has no Sections package on baseline: only `cloudflare/daily-digest-api` and `cloudflare/upahead-dataset-api` exist. This phase does not create the Worker or D1 database; it freezes the shared deterministic authority and benchmark that PR-B must consume.

## Ground truth

### Browser / Hybrid runtime trace

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

Observed baseline contracts:

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

`src/adapters/sectionsSnapshotLoader.js` and browser-serving authority are forbidden from change in this phase.

### Reference acquisition trace

```text
config/section_sources.json
  -> scripts/section_source_policy.py
  -> scripts/fetch_sections_stories.py
  -> public/newsdata/sections_latest.json
```

Collector semantics observed on baseline:

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

Registry lane recount:

```text
topStories     5
india          4
tn             3
trichy         4
muscat         5
world          4
business       5
technology     3
sports         4
entertainment  4
TOTAL         41
```

Registry version is `section-source-policy-v1`. Baseline has no published semantic SHA-256 registry digest authority. The file Git blob SHA is `d0f08b626ffca5be5a7b9311bf457c74580943a1`; it must not be mislabeled as the required semantic registry digest. PR-A will add deterministic registry digest construction from the canonical registry value.

### Shared executable ranking authority

Baseline `evaluateTopStories()` already centralizes candidate construction, scoring, admission and selection. The current shadow `snapshotBuilder.mjs` calls that same executable with an explicit `nowMs` derived from metadata and already emits:

```text
inputDigest
normalizationDigest
policyDigest
candidateBuildTrace
selectionTrace
candidate evidence
ranked/displayed identities
```

PR-A will reuse rather than duplicate:

```text
src/services/topStories/topStoriesRanker.js
src/services/topStories/topStoriesPolicy.js
src/services/topStories/topStoriesEventClassifier.js
src/services/topStories/topStoriesSignals.js
src/services/topStories/topStoriesEvidenceAdmission.js
src/services/topStories/topStoriesScoreBreakdown.js
src/services/topStories/topStoriesCandidates.js
src/services/topStories/topStoriesSelection.js
src/services/topStories/topStoriesSourceIdentity.js
src/services/topStories/topStoriesTopFeedSignals.js
scripts/top-stories-shadow/canonicalJson.mjs
scripts/top-stories-shadow/normalizationDigest.mjs
```

No Worker-local copy of weights, thresholds, event regexes, source aliases or diversity policy is authorized.

## Phase-A implementation plan

1. Add `nw-sections-shadow-input-epoch/v1` as a strict frozen replay contract with explicit `nowMs`, source-registry version/digest, sanitized section/top-feed inputs, settings/source-health evidence and anti-circularity flags.
2. Add a shared source-registry authority helper that canonicalizes the imported registry, counts all configured lanes and derives the SHA-256 digest without a second feed table.
3. Add one shared deterministic evaluator that validates the epoch, executes `evaluateTopStories()` with the frozen clock, and publishes candidate/source-family/classification/admission/score/rank/selection evidence plus normalization, policy and decision-output digests.
4. Correct the residual #492 evidence boundary: a Google News acquisition wrapper must not survive as independent publisher evidence when a known non-aggregator publisher family exists. Raw acquisition provenance remains available; publisher evidence is canonical-family-only.
5. Freeze a synthetic deterministic benchmark corpus before any Cloudflare observation, covering the A–O cases required by Issue #493 and explicitly recording `frozenBeforeShadowObservation=true` and `shadowOutputUsedToChooseExpected=false`.
6. Add focused certification for schema fail-closed behavior, explicit clock custody, source-registry conservation, publisher-family semantics, deterministic output/digest equality, no input mutation and no browser/workflow cutover.
7. Open a draft PR titled `NW-CF-HYBRID-001A: Freeze Sections replay and shared authority` and migrate this work report from WIP to the assigned PR number.

## Item register

### ISS-001 — no semantic source-registry digest authority

**Status:** OPEN → target RESOLVED_BY_PR-A.

Baseline has registry `policyVersion` and Git object identity but no deterministic semantic SHA-256 digest contract suitable for repository/Worker compatibility checks.

### ISS-002 — Google News wrapper can inflate publisher evidence

**Status:** OPEN → target RESOLVED_BY_PR-A.

Current `getStorySourceFamily()` correctly prefers Reuters over `sourceGroup=google_news_oman`; aliases such as TOI/Times of India also collapse. However `getStorySourceFamilies()` independently canonicalizes raw `allSources`, so this payload:

```text
source=Reuters
sourceGroup=google_news_oman
allSources=[Reuters, Google News Oman, TOI, Times of India]
```

currently yields `reuters`, `google_news`, `times_of_india`. `google_news` is acquisition provenance here, not an independent publisher. This can inflate consensus and can also satisfy mature critical-event evidence gates incorrectly.

### RISK-001 — deterministic executor accidentally falls back to wall clock

Mitigation: frozen epoch requires a finite explicit `nowMs`; the new evaluator passes it through both input and evaluator options and certification mutates/removes it to prove fail-closed behavior.

### RISK-002 — benchmark circularity

Mitigation: benchmark metadata is frozen before any Cloudflare observation and expected semantics are derived only from the repository reference authority / analytical invariants. Cloudflare output is forbidden from choosing expected values.

### RISK-003 — source fanout exceeds a future Worker envelope

Baseline actual Cloudflare plan/subrequest envelope is NOT_RUN in Phase A. Appendix A scenario `41 + 12 = 53 > 50` proves that a single invocation would be unqualified under that envelope. PR-B must use measured current plan/runtime data and bounded sharding if needed; no source deletion is allowed.

## D1 proposal carried forward to PR-B

Append-only logical epoch custody remains:

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
-> mark COMMITTED
-> atomically move current pointer
```

No partial/STAGED epoch may become current.

## Frozen benchmark inventory

Planned fixture cases required by Issue #493:

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
N qualified public_safety critical event
O routine business / sports / entertainment low-interest events
```

Expected-output custody must be frozen before Cloudflare production observation.

## Validation ledger

| Check | Status | Observation | Oracle | Basis / limitation |
|---|---|---|---|---|
| live `main` grounding | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | GitHub current main = `c37cc142...` |
| open PR / issue overlap | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | no exact Phase-A file claim; legacy #386/#387 awareness only |
| 10-section / 41-lane recount | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | `config/section_sources.json` |
| collector retention/backfill/timestamp semantics | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | `fetch_sections_stories.py` |
| browser static serving authority unchanged | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | loader still points to `/newsdata/sections_latest.json` |
| source-registry semantic SHA-256 | NOT_RUN | NOT_OBSERVED | NONE | authority absent on baseline; PR-A target |
| npm lint | NOT_RUN | NOT_OBSERVED | NONE | no implementation checkpoint yet |
| focused Vitest | NOT_RUN | NOT_OBSERVED | NONE | no implementation checkpoint yet |
| unit suite | NOT_RUN | NOT_OBSERVED | NONE | no implementation checkpoint yet |
| build | NOT_RUN | NOT_OBSERVED | NONE | no implementation checkpoint yet |
| full certification | NOT_RUN | NOT_OBSERVED | NONE | no implementation checkpoint yet |
| Cloudflare Wrangler dry-run | NOT_APPLICABLE | NOT_OBSERVED | NONE | Worker is PR-B scope |
| actual Worker subrequest plan/runtime capacity | NOT_RUN | NOT_OBSERVED | NONE | must be measured before PR-B deployment |

No unexecuted check is represented as PASS.

## Negative assurance

Must remain unchanged in PR-A:

```text
.github/workflows/**
src/adapters/sectionsSnapshotLoader.js
browser VITE configuration
production browser serving authority
Top Stories weights and thresholds
event taxonomy/public-interest values
source tiers
selection diversity limits
public/newsdata/sections_latest.json
Daily Digest package/storage
Up Ahead package/storage
```

## Changed-file ledger

Current branch mutation at this checkpoint:

```text
reports/NW-CF-HYBRID-001A_workreport.md   ADD   living recovery/grounding record
```

No production source file has been changed yet.

## Coordination

```text
FILE_OVERLAP=SAFE
AUTHORITY_OVERLAP=SAFE_WITH_LEGACY_AWARENESS
DEPENDENCY_OVERLAP=SAFE
```

Legacy open PRs are not used as ground truth and will not be merged/rebased into this work. Re-ground against `main` before PR creation and again before handover.

## Appendix A — takeover qualification

### A1 — The extra candidate

Reference 188 vs Cloudflare 189 is a net `+1` candidate (`1/188 = 0.532%`). Top-10 intersection is 9/10 = 90%; Jaccard is `9/11 = 81.82%`; symmetric difference is two Top-10 identities. Deterministic parity still FAILS. Inspect `candidateBuildTrace` and canonical candidate identity/dedupe disposition first, then compare the existing `normalizationDigest`. With identical `inputEvidenceDigest`, registry digest, clock and policy digest this cannot be `ACQUISITION_DRIFT`; classify at the first divergent deterministic stage (`IDENTITY_DRIFT`, `NORMALIZATION_DRIFT`, later stage class, or fail-closed `UNKNOWN_DRIFT`).

### A2 — Are these really three sources?

Baseline code canonicalizes the given payload to `{reuters, google_news, times_of_india}`. It therefore computes source count 3, corroborating count 2, extra cluster evidence `(5-3)*0.5 = 1.0`, one Top Feed contribution `1*1.5 = 1.5`, independent-evidence count `2+1 = 3`, raw consensus evidence `4.5`, and consensus `ln(5.5)/ln(7) ~= 0.8761`. That result is semantically unacceptable when Google News Oman is only the acquisition wrapper. Correct publisher evidence is Reuters + Times of India, with Google News retained only as provenance. PR-A will freeze this as a regression case.

### A3 — Worker died at item 201

If S100 is current and S101 is expected to contain 10 sections / 284 rows but fails after 7 / 201, `GET /api/shadow/sections/latest` must return S100. S101 remains STAGED/FAILED; deficit = 3 sections / 83 rows. Partial fetch/item evidence remains append-only RCA evidence but is never reachable through the current pointer. Retry is keyed to the same logical epoch/lane/item identities so it is idempotent; COMMIT and pointer swap occur only after full cardinality/digest verification.

### A4 — Forty-one feeds fit until redirects

`41 + 12 = 53` subrequests. With envelope 50, the invocation is over by 3 and operates at 106% of the allowed envelope; single-invocation acquisition is not qualified. Use bounded acquisition shards sharing one logical epoch ID and an epoch barrier/finalizer. Every one of the 41 lanes must resolve to an explicit disposition. Shards can stage evidence but cannot publish independently. No lower-tier source may be dropped to make capacity arithmetic fit.

### A5 — 4.8-hour Seattle public-safety story

Freshness = `1 - 4.8/12 = 0.60`. Contributions: freshness `0.60*42=25.20`; public interest `0.96*34=32.64`; consensus `0`; breaking/live `0`; source quality `0.48*8=3.84`; location `0.42*6=2.52`; penalty `0`. Raw = `64.20`; max weighted score `122`; normalized = `64.20/122 ~= 0.52623`. Age band is secondary (4h < 4.8h <= 8h), numeric threshold 0.40, margin about +0.12623. However the current mature/non-local critical gate rejects it because location 0.42 < 0.82, independent evidence is absent, and source quality 0.48 < 0.95; expected reason is `mature_nonlocal_critical_without_evidence`. Repository/Cloudflare divergence must be isolated in order through input/acquisition, source/geography normalization, event classification, score arithmetic, admission, then selection.

Qualification verdict: PASS for takeover knowledge. These answers are grounded to live baseline source, but implementation evidence for PR-A remains pending until code and focused tests exist.

## EXACT_NEXT_ACTION

Implement the Phase-A frozen input/source-registry/evaluation contracts and publisher-family regression on this branch, add the A–O benchmark fixture/certification, then open the required draft PR and migrate this report to its PR number.
