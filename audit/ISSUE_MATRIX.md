# Defect Tracking Matrix

- ID: P001
  Area: Planner classification
  Severity: High
  Owner file(s): src/intelligence/classification.js
  Detection: benchmark offline + planner_edgecases
  Exit gate: planner precision >= 0.85, no regression in smoke suite

- ID: P002
  Area: Market Data Completeness
  Severity: Medium
  Owner file(s): src/services/indianMarketService.js, public/data/market_snapshot.json
  Detection: test_market_snapshot_integrity.mjs
  Exit gate: Snapshot integrity test asserts more than just indices, checks commodities/currencies.

- ID: P003
  Area: Cascading Renders & Static Errors
  Severity: High
  Owner file(s): src/App.jsx, src/components/DebugConsole.jsx, src/pages/TechSocialPage.jsx
  Detection: npm run lint
  Exit gate: 0 errors, 0 warnings

- ID: P004
  Area: Date and Location Routing
  Severity: High
  Owner file(s): src/intelligence/dateAware.js, src/intelligence/locationAware.js
  Detection: benchmark online_input_100.json
  Exit gate: online Up Ahead precision >= 0.82, offline planner recall >= 0.75

- ID: P005
  Area: Static Host Truthfulness
  Severity: Medium
  Owner file(s): src/runtime/runtimeCapabilities.js, src/pages/MainPage.jsx
  Detection: Visual verification and smoke test
  Exit gate: No silent degradation, explicit feature status flags rendered

# ── Insight/Automation audit findings (Phase A4) ──

- ID: I001
  Area: Deploy pipeline — published site never refreshed by prefetch commits
  Severity: Critical
  Owner file(s): .github/workflows/news_prefetch.yml (16-18, 198-222), .github/workflows/deploy.yml (5-10)
  Detection: audit/evidence/A4.1-DEPLOY-01.yaml — GitHub Actions run history (deploy last ran 2026-06-12; data commits hourly) + live Pages snapshot fetch (deployed contentHash 92bee8cd0344 / fetchedAt 2026-06-12 vs repo 5a6820ccd64f / 2026-06-22)
  Root cause: news_prefetch.yml pushes data commits as github-actions[bot] via GITHUB_TOKEN; GITHUB_TOKEN pushes do not raise workflow-trigger events, so deploy.yml's `on: push` never fires for data commits. Site frozen >10 days. Header comment claiming auto-publish is wrong.
  Exit gate: deployed Pages newsdata refreshes within snapshot max-age of each prefetch commit; add post-deploy live-freshness probe cert (a deploy trigger such as PAT push / workflow_run / repository_dispatch is the remediation, tracked separately — no fix during audit)

- ID: I002
  Area: Main/Sections Hybrid mode empties on stale snapshot (no live fallback on static host)
  Severity: High
  Owner file(s): src/adapters/sectionsSnapshotFetcher.js (3-5, 210-272), src/services/rssAggregator.js (570-657), src/data/datasets/sectionsDataset.js (226-249)
  Detection: audit/evidence/A4.2-SECTIONS-02.yaml — selectPrefetchedSectionItems on deploy-aged snapshot returns 0 items/section (control: 15/section when fresh)
  Root cause: 12h snapshot / 36h item freshness gates discard all rows once the deployed snapshot ages out (driven by I001); allowWideFeedFetch=false blocks live RSS fallback → empty Main tab. Staleness is recorded internally but only an empty state reaches the user.
  Exit gate: when snapshot stale on static host, render labelled-stale rows OR an explicit "data delayed" state instead of silent empty; depends on I001 being fixed for the primary symptom

- ID: I003
  Area: news_prefetch scheduled cadence shortfall (OBSERVATION — needs full 14-day table)
  Severity: Low
  Owner file(s): .github/workflows/news_prefetch.yml (24-28)
  Detection: Actions run list shows ~3 runs on 2026-06-22 vs the ~18/day the cron implies (GitHub drops scheduled runs under load). Not yet quantified over 14 days per plan §A4.
  Exit gate: 14-day fetch reliability table produced; if cadence materially below target, document and ticket

