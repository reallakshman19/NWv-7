# NWv-7 — M0 Evidence and Authority Register

**Program:** [#150](https://github.com/reallakshman19/NWv-7/issues/150)  
**Checkpoint:** 2026-10-28, user-authorized M0/M1 review preparation  
**Reference main HEAD:** 3bfbe27127b3a2932ed89139387c4c55b1283395  
**Checkpoint class:** READ-ONLY evidence inventory; this document is submitted on a separate review branch and is **not** a production release.  
**Acceptance:** M0 PARTIAL / NOT SIGNED OFF. Rev 0.2.1 advisory assessment at exact head `8a7cadd...` = PARTIAL / R152-01 & R152-02 PASS_DESIGN_ONLY. Rev 0.2.2 formal non-author GitHub review = PENDING. UNKNOWN means not evidenced, not presumed healthy.

## 1. Current topology and public observables

| Plane | Observed fact and evidence | Status / gap |
| --- | --- | --- |
| Acquisition | [Sections Snapshot Recovery run #40592991774](https://github.com/reallakshman19/NWv-7/actions/runs/40592991774) scheduled 2026-10-27 22:12 UTC, SUCCESS; publisher-date checks and repo bot commit succeeded. | PASS for that **producer execution**, not public delivery. Inter-slot timing/missed-run alerts unresolved. |
| Latest repository snapshot | main 3bfbe271...; public/newsdata/sections_latest.json fetchedAt 2026-10-27T22:12:43.305Z, contentHash 1f10213d83ac, schema 2; 10 sections, quality report WARN on Entertainment's single canonical source group. | QUALIFIED REPOSITORY DATA; public publication NOT PROVEN. |
| Last published application Pages | [Deploy #40356852197](https://github.com/reallakshman19/NWv-7/actions/runs/40356852197) 2026-10-26 16:12Z, source e0669947a907c410110a9476c16598095b14b31d. Build/Deploy/Pages-provenance and World Chromium PASS at 16:14Z (10 World cards, status ok). | HISTORICAL AT-INSTANT PASS only, no continuous guarantee, no proven India/TN/Muscat/Digest acceptance. |
| Public GitHub Pages fallback | Read-only [source probe #39216612994 attempt 3](https://github.com/reallakshman19/NWv-7/actions/runs/39216612994) at 2026-10-28T03:01:52.250Z: public /newsdata/sections_latest.json fetchedAt 2026-10-26T12:59:07.302Z (hash e04187966dbd in exact deployed source), ~2,283 min old, World 30 stored, 0 fresh World. | FAIL public freshness. Diverges from newer repository candidate. |
| Cloudflare public selected preview | Same probe: selected live-1792774800000 fetchedAt 2026-10-23T17:00:00Z, ~6,362 min old, World 30 stored, 0 fresh World. Worker /health flags OK. | FAIL public freshness. Worker liveness != epoch advancement. |
| Browser authority config | Current .github/workflows/deploy.yml builds with VITE_SECTIONS_AUTHORITY=cloudflare and Cloudflare preview URL. Current #121 state is S1_GITHUB_PRIMARY_CF_SHADOW. | CONFIRMED policy/config mismatch; no approved S2/S3 evidence. |
| Browser selection | src/adapters/sectionsSnapshotLoader.js rejects old CF preview after 12h then requests Pages static; fresh 1,500ms budget initialized for each source request chain, not an end-to-end 1,500ms deadline. | CONFIRMED; absolute deadline and fallback admission design outstanding. |
| Ordinary Sections cards | src/adapters/sectionsSnapshotFetcher.js uses freshSectionItems if nonempty, otherwise original sectionItems even when expired; 36h ordinary-item age limit. | CONFIRMED stale-content admission defect. No runtime repair authorized by M0/M1. |
| Screenshot reconciliation | Oct28 03:00 UTC India screenshot's three titles match Oct26 deployed static source; published 2026-10-26 12:21–12:36 UTC (~38–39h before screenshot). | HIGH confidence old Pages fallback was being rendered; no direct runtimeDataSource capture. |
| Daily Digest | src/runtime/runtimeCapabilities.js reads VITE_API_BASE_URL/VITE_BACKEND_URL. src/data/datasets/dailyDigestDatasetApiClient.js returns BACKEND_NOT_CONFIGURED when unset; screenshot shows corresponding UI state. | BACKEND UNAVAILABLE in observed client. Which deployed API/provider/operator/config failed = UNKNOWN. |
| Cloudflare internals | No authenticated Cloudflare Cron, Queue, DLQ, D1 or resource headroom evidence available in this session. | UNKNOWN; do not assert low-level transport/root-cause or issue commands. |
| App change governance | main branch protected=false at checkpoint; deploy.yml publishes on main push/workflow_dispatch before actual postdeploy browser verification can fail. | ENFORCEMENT FAIL/ABSENT; independent prepublication release gate not present. |
| Release verifier | [PR #142](https://github.com/reallakshman19/NWv-7/pull/142) is draft/unmerged; previous genuine-browser prepublication rehearsal failed. | HOLD; not an operative production gate. |
| Continuous source monitor | [PR #144](https://github.com/reallakshman19/NWv-7/pull/144) remains draft/unmerged. Attempt 3 was manually rerun from its existing failed job. | NOT installed as always-on production enforcement. |
| Program ADR | [PR #151](https://github.com/reallakshman19/NWv-7/pull/151) already merged architecture-only ADR; document itself says PROPOSED. | Not ratified by merge; no M1 decision authority acquired. |
| Cloudflare separate governance | [#121](https://github.com/reallakshman19/NWv-7/issues/121) requires shadow-only under S1 and separately qualified S2/S3. | No automatic promotion allowed. |
| Hosting qualification | [#150](https://github.com/reallakshman19/NWv-7/issues/150) records 13/13 local model and 7/7 local harness checks, with H01–H12 public-host tests for both candidates NOT_RUN. Owner later DEFERRED host bake-off. | No eligible host, operator resources, spending ceiling or site assigned. |
| Oracle | Existing program says ACTIVE rev1 and prohibits cycle change within #150. | Unchanged / out of scope. |

## 2. M0 authority and ownership map

| Control role | Current authority or likely system | Accountable operator / approval | M0 disposition |
| --- | --- | --- | --- |
| News acquisition | GitHub Actions / scripts/fetch_sections_stories.py | Operator unknown | TOOLING OBSERVED; RACI UNKNOWN |
| News data validation | Python structural + freshness gates | Policy owner unknown | CODE OBSERVED; ratification unknown |
| GitHub static data publication | Currently coupled to NWv-7 app Pages build | Data-release approver unknown | NO independent production data publisher |
| Cloudflare shadow | Worker + Queue + D1 selected epoch | Cloudflare account owner unknown | PUBLIC stale; internal state UNKNOWN |
| Browser serving authority | Deployment env defaults to Cloudflare; #121 declares S1 static primary | Product/Owner authority decision pending | MISMATCH; NO authorization |
| Daily Digest | /api/datasets/dailyDigest endpoint contract | Backend and environment owner unknown | NOT CONFIGURED in observed build |
| Security and hosting | No candidate A/B approved | Hosting operator, IAM owner, spend approver unknown | RESOURCES NOT ASSIGNED |
| Independent review | Rev0.1 review supplied in conversation (READ_ONLY) | Distinct GitHub review principal not recorded | NOT a submitted GitHub approval |
| Production release | Owner approval and independent gates required | No enforceable ruleset on main | HOLD |

## 3. Evidence integrity and classification

- **PASS** means the indicated exact observation succeeded; not system-wide health.
- **FAIL** means source evidence establishes noncompliance at the specified timestamp.
- **NOT_RUN** means no eligible experiment occurred; do not infer a host capability.
- **UNKNOWN** means missing authenticated/configuration/ownership observations; do not infer health or fault.
- **PROPOSED** thresholds and schema do not become operative by publishing this document.

The October 28 public HTTP probe independently measured anonymous Worker and Pages freshness but explicitly **did not** verify a production browser. The separately recorded October 26 World browser PASS did not test the October 28 publication age. These must not be combined into a false contemporaneous production PASS.

## 4. M1 decision and experiment register

| M1 decision or test | Current state | Blocking input / owner action |
| --- | --- | --- |
| D01 — S1 serving authority | Not ratified; current env conflicts with #121 | Owner + independent reviewer decide exact approved static URL and staged configuration correction |
| D02 — Publication target A vs B | DEFERRED_BY_OWNER | Owner reauthorizes isolated A/B sandboxes; provides nonsecret site/account/region identifiers, operator and spend limit |
| D03 — Object/pointer protocol | Concept specifies versioned data and protected publication trust | Security review of authenticity, writer CAS, rollback and cache; real H01–H12 after D02 |
| D04 — Publication and item SLOs | Proposed 6h public generation, 36h ordinary article, event supersession | Editorial/Owner ratification plus operational monitoring cohorts |
| D05 — Timeout, cache and degraded state | Proposed absolute budget; current code per-source | Browser owner measurements of real network, CORS, memory/service-worker cache |
| D06 — Partial-section availability | Proposed isolation of healthy sections | Product/editorial approval and event exception policy |
| D07 — Named operational owners | Not assigned | Owner appoints producer/data-host/Cloudflare/Digest/incident/security/reviewer responsibilities |
| D08 — Release authorization | Main unprotected; deploy ahead of real-browser gate | Owner administrator + independent reviewer design and prove fail-before-publish gate |
| D09 — Cloudflare root-cause | Public selected epoch stale | Authorized operator supplies sanitized Cron/Queue/DLQ/D1 SELECT/logs/resource evidence; no mutation |
| D10 — Digest endpoint | UI says backend not configured | API owner identifies actual supported endpoint, deployed variable, date snapshot and release/health evidence |
| H01–H12 — Live host tests | NOT_RUN A and B | **Deferred** until separately authorized sandbox/operator/cost, no fabricated score |

## 5. M0 acceptance and next accountable actions

**M0 gate is PARTIAL, not closed.** The observable repository, deployment, public data and code paths are mapped. It cannot be signed off until named accountable owners, actual serving-origin/authority browser diagnostics, Cloudflare operator observations and Digest endpoint ownership are recorded; these are deliberately UNKNOWN here.

**Next exact M1 action:** the Owner and separate qualifying reviewer should ratify the *S1 authority and serving-route decision record*, including whether/how to correct the current Cloudflare-default build after the production prepublication gate is enforced. Hosting evaluation remains deferred. The security reviewer should decide the protected publication authority model; the operational owner should define UTC-based SLOs/alerts and supply nonsecret contact responsibilities.

**No action in this register changes production state.** Neither writing nor reviewing it authorizes Pages publication, new hosting, Cloudflare mutation, a second authority, live headline age relaxation, Daily Digest substitution or Oracle control change.

## 6. PR #152 independent-review reconciliation checkpoint — 2026-10-28

**Scope:** Recording the Owner-supplied independent *advisory* assessment of PR #152 at **original exact head** `e32d9ba8b3a972801c0154a76f830143ac0ddf2a`. The advisory reviewer inspected exactly two Markdown files, confirmed main was `3bfbe27127b3a2932ed89139387c4c55b1283395`, and returned `M0/M1 PARTIAL ACCEPTANCE`. This was **not** a formal GitHub non-author review. Subsequent documentation revisions change the PR head; the prior review cannot be presented as exact-head approval of the revised commit.

| Finding | Design response / evidence | Remaining gate |
| --- | --- | --- |
| R152-01 P1 — ADR core-section publication conflict | [Concept Rev 0.2.1](NWv7_Verified_News_Delivery_Concept_Note_Rev02.md) §4 explicitly preserves existing strict new-publication eligibility: FULL_CORE_ELIGIBLE requires intact mandatory core fields, >=1 current qualified item in each of World/India/TN/Muscat, >=5 current World rows from >=2 canonical publisher families and intact Top Stories policy. DEGRADED_CANDIDATE remains **unpromotable** unless the Owner and independent/editorial reviewer separately ratify an alternative. For **already approved** generations, still-valid sections may continue independently; per-section READY/DEGRADED/UNAVAILABLE and aggregate/critical alarm are specified. | Owner + reviewer must ratify minimum gate/profile; no current qualification code changes. Existing ADR not silently superseded. |
| R152-02 P1 — six-hour admission versus SLO | Concept §4/§6 sets proposed **hard** age admission from attested source-acquisition `snapshot.fetchedAt`, not manifest release date; **separate** >=99% of 15-minute public samples within <=6 h over rolling 30 days measures SLO. Out-of-age samples count as breaches and are **never** served current. | Owner ratification; verified source-ledger time, skew tolerance, sampling regions and actual instrumentation remain design/test work. |
| R152-03 P1 — operators | M0 RACI table still records hosting/Cloudflare/Digest/incident/reviewer/credential owners UNKNOWN. | Owner appoints accountable independent principals and escalation roles. M0 PARTIAL. |
| R152-04 — host trials | H01–H12 remain NOT_RUN in A and B, previously DEFERRED_BY_OWNER. | Separate resource/operator/spend authorization and live anonymous/public tests needed; no host selected. |
| R152-05 — independent review | Reviewer states connected GitHub identity is the PR author `reallakshman19`; a review submitted under that identity would not satisfy formal independence. Current comment/review here is not such a vote. | A separately authenticated, qualifying non-author GitHub reviewer must record a new review **at the new exact PR head**; absence blocks ratification. |
| R152-06 P2 — executable protocol custody | #150 stores text H01–H12 protocol and records 13/13 model, 7/7 local harness, plus hashes for conversation artifacts; approved Common artifact relay does not yet contain independently verified bytes under an established current-session reference. Concept §3 specifies versioned manifest, SHA-256, runtime/fixture, negative cases, logs and retention record. | Assign relay custodian and access policy; materialize and hash-verify actual executable bytes when available. **Do not claim artifact delivery or restart hosting tests.** |

**Changed-file rule:** Rev 0.2.1 remains **documentation-only** on existing draft PR #152. Its updated head SHA must be read afresh before any further review request or approval. No amendment here authorizes merging even a docs-only PR because current `main` push auto-publishes Pages.

**Next exact M1 decision request:** Owner and independent reviewer ratify strict new-candidate core readiness versus already-published section isolation, the proposed hard 6-hour acquisition-age limit and associated 30-day public SLO; then assign operational RACI and a distinct non-author review principal. Retain host deferral. Capture unresolved aspects as UNKNOWN/PROPOSED, not PASS.

**State invariants:** `main` unchanged by this branch-only update; production incident #143 OPEN; no Pages deploy, no CF authority/Queue/D1 changes, no hosting provision, no M2–M5 implementation, no Oracle cycle change.

## 7. Detailed reviewer return #153 and Rev 0.2.2 design response (2026-10-28)

**Review provenance:** Owner supplied [IR1 detailed source/design report](https://github.com/reallakshman19/NWv-7/issues/153#issuecomment-6461269598) covering PR #152 at exactly `8a7cadd74c5774f763ea2d8c98bdcd8067ddf291`. It is a **technical advisory**, not formal non-author approval: connected GitHub principal `reallakshman19` was the PR author, and the reviewer disclosed prior advisory exposure. Recorded conclusion: R152-01/02 `PASS_DESIGN_ONLY`, M1 ratification HOLD. A follow-up documentation amendment cannot inherit the prior exact-head review.

The [revised concept, Rev 0.2.2](NWv7_Verified_News_Delivery_Concept_Note_Rev02.md) incorporates the bounded **proposed** controls below. No product code/CI tests or browser acceptance have been executed.

| Finding | Rev 0.2.2 concept response | Evidence/authorization still needed |
| --- | --- | --- |
| **R152-07 P1** aggregate state partial function | §4.1 defines first-match UNAVAILABLE for invalid whole generation; UNAVAILABLE for no valid core cards; READY for all four ready + mandatory World/Top passing; else DEGRADED. `criticalPolicyFailure` independent. Top-only ready is its own domain, not aggregate core READY. | Owner/editorial signoff, exhaustive state-machine fixtures in future M4; current UI unmodified |
| **R152-08 P1** mounted data expiry | §5.1 requires expiration at earliest generation, publisher-item, event or trust lease deadline; current designation invalidated in open tabs, focus/visibility/BFCache/resume and offline. | Real browser timed tests; platform timer/suspend behavior not yet verified; no current implementation |
| **R152-09 P1** untrusted client clock | §5.1 proposes approved TLS-origin or signed UTC anchor, bounded uncertainty, monotonic elapsed time, finite lease and fail closed without verifiable UTC. Device Date.now is not an authority. | Trusted-time provider, CORS/Date/Age/cache/protection, RTT/skew/replay/security approval and clock perturbation tests UNKNOWN |
| **R152-10 P1** public endpoint versus actual browser | §6.1 separates DATA_DELIVERY_SLI, BROWSER_DELIVERY_FIDELITY_SLI and BROWSER_CONTENT_READINESS_SLI; live origin and actual selected effective source, exact consumed byte/DOM multiset required; no metric substitution. | Synthetic Chromium/regions/cohorts/cost and actual production telemetry NOT_RUN |
| **R152-11 P2** Top Stories age | §6.2 separately identifies ranker 4/8/12h age bands, 24h live bonus (not admission override), prefetched Top 12h normal/36h heuristic-live consumer rules and current snapshot <=12h; proposed effective display is intersection with event qualification. | Full per-producer trace and approved live evidence exception/versioned policy digest; existing behavior unchanged |
| **R152-12 P1** all deployment triggers | §7.1 mandates fail-before-publish tests for push, manual dispatch, each workflow_run trigger, rerun, privileged bypass and candidate artifact swap; no reuse of old approval when source/context changes. | Required branch/environment enforcement and negative tests NOT_RUN; current deploy publishes before browser verification |

### Current executable-policy discrepancies (reconfirmed from `main`, not production tests)

- `src/adapters/sectionsSnapshotFetcher.js` currently uses 12h snapshot, 36h ordinary item, 12h ordinary Top, 36h live-like Top; stale ordinary fallback can return all old articles and a future `fetchedAt` may be treated fresh by its current `Date.now() - fetchedAt <= maxAgeMs` test. **The Rev 0.2.2 six-hour rule and continuous validity are proposals, not active protections.**
- `src/services/topStories/topStoriesPolicy.js` declares ranker age bands 4/8/12h and `liveMaxHours=24`; `topStoriesEvidenceAdmission.js` rejects the ranker's expired age band, while the live 24h feature is used in ranking score. The prefetched live-like 36h item allowance is not proof of ranker authorization.
- `.github/workflows/deploy.yml` listens to main/master push, workflow_dispatch and named workflow_run, sets `VITE_SECTIONS_AUTHORITY=cloudflare` during build, and has `deploy: needs: build` before postpublication World checks. `main` was unprotected at checkpoint. These are unchanged source observations; no safe prepublication gate presently proved.

### Concept counterexamples defined, not executed

| Case | Required result | Execution |
| --- | --- | --- |
| Four core READY, Top policy failure | Aggregate DEGRADED, critical alarm visible | DESIGN_ONLY / NOT_RUN |
| All core empty, valid Top-only | Core aggregate UNAVAILABLE, independently valid Top may render with explicit scope | DESIGN_ONLY / NOT_RUN |
| Snapshot crosses 6h while mounted, item crosses 36h, event superseded | Remove current badge/advisory immediately and fail closed if no requalification | DESIGN_ONLY / NOT_RUN |
| Device clock ±24h, Time/Date origin stale, BFCache/resume | Fail closed or recompute from trusted UTC anchor; no stale current card | DESIGN_ONLY / NOT_RUN |
| Static public data fresh, production browser selects unapproved Cloudflare shadow | Public-source SLI may pass; browser-fidelity SLI MUST fail | DESIGN_ONLY / NOT_RUN |
| Any release trigger with real browser failure / prior reused approval | No deployment; deploy job NOT_RUN | DESIGN_ONLY / NOT_RUN |

**Next accountable M1 work:** An authenticated *separate non-author* GitHub principal must review the **new current PR head**, including Rev 0.2.2's total status rules, time-verification feasibility, independent browser/Top policy precedence, and all-trigger deployment gate. Owner/editorial signs policy, security designs the time/publisher trust root, and Owner assigns operational roles. H01–H12 hosting and resources remain DEFERRED_BY_OWNER, no relay executable artifact claimed.

**Still HOLD:** PR merge, runtime code, Pages/data publication, Cloudflare S2/S3 or Queue/D1 mutation, M2–M5 implementation, and Oracle rev change. #143 production incident remains OPEN.
