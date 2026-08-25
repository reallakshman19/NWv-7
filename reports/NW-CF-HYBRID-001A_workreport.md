# NW-CF-HYBRID-001A — living work report

## Recovery header

```text
WORK_ID=PR494
ISSUE=493
PR=494
BRANCH=agent/nw-cf-hybrid-001a-replay-authority
BASE_SHA=c37cc142e72945dd247d4d209c0378ed7c67447f
LAST_VERIFIED_REMOTE_MAIN_SHA=c37cc142e72945dd247d4d209c0378ed7c67447f
REPORT_BASIS_HEAD=0e3487ed8b9c7cc4f8a9e70fec580ed0165d8a4a
WORK_INTENT=IMPLEMENT
REPOSITORY_STATE=OPEN_DRAFT_PR
MUTATION_AUTHORITY=WRITE_ALLOWED
CRITICALITY=DATA_PLANE_CRITICAL/RANKING_AUTHORITY_CRITICAL
COORDINATION_STATE=SAFE_WITH_LEGACY_AWARENESS
AUTO_MODE=OFF
OWNER_MERGE_AUTHORITY=REQUIRED
```

Draft PR: #494 — `NW-CF-HYBRID-001A: Freeze Sections replay and shared authority`.

## Handover snapshot

Phase 0 takeover/anti-overlap grounding is complete. `main` remains `c37cc142e72945dd247d4d209c0378ed7c67447f`, including merged PR #492 publisher-family canonicalization. Open PRs #386/#387 are stale legacy Top Stories work against old bases and do not claim this phase's files; #396 is Up Ahead. Exact-file overlap is absent.

Current browser serving authority remains `/newsdata/sections_latest.json`. Baseline Cloudflare packages are Daily Digest and Up Ahead only; no Sections Worker/D1 exists. PR #494 is Phase A only: shared replay authority + frozen benchmark. It does not alter serving authority.

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

Baseline runtime contracts:

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

Registry version is `section-source-policy-v1`. Baseline has no published semantic SHA-256 registry digest. Git blob SHA `d0f08b626ffca5be5a7b9311bf457c74580943a1` is recorded only as Git object identity, not mislabeled as the required semantic digest.

### Shared ranking authority

Baseline `evaluateTopStories()` owns candidate construction, classification/signals, scoring, admission and selection. Existing `scripts/top-stories-shadow/snapshotBuilder.mjs` already invokes that shared executable with explicit `nowMs` and emits input/normalization/policy digests plus candidate and selection traces. PR-A will reuse these authorities rather than copy policy into future Worker code.

## Phase-A implementation plan

1. Add strict `nw-sections-shadow-input-epoch/v1` with explicit finite `nowMs`, source-registry version/digest, sanitized inputs, settings/source health and anti-circularity metadata.
2. Add a pure source-registry authority helper: canonical registry value, 10/41 conservation, SHA-256 digest; no second feed list.
3. Add a shared deterministic evaluator that validates the epoch, calls existing `evaluateTopStories()`, and emits exact candidate/source-family/classification/admission/score/rank/selection evidence plus normalization/policy/output digests.
4. Close the residual #492 evidence boundary: Google News acquisition wrapper must not count as an independent publisher when a known non-aggregator publisher exists. Preserve raw acquisition provenance separately.
5. Freeze synthetic benchmark A–O before any Cloudflare observation with `frozenBeforeShadowObservation=true` and `shadowOutputUsedToChooseExpected=false`.
6. Add focused certification for schema fail-closed behavior, explicit clock custody, registry conservation, publisher-family semantics, deterministic equality, no input mutation and no browser/workflow cutover.
7. Keep PR #494 draft until Phase-A validation and review reconciliation are complete. No merge without owner authorization.

## Item register

### ISS-001 — semantic source-registry digest absent

**State:** OPEN, target RESOLVED_BY_PR-A.

Baseline has `policyVersion` and Git identity but no canonical semantic SHA-256 contract suitable for repository/Worker compatibility checks.

### ISS-002 — Google News wrapper can inflate publisher evidence

**State:** OPEN, target RESOLVED_BY_PR-A.

Current primary-family logic correctly prefers Reuters over `sourceGroup=google_news_oman` and collapses TOI aliases. But raw `allSources` is independently canonicalized, so:

```text
source=Reuters
sourceGroup=google_news_oman
allSources=[Reuters, Google News Oman, TOI, Times of India]
```

currently yields `reuters`, `google_news`, `times_of_india`. Here `google_news` is acquisition provenance, not an independent publisher. This can inflate consensus and mature-critical evidence qualification.

### RISK-001 — hidden wall clock in deterministic replay

Frozen epoch will require explicit finite `nowMs`; certification will remove/mutate it and require fail-closed behavior.

### RISK-002 — benchmark circularity

Expected semantics are frozen from repository reference/analytical invariants before Cloudflare observation. Cloudflare output may never choose expected values.

### RISK-003 — Worker fanout capacity