# ── Determinism audit findings (Phase A0) ──

- ID: I004
  Area: Virtual-clock injection not fully plumbed (blocks B3 dated-snapshot replay)
  Severity: Low
  Owner file(s): src/insight/src/pipeline/temporalTier.ts (33), src/insight/src/cache/cacheManager.ts (34,69,101,148); partial param exists in src/insight/src/pipeline/normalize.ts (150,242)
  Detection: audit/evidence/A0.1-DET-01.yaml + A0.2-NONDETERMINISM-CATALOGUE.md — output is clock-coupled (real-clock hash 37616c2e99ccca69 ≠ frozen-clock hash d803a31bed6982eb on the same snapshot); a global Date.now shim was required to pin the clock because temporalTier/cacheManager read Date.now() directly.
  User impact: none in production (in-process runs are deterministic); blocks the B3 36h replay benchmark on dated snapshots until a clock is threaded through temporalTier + cacheManager.
  Exit gate: injected clock parameter threaded through temporalTier.computeEventAnchor and cacheManager age checks; B3 replay reproduces a dated snapshot without monkeypatching globals

# NOTE: Phase A0 itself PASSES (determinism established). See audit/evidence/A0.1-DET-01.yaml.
# A0 exit gate MET → A1, A2.x, A3, A4(remainder), A5 are unblocked.

# ── Contract & config audit findings (Phase A1) ──

- ID: I005
  Area: Audit plan quotes stale algorithm constants (doc drift, not code)
  Severity: Info
  Owner file(s): audit/INSIGHT_AUDIT_PLAN.md (§A2.2 thresholds, §A2.4 SAME_EVENT, §A1 cache TTL line)
  Detection: audit/evidence/A1.1-CONTRACT-01.yaml — code DEFAULT_CONFIG (0.96/0.985/0.88, CACHE_TTL 0/1/1.5/2/2.5/3h) matches project tuning docs (action_3_deep.md:450-451, INSIGHT_ANGLE_RCA), but the plan text quotes 0.92/0.85/0.75 and "-4h 2h/-12h 3h/-24h 4h".
  Exit gate: reconcile the plan's quoted constants to the shipped values during A6 (so future auditors test the right numbers)

- ID: I006
  Area: destination_contract_baseline.md is stale (reports fixed gaps as open)
  Severity: Low
  Owner file(s): reports/destination_contract_baseline.md (8,35,99-101); regenerator scripts/audit_destination_contracts.py
  Detection: audit/evidence/A1.1-CONTRACT-01.yaml — baseline claims collector 24h vs adapter 36h GAP, but fetch_sections_stories.py STORY_RETAIN_HOURS=36 already matches the adapter; baseline also warns quality_dashboard.json / insight_quality_report.json are unstaged, but news_prefetch.yml:205 stages both.
  Exit gate: regenerate destination_contract_baseline from current code; CI check that it is not stale

# NOTE: Phase A1 itself PASSES (code config/contract truthfulness sound). See audit/evidence/A1.1-CONTRACT-01.yaml.

# ── Stage-by-stage audit findings (Phase A2) ──

- ID: I007
  Area: scoreBreakdown is not a decomposition of finalParentScore (diagnostics truthfulness)
  Severity: Medium
  Owner file(s): src/insight/src/ranking/ranking.ts (360)
  Detection: audit/evidence/A2.x-STAGE-01.yaml (A2.5) — debug.scoreBreakdown stores raw component values + a finalParentScore key (13 entries); naive sum off by up to 5.983 from the score. The 12-weight model reproduces finalParentScore exactly (Δ 0.000), so the math is right but the breakdown misrepresents it.
  User impact: Ranked/score popups show a "breakdown" that does not add up to the displayed score → diagnostics mislead.
  Exit gate: A5 recomputes each displayed breakdown number; UI either shows weighted contributions that sum to the score, or labels raw signals unambiguously. Dedicated cert (B4 nDCG won't catch).

- ID: I008
  Area: Weak-tree flag is angle-blind (contradicts plan/RCA angle-diversity intent)
  Severity: Medium
  Owner file(s): src/insight/src/tree/treeBuilder.ts (isWeakTree), src/insight/src/pipeline/pipeline.ts (454)
  Detection: audit/evidence/A2.x-STAGE-01.yaml (A2.6) — isWeakTree = (<3 quality children: freshness≥0.45 & authority≥0.45); ignores angle count. cluster_453 (3 children, 1 angle) is non-weak. Plan §A2.6 documents weak = (<3 children OR <2 angles).
  User impact: Single-angle event trees are presented as healthy ("not weak") despite no angle diversity — the exact failure the Angle RCA targeted.
  Exit gate: reconcile weak-tree definition with documented intent (add angle-diversity term) OR update the contract; covered by B4 angle/diversity metric.

- ID: I009
  Area: parent.hiddenDuplicateIds empty — hidden-duplicate provenance not attached to parents (OBSERVATION)
  Severity: Low
  Owner file(s): src/insight/src/pipeline/pipeline.ts (452,573)
  Detection: audit/evidence/A2.x-STAGE-01.yaml (A2.2/A2.6) — 82 stories hidden by the pipeline, but all 10 top parents carry hiddenDuplicateIds=[] (hard-dups removed pre-cluster are never in clusterStoryIds, so the filter yields empty).
  Exit gate: confirm whether usefulVariantRescue/UI actually need per-parent hidden provenance (A2.6 recovery-path check); if so, attach it; else document that provenance lives only in result.hiddenIds.

- ID: I010
  Area: 15.3% of stories are OOV → zero embedding → embedding-invisible (F5-1 quantified)
  Severity: Medium
  Owner file(s): src/adapters/embeddingsAdapter.js (200-term fixed vocab), src/insight/src/dedup/dedup.ts (cosine)
  Detection: audit/evidence/A2.x-STAGE-01.yaml (A2.2) — 134/877 stories have all-zero embeddings on insight_2026-05-19 (contentHash 40f989d5da9c); cosine returns 0 for them, so they cluster only via title/other layers. Disproportionately hyperlocal (Trichy etc.).
  Exit gate: A3 F5-1 closure — measure OOV rate per locale + clustering degradation; expand vocab or add fallback embedding; B4 should track OOV rate.

# NOTE: Phase A2 PASSES with findings (each track has a ternary verdict). F5-5 VERIFIED-FIXED (cosine zero-vector guard). See audit/evidence/A2.x-STAGE-01.yaml.

# ── Known-findings closure (Phase A3) ──

- ID: I011
  Area: Breaking/new-event clusters may not surface promptly (F5-2)
  Severity: High
  Owner file(s): src/insight/src/ranking/ranking.ts (persistence/momentum weights), src/insight/src/pipeline/pipeline.ts (490-493 weak-tree demotion + TOP_PARENTS slice)
  Detection: audit/evidence/A3.1-CLOSURE-01.yaml (F5-2) — ranking weights persistence 0.20 + momentum 0.08 favor established events; a brand-new event forms a weak tree and is demoted below TOP_PARENTS. Mechanism confirmed by code+weights; surfacing latency UNVERIFIED (needs 2-snapshot incremental harness).
  User impact: genuine breaking news can be pushed out of the top-10 and not shown — bad for a news product.
  Exit gate: incremental two-snapshot harness measuring surfacing latency for an injected new event; add a freshness/breaking fast-path or latency cert (B4 cannot catch ordering of unseen events).

# NOTE: Phase A3 PASSES — all F5-x/RCA rows terminal (F5-5 VERIFIED-FIXED; F5-3/F5-6/F5-7 RISK-ACCEPTED; F5-1→I010, F5-2→I011, F5-4 Low; RCA-R1 VERIFIED). See audit/evidence/A3.1-CLOSURE-01.yaml.

# ══════════════════════════════════════════════════════════════════════════════
# UP AHEAD AUDIT (Phases U0–U6) — audit/UPAHEAD_AUDIT_PLAN.md
# ══════════════════════════════════════════════════════════════════════════════

# ── Determinism & clock injection (Phase U0) ──

- ID: I012
  Area: Static-host Up Ahead display projection has no injectable reference clock
  Severity: Low
  Owner file(s): src/services/upAheadService.js (40, 84, 135-139, 162-166, 418, 461, 602, 619), src/viewModels/useUpAheadPageViewModel.js (48, 133, 263, 284, 289, 302, 319, 343, 383-393)
  Detection: audit/evidence/U0.3-CLK-01.yaml + U0.3-CLOCK-CATALOGUE.md — the static path (items[] -> sanitizeUpAheadData -> getVisibleUpAheadProjection, the path most deployed users hit per MODE_MATRIX:29) reads new Date()/Date.now() at 13+ sites with no asOfDate parameter; the U0 harness had to pin the clock with vitest fake timers (global shim) to reproduce a dated projection. Contrast: the LIVE intelligence path threads asOfDate end-to-end and is replayable by injection (verified by execution, audit/evidence/U0.2-INJ-01.yaml).
  User impact: none in production (browser wall clock IS the intended reference; runs are deterministic given it — audit/evidence/U0.1-DET-01.yaml). Impact is on auditability/benchmark replay: the static projection cannot be replayed at a dated reference without controlling the global clock. Mirrors A0/I004, broader scope.
  Exit gate: thread an injected clock (asOfDate/now) through getStartOfTodayMs/generateWeeklyPlan/getVisibleUpAheadProjection age-caps + briefing/evidence, OR the UPAHEAD_BENCHMARK_PLAN replay adopts the documented global-clock shim. No fix during audit.

- ID: I013
  Area: Two divergent date-key conventions — static display files by UTC day, planner/dateAware by local day (U9-3 class)
  Severity: Medium
  Owner file(s): src/services/upAheadService.js (350-351 toISOString().slice(0,10)), src/utils/dateKey.js (11-15 toLocalDateKey), src/utils/plannerStorage.js (35, 65)
  Detection: audit/evidence/U0.4-TZ-01.yaml — same instant 2026-06-25T20:30:00Z (02:00 IST 2026-06-26) files under "2026-06-25" via sanitizeUpAheadData (static display) but "2026-06-26" via toLocalDateKey (planner) under TZ=Asia/Kolkata (keysAgree:false); under TZ=UTC both collapse to "2026-06-25". Reproducer: audit/evidence/u0_clockprobe.harness.test.mjs.
  Root cause: transformPythonItemsToDisplay derives eventDateKey = new Date(eventStartAt).toISOString().slice(0,10) (UTC, TZ-independent) while toLocalDateKey uses process-local getFullYear/Month/Date; they disagree by one day for events timed 00:00–05:29 IST. Contradicts MODE_MATRIX:56 ("Date keys … must stay on YYYY-MM-DD local convention").
  User impact: wrong-day placement for late-night/early-morning IST events (00:00–05:29 IST) — the timeline files them one day early and under a different key than the planner stores them, so the same event can land on two different days across the timeline vs the planner.
  Exit gate: single local-calendar date-key convention across display + planner; U2.3 (extraction) + U2.8 (planner keys) deliver the full verdict, U2.7 covers JS↔Python parity of the convention. No fix during audit.

# NOTE: Phase U0 itself PASSES (determinism established for a fixed (snapshot, clock); live-path asOfDate injection execution-verified). See audit/evidence/U0.1-DET-01.yaml + U0.2-INJ-01.yaml + audit/U0_DETERMINISM_SUMMARY.md.
# U0 EXIT GATE MET → U1, U2.x, U3, U4 are unblocked (U5 needs U2 evidence; U6 closes).

# ── Contract & config audit findings (Phase U1) ──

- ID: I014
  Area: Up Ahead keyword-table contradictions & a dead global negative (U9-2 class)
  Severity: Medium
  Owner file(s): src/config/settings_upahead.js (52,56,58,59,66 keyword lists), src/intelligence/classification.js (9-39 matcher, 49-52+110 signal-strip)
  Detection: audit/evidence/U1.1-KWD-01.yaml + audit/evidence/U1-keyword-collision-report.json — mechanical scan (audit/evidence/u1_keyword_collision_scan.mjs) modeling the SHIPPED matcher (single-word \bword\b, multi-word includes()).
  Root cause: (1) 'webinar' in BOTH events positives and events_negative -> net 0 on a lone match. (2) 'fog' in weather_alerts positives AND global negatives and NOT signal-stripped -> real fog alerts scored +1-0.65=+0.35 (safety-category term eroded). (3) 'launches' in BOTH global negatives and signals -> removeScheduleSignalNegatives strips it every time -> the corporate-launch-PR suppression NEVER fires (dead config). (4) 'trade fair' in events+shopping positives; 7 cross-category co-fire leaks (advisory/streaming/route change/exhibition/sale). NOTE: word-boundary matching NEUTRALIZES the single-token substring class the plan feared (7 inert pairs incl. holi/holiday, review/preview) — U9-2 residual risk is smaller than assumed and confined to multi-word phrases + exact duplicates + the dead negative.
  User impact: weather-fog alerts under-scored; corporate "X launches Y" PR can leak into movies/events pools; cross-category score splits risk mis-routing.
  Exit gate: U2.2 quantifies how many REAL frozen items flip category if each collision is fixed (sizes the risk); fix the contradictions OR document intent; §V4 per-category precision + classification-stability cert.

- ID: I015
  Area: Threshold contract drift — enforced offline planner recall 0.65 vs documented 0.75
  Severity: Medium
  Owner file(s): benchmarks/upahead/thresholds.js (4 plannerRecall 0.65, 7 upAheadRecall 0.75), audit/ISSUE_MATRIX.md P004 (29), scripts/run_upahead_benchmarks.js (102 enforcer)
  Detection: audit/evidence/U1.2-THR-01.yaml — P004 exit gate documents 'offline planner recall >= 0.75' but thresholds.offline.plannerRecall=0.65 (the 0.75 in code is upAheadRecall, a different metric); run_upahead_benchmarks.js:102 asserts planner.recall against 0.65.
  Root cause: documented contract of record (0.75) is not the enforced CI gate (0.65); they disagree by 10 points on the planner surface. All other thresholds match (plannerPrecision 0.85, online precision 0.82, duplicateLeakRate 0.03, falseLocationAcceptance 0.05).
  User impact: a planner-recall regression anywhere in [0.65,0.75) passes CI yet violates the P004 exit gate; planner is a user-data surface, so the gate under-protects the documented bar.
  Exit gate: reconcile thresholds.js and P004 to ONE value before the benchmark baseline is trusted; U3 P004 closure records the CURRENT planner recall against both numbers.

- ID: I016
  Area: Feed registry coverage gap — civic category missing Trichy
  Severity: Low
  Owner file(s): src/intelligence/feedSourceRegistry.js (82-89 civic locationMap)
  Detection: audit/evidence/U1.3-FEED-01.yaml — coverage grid: civic={Chennai,Muscat}; Trichy present in alerts/weather_alerts/shopping/events but absent from civic.
  Root cause: civic omits Trichy though Trichy is a first-class locale (locationLibrary + 4 other categories). (P005 trust-filter regression separately VERIFIED-NOT-PRESENT: registry is all trust:'high' per Agent-10 elevation AND the static filter was loosened from `>=3||==='high'`,slice(2) to `>=2||!=='low'`,slice(3) — Events/Shopping never emptied.)
  User impact: Trichy users get no civic Up Ahead feed content.
  Exit gate: add a Trichy civic feed OR document Trichy civic as unsupported; feed yield/health measured over 14 days in U4.

- ID: I017
  Area: Documentation/locator/comment drift (audit plan + code comments + Agent-10 doc)
  Severity: Info
  Owner file(s): audit/UPAHEAD_AUDIT_PLAN.md (106,154 OFFER_CAMPAIGNS/groupOnlineOffers locators; 96 dedup line range), src/services/upAheadService.js (9 cache cadence comment), agent_instructions/WI_Agent10_UpAhead_Feeds.md (21,66 superseded filter + hardcoded 2025)
  Detection: audit/evidence/U1.5-DDP-01.yaml + audit/evidence/U1.6-MODE-01.yaml
  Root cause: plan cites OFFER_CAMPAIGNS/groupOnlineOffers in deDuplication.js/settings but they live in src/viewModels/useUpAheadPageViewModel.js:173/197; dedup cited :35-42 vs actual :35-44; upAheadService.js:9 comment '6h — aligned to 5x/day pre-fetch cadence' vs MODE_MATRIX:45 'Hourly daytime'; Agent-10 doc shows the pre-fix filter (`>=3||==='high'`, slice 2) and hardcoded 2025 vs current code (`>=2||!=='low'`, slice 3, CURRENT_YEAR). Doc-only; mirrors A1 I005/I006.
  User impact: none (documentation). Risk is auditor/maintainer confusion (testing the wrong locator/number).
  Exit gate: reconcile plan locators + cache-cadence comment during U6; annotate Agent-10 doc as historical.

- ID: I018
  Area: Location alias collision — 'cantonment' generic-word alias (refined by U2.4)
  Severity: Low
  Owner file(s): src/config/locationLibrary.js (15 'cantonment' under Trichy)
  Detection: audit/evidence/U1.4-LOC-01.yaml (catalogue) + audit/evidence/U2.4-LOC-01.yaml (execution) + U2.4-location-probes-report.json
  Root cause: 'cantonment' (Trichy alias) is a generic military-area term -> 'Delhi Cantonment' etc. map to Trichy @0.82 (mechanism-independent; CONFIRMED by execution). U2.4 NULLIFIED the rest of the U1 tail: the matcher uses a word-boundary regex `(^|\s)alias(\s|$)` (NOT substring) for both the 0.95 and 0.82 rungs, so 'omr'/'ecr' inside other words, weather 'hail' vs 'al hail', and unlisted 'X Nagar' do NOT match. Plan §U2.4's "0.82 substring" wording is incorrect (it is word-boundary, non-city alias) -> doc fix folded into I017.
  User impact: any city's cantonment text mis-routes to the Trichy locale (P004 falseLocation surface). Narrow; no contamination seen on the real frozen cycle (0 mismatches / 11 accepts).
  Exit gate: remove/qualify 'cantonment'; benchmark §V4 enforces falseLocationAcceptance 0.05 per locale on a gold set (true rate UNVERIFIED on the date-poor real cycle here).

# NOTE: Phase U1 PASSES with findings (each U1 target has a ternary-verdict evidence record U1.1-U1.6). P005 trust-filter regression VERIFIED-NOT-PRESENT (U1.3-FEED-01). Keyword word-boundary matching neutralizes the U9-2 single-token substring class (U1.1-KWD-01). See audit/evidence/U1.{1-6}-*.yaml + audit/U1_CONTRACT_SUMMARY.md.
# U1 EXIT GATE MET → keyword-collision report delivered (input to U2.2); alias collision catalogue delivered (input to U2.4); threshold/coverage/doc drift ticketed (I014-I018).

# ── Stage-by-stage audit findings (Phase U2 — IN PROGRESS: U2.3 done) ──

- ID: I019
  Area: Static-host Up Ahead carries no event dates (expiry-driven) while the JS engine extracts real ones
  Severity: Medium
  Owner file(s): scripts (Python prefetch date layer — to be pinned in U2.7), src/intelligence/dateAware.js (JS engine, correct), public/data/up_ahead*.json
  Detection: audit/evidence/U2.3-DTE-03.yaml + U2.3-date-battery-report.json — frozen static output up_ahead_2026-06-24.json has dateSource='none' (92/92), dateConfidence='unknown' (92/92), eventStartAt=null (92/92), yet plannerEligible=true (88/92) and expiryAt set (92/92). JS analyzeDateText on the SAME items extracts a real event date for 15/92 (incl. 'Rainbow Pride March on June 28' -> 2026-06-28, 'Madras Art Weekend exhibition' -> 2026-06-26).
  Root cause: static Up Ahead is expiry-windowed (horizon.offerFallbackHours 48 / alertFallbackHours 24), not event-date-driven; the Python prefetch date extraction surfaces 0 dates where the JS engine finds 15. Full root cause is the U2.7 JS<->Python parity deliverable. Also: 88 items are plannerEligible WITHOUT an event date, contradicting the JS eligibility contract (no eventDate -> plannerEligible:false).
  User impact: static-host users (the majority) see genuine upcoming events undated — not sortable by day, not placeable on the 7-day horizon, not addable to the planner with a date.
  Exit gate: U2.7 runs the Python categorizer/date path on the same frozen raw items and quantifies the date-field disagreement per item; reconcile the static date layer to the JS engine OR document the expiry-only design; §V4 extraction-rate + wrong-day strata run on both implementations.

- ID: I020
  Area: Date engine edge-cases — Feb29 silent coercion + two-engine "next week" divergence
  Severity: Low
  Owner file(s): src/intelligence/dateAware.js (32-42 inferYearForShortDate, 77-88 next week), src/utils/dateExtractor.js (61-68 inferYear, 169-175 next week)
  Detection: audit/evidence/U2.3-DTE-04.yaml — '29/02' in non-leap 2026 => 2027-03-01 (JS Date overflow Feb29->Mar1 + year flip, no error/flag); 'next week' at a Sunday ref => dateAware 2026-06-29 vs legacy extractDate 2026-07-06 (7-day disagreement; dateAware uses ((8-getDay())%7)||7, legacy uses 8-getDay()).
  Root cause: invalid-date overflow is unguarded; the two JS date engines use different next-week formulas. Latent because dateAware parsers win ordering, but a concrete consistency gap and a candidate JS<->Python disagreement source.
  User impact: Low — rare Feb29 lands one day off; next-week divergence only bites a direct legacy caller / a Python port that mirrors the legacy formula. Both are wrong-day risks.
  Exit gate: guard Feb29 (reject or flag) ; converge the two next-week formulas OR document which is canonical; U2.7 checks the Python port's formula. Also document the (correct, consistent) DMY policy so future tuning doesn't add an MDY fallback.

- ID: I021
  Area: Intra-category positive double-count inflates confidence + weakens Phase-B
  Severity: Low
  Owner file(s): src/config/settings_upahead.js (49 movies positives 'release' & 'release date'), src/intelligence/classification.js (107-152 scoreCategory, 168-172 Phase-B)
  Detection: audit/evidence/U2.2-CLS-01.yaml + U2.2-classification-report.json — 'release date' fires BOTH the multi-word positive 'release date' AND the single-word positive 'release' (\brelease\b inside it) -> positive=2 for one concept; confidence 0.5 vs 0.25. B-ESCAPE shows the inflation can lift a score past the 2.25 Phase-B ceiling.
  Root cause: overlapping positives where a single token is a subset of a multi-word positive; matching counts both. Phase-B (planner-pollution guard) keys on score, so inflation weakens it.
  User impact: marginal items gain confidence and can clear planner/eligibility thresholds and escape Phase-B suppression -> P001 planner-precision erosion. Low (one clear instance found; magnitude small).
  Exit gate: de-duplicate overlapping positives (drop bare 'release', or longest-match-wins in countMatches); §V4 confidence-calibration + per-category precision guard.

- ID: I022
  Area: JS<->Python classification divergence on real items (U9-7) — static vs live are different products
  Severity: Medium
  Owner file(s): src/intelligence/classification.js (JS), scripts (Python prefetch categorizer — pin in U2.7), public/data/up_ahead*.json
  Detection: audit/evidence/U2.2-CLS-02.yaml + U2.2-classification-report.json — JS-recomputed category (text-only, category field stripped) agrees with the stored Python category for only 22.8% (21/92). JS sends 65/92 to 'general' that Python filed into alerts/shopping. Quality is per-item mixed (some JS-general correct e.g. 'death toll' news; some wrong e.g. 'Rainbow Pride March' dropped).
  Root cause: the two implementations classify differently; Python is far more permissive on this corpus. NOTE caveat: the JS run was TEXT-ONLY (frozen items lack feed sourceType), so detectBySourceType / source bonuses did not apply -> 22.8% is a LOWER BOUND on agreement; U2.7 refines with full feed context.
  User impact: static-host (majority) and live users can see materially different category assignments for the same items; the static/live divergence is the U9-7 risk quantified.
  Exit gate: U2.7 runs the JS path WITH sourceType on the same frozen raw items, computes per-field (category/date/location) disagreement, and that number decides the §V4 benchmark system-under-test. Reconcile or document the dual-implementation divergence.

- ID: I023
  Area: Weather-alert text gate defeated by keyword-list overlap (precision hole)
  Severity: Medium
  Owner file(s): src/services/upAheadService.js (311-324 isActualWeatherAlertText), src/config/settings_upahead.js (25 ambiguousKeywords, 56 weather_alerts positives)
  Detection: audit/evidence/U2.6-WIN-02.yaml + U2.6-windowing-report.json (CAP-WEATHER-TEXT) — 'Cyber scam warning issued / beware of fraud' (zero weather context) ENTERS the Weather tab.
  Root cause: isActualWeatherAlertText counts substring matches over contextKeywords + ambiguousKeywords + weather_alerts POSITIVES; 'warning'/'alert'/'advisory'/'watch' are in BOTH ambiguousKeywords and the weather positives list, so a SINGLE such word counts as 2 matches and clears minimumMatches:2. Documented ">=2 weather-context keywords" is effectively ">=1 ambiguous word".
  User impact: non-weather "warning/alert/advisory/watch" items (health warning, scam alert, security advisory) are mis-shown as weather alerts -> Weather tab precision hole.
  Exit gate: require >=1 genuine contextKeyword (not just ambiguous), or de-duplicate ambiguous vs positive weather words so one occurrence counts once; §V4 weather-tab precision guard.

- ID: I024
  Area: No upper display window on movies/events/festivals (far-future items pollute the 7-day horizon)
  Severity: Low
  Owner file(s): src/viewModels/useUpAheadPageViewModel.js (350-355 movieCards/festivalCards/eventItems — mapped with no date window)
  Detection: audit/evidence/U2.6-WIN-02.yaml (NO-WINDOW-MOVIES) — a movie dated 5 YEARS in the future appears in movieCards; past-dated items ARE dropped upstream by sanitizeUpAheadData, but future items are unbounded.
  Root cause: getVisibleUpAheadProjection age-filters only alerts/offers/civic; movies/events/festivals get no upper 7/14d bound. Plan §U2.6 "display 14d" is not enforced for these categories on the static path. (Corroborates I019: static Up Ahead is expiry/recency-driven, not a true event horizon.)
  User impact: a release months/years out appears alongside this-week items in the "7-day" Up Ahead; low (data is currently date-poor) but a horizon-correctness gap.
  Exit gate: add an upper display-window bound (14d) to movies/events/festivals; §V4 horizon-window stratum.