Actual Cloudflare plan/runtime capacity remains `NOT_RUN` in Phase A. The Appendix-A hypothetical `41 + 12 = 53 > 50` proves a one-invocation design would fail under that envelope. PR-B must measure actual current limits and shard if required; deleting feeds is forbidden.

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

## Frozen benchmark inventory

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

## Validation ledger

| Check | Status | Observation | Oracle | Basis / limitation |
|---|---|---|---|---|
| live `main` grounding | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | `c37cc142...` |
| open overlap gate | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | no exact Phase-A claim |
| 10-section / 41-lane recount | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | source registry |
| collector retention/backfill/timestamps | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | reference collector |
| browser serving authority unchanged at baseline | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | static loader path |
| semantic source-registry SHA-256 | NOT_RUN | NOT_OBSERVED | NONE | baseline authority absent |
| focused Vitest | NOT_RUN | NOT_OBSERVED | NONE | implementation pending |
| npm lint | NOT_RUN | NOT_OBSERVED | NONE | implementation pending |
| unit suite | NOT_RUN | NOT_OBSERVED | NONE | implementation pending |
| build | NOT_RUN | NOT_OBSERVED | NONE | implementation pending |
| full certification | NOT_RUN | NOT_OBSERVED | NONE | implementation pending |
| Wrangler dry-run | NOT_APPLICABLE | NOT_OBSERVED | NONE | Worker is PR-B |
| actual Worker capacity | NOT_RUN | NOT_OBSERVED | NONE | deployment gate for PR-B |

No unexecuted check is represented as PASS.

## Negative assurance

PR-A must not change:

```text
.github/workflows/**
src/adapters/sectionsSnapshotLoader.js
browser VITE configuration
production serving authority
Top Stories weights / thresholds / event taxonomy / source tiers
public/newsdata/sections_latest.json
Daily Digest package/storage
Up Ahead package/storage
```

## Changed-file ledger

```text
reports/NW-CF-HYBRID-001A_workreport.md   ADD/UPDATE   living recovery record
```

No production source has yet changed at this checkpoint.

## Coordination

```text
FILE_OVERLAP=SAFE
AUTHORITY_OVERLAP=SAFE_WITH_LEGACY_AWARENESS
DEPENDENCY_OVERLAP=SAFE
```

Re-ground `main` before handover/merge recommendation.

## Appendix A — takeover qualification

### A1 — The extra candidate

188 vs 189 = net `+1` (`0.532%`). Top-10 intersection 9/10 = 90%, Jaccard `9/11 = 81.82%`, symmetric difference 2; deterministic parity still FAILS. Inspect `candidateBuildTrace` / dedupe identities first, then `normalizationDigest`. Identical input evidence means it cannot be `ACQUISITION_DRIFT`; classify at the first deterministic divergence or fail closed `UNKNOWN_DRIFT`.

### A2 — Are these really three sources?

Baseline currently sees `{reuters, google_news, times_of_india}`: source count 3, corroborating 2, extra cluster `(5-3)*0.5=1.0`, Top Feed `1*1.5=1.5`, independent evidence 3, raw consensus 4.5, score `ln(5.5)/ln(7) ~= 0.8761`. When Google News is only acquisition wrapper this is wrong; publisher evidence should be Reuters + Times of India, with wrapper retained as provenance. PR-A freezes this regression.

### A3 — Worker died at 201

S101 expected 10/284 but failed 7/201; deficit 3 sections/83 rows. `/api/shadow/sections/latest` must still return S100. S101 stays STAGED/FAILED; partial evidence is retained for RCA only. Retry is idempotent under stable epoch/lane/item keys; pointer moves only after complete cardinality/digest verification and COMMIT.

### A4 — Forty-one feeds fit until redirects

`41 + 12 = 53`, envelope 50: over by 3, 106%; single invocation unqualified. Use bounded acquisition shards with one logical epoch and barrier/finalizer. All 41 lanes end in explicit dispositions; shards never publish independently; no source deletion.

### A5 — 4.8-hour Seattle public safety

Freshness `0.60`. Contributions: `25.20 + 32.64 + 0 + 0 + 3.84 + 2.52 = 64.20`; max 122; normalized `0.52623`. Secondary threshold 0.40, margin `+0.12623`. Nevertheless current mature/non-local critical gate rejects: location `0.42 < 0.82`, no independent evidence, source quality `0.48 < 0.95`; reason `mature_nonlocal_critical_without_evidence`. Diagnose divergence in order: acquisition/input -> source/geography -> classification -> scoring -> admission -> selection.

**Takeover qualification:** PASS for live-source knowledge. Implementation evidence remains pending.

## Takeover chain

| Agent/session | Role | Start basis | End head | Work performed | Next action |
|---|---|---|---|---|---|
| current session | Phase-A implementer | `c37cc142...` | `0e3487e...` | grounded issue/repo, overlap, call paths, registry, baseline defects; opened draft PR #494 | implement shared contracts + benchmark |

## EXACT_NEXT_ACTION

Implement the frozen input/source-registry/evaluation contracts and publisher-family regression on PR #494, then add A–O benchmark certification and run/observe validation without changing browser/workflow authority.
