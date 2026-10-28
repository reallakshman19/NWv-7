# NWv-7 — Verified News Delivery Concept Note

**Document:** NW-ARCH-CN-01  
**Revision:** 0.2 — independent-review response; submitted for re-review  
**Date:** 2026-10-28  
**Authority:** [Architecture program #150](https://github.com/reallakshman19/NWv-7/issues/150)  
**Technical baseline:** [October 26 ADR](NWv7_End_to_End_News_Reliability_ADR_20261026.md), status PROPOSED  
**Decision:** Option C *conditionally supported as preferred direction*; NOT selected for implementation or hosting  
**Scope authorized for this submission:** M0 read-only discovery and M1 detailed design only  
**Hard hold:** No new production host, application release, data promotion, Cloudflare authority change, Cloudflare queue replay, Oracle cutover, or M2–M5 implementation.

## 1. Rationale and executive decision

NWv-7 has a verified *delivery-integrity* failure, not merely an RSS acquisition failure. The October 27 collector wrote a qualified new repository snapshot, while the publicly served Pages file remained from October 26. The Cloudflare preview's selected epoch was dated October 23; ordinary Sections logic can display articles beyond its 36-hour limit when no newer article exists. Daily Digest independently reports BACKEND_NOT_CONFIGURED. See [incident #143](https://github.com/reallakshman19/NWv-7/issues/143#issuecomment-6459539878).

Producer success, committed source data, public publication, browser admission, and application deployment are distinct events. The current architecture does not prove their continuity or authorize source selection consistently. Repeated isolated patches and nominally green deployments therefore cannot establish reliable user-visible news.

**Proposed Option C:** retain existing collectors, qualify immutable versioned snapshots, verify the exact anonymous public bytes before promoting an approved pointer on a separately operated data endpoint, and enforce source/age/event validity in the browser. Operate Cloudflare as shadow in the existing S1 state until a separate #121 qualification and Owner authorization. Treat Daily Digest as a separate domain service.

This is a refinement of the existing ADR and program, not a competing implementation track. The independent review conditionally supported Option C but required ten corrections (A01–A10). They are specified below as design controls, not claimed to have been implemented.

## 2. Four separately authorized boundaries (A01)

1. **Acquisition authority** creates independently sourced, timestamp-proven candidate data.
2. **Qualification and publication authority** decides what exact bytes may be staged and promoted.
3. **Serving authority** decides which qualified endpoint the production browser may consume.
4. **Application release authority** approves code/configuration changes and releases separately from content.

**Normative current serving state:** S1_GITHUB_PRIMARY_CF_SHADOW per [#121](https://github.com/reallakshman19/NWv-7/issues/121).

| S1 source | Eligible for production Sections reads? | Allowed action |
| --- | --- | --- |
| Approved GitHub/static primary | Only when its *publicly served* generation and requested articles qualify | Serve and report generation, age, source and degraded sections |
| Cloudflare shadow/preview | **NO** | Independent labelled comparison, diagnostics and qualification evidence only |
| Newly proposed independent host A or B | **NO until separately authorized as production data authority** | Isolated NONPRODUCTION host trials only |
| Unassigned/unknown fallback | **NO** | Do not silently substitute it |

If the approved S1 primary is invalid or expired and no other **separately approved and qualified** production-serving source exists, render truthful degraded/unavailable state. A shadow source must never become fallback automatically.

The current Pages build sets VITE_SECTIONS_AUTHORITY=cloudflare, contradicting S1. M0 must register the discrepancy; M1 must ratify the exact remediation and prepublication gate. This concept does not change the live flag. A static host migration also constitutes an authority change, even if it is not Cloudflare.

## 3. Publication contract and provider qualification (A02, A04)

The existing ADR's proposed **nwv7-sections-delivery/v1** is the normative detailed-design baseline. Require these fields, with exact schema/types and canonical serialization determined in M1:

| Category | Minimum evidence |
| --- | --- |
| Object identity | snapshotId, full snapshotSha256 over **actual served bytes**, immutable object URL |
| Promotion lineage | publicationGeneration, predecessorId, promotion time and accepted actor |
| Producer and code | producerRunId, codeSha, registryDigest, policyDigest, identityDigest |
| Collection times | generatedAt, fetchedAt, publishedAt (not interchangeable) |
| Qualification | sourceLedgerDigest, qualityReportDigest, sectionCounts, canonical publisherFamilyCounts |
| Future Cloudflare-only evidence | sourceEpochId, verified SHADOW_COMMITTED state and epoch digest, **only** if independently serving-qualified later |

A short contentHash is insufficient for publication attestation. Re-fetch staged bytes anonymously from the actual public-origin path, verify full SHA-256 and policy/identity evidence, then allow promotion. A matching digest does **not** prove origin authenticity if an attacker can replace both pointer and digest. M1 security design must define the trusted publishing identity, protected evidence/key boundary, approval chain, credential scopes/rotation and whether signed manifests or an independently protected promotion ledger is required.

**Candidate state machine:** ACQUIRED -> QUALIFIED -> STAGED -> PUBLICLY_VERIFIED -> PROMOTED. ABORTED and REJECTED are terminal. Published promotion pointers must advance monotonically, reject stale/concurrent writers, bind a verified predecessor and support verified rollback only to still-qualified generations. Readers must validate that a pointer's object is retrievable and byte-exact; a current-looking pointer to an incomplete object fails closed.

**Host candidates remain unselected:**
- A: separate GitHub Pages data site. Whole-site artifact replacement, prior immutable URL retention, pointer visibility and cross-deploy writer protection must be proven; never assume Pages supplies native public JSON CAS.
- B: S3 + CloudFront. S3 conditional writes are promising at origin, but CloudFront edge/pointer cache and anonymous cross-origin behavior may differ; these need real observation.

The #150 **H01–H12 live-host test protocol** is mandatory before either host is eligible: real public GET/hash, previous-object retention, overwrite rejection, promote-after-verify, dual-writer conflict, anti-replay generation, interruption/edge behavior, cache/TTL, browser CORS and identity, fresh rollback, unauthorized writes, and two scheduled cycles including failure injection. Passing 13/13 offline model tests and 7/7 local probe tests does not close ANY H01–H12 trial.

**Owner decision already recorded:** live hosting bake-off is DEFERRED_BY_OWNER. Thus H01–H12 = NOT_RUN, no approved sandbox IDs, no selected hosting provider, no grant of billable AWS resources, and no M2 authorization. M0/M1 analysis may proceed without silently reversing that deferment.

## 4. Absolute content admission and partial availability (A03, A07)

**Three independent tests:**

| Test | Concept-stage policy |
| --- | --- |
| Publication freshness | Selected approved public generation must satisfy a ratified generation-age admission threshold; proposed upper bound 6 h |
| Article freshness | For ordinary current-content Sections, verified publisher-published age <=36 h; Top Stories keeps its separately specified tighter rules |
| Event validity | Time-sensitive forecast, cyclone, emergency, election/live event requires valid effective/expiry/supersession evidence; 36 h alone is insufficient |

No unknown/missing/fetch-time-substituted publication timestamp may count as verified current content. When zero fresh ordinary articles remain, the current code's fallback from freshSectionItems to sectionItems **must not** re-admit those expired items as current. Historical content may only appear clearly segregated as historical, never as a current advisory. Where event supersession cannot be established, do not label an earlier advisory as current.

**Partial failure policy:** Reject the entire promotion for corruption, invalid bytes/schema/identity, unverifiable qualification, or broken snapshot consistency. Do **not** make unrelated healthy sections unavailable simply because one section has no fresh eligible article: per-section readiness must be independently represented. Core section readiness is assessed separately for World, India, Tamil Nadu and Muscat; aggregate status truthfully records gaps.

**Editorial quality:** Normalize canonical publisher identity (do not count several Google News wrappers as independent publishers); compare exact displayed article ID, canonical URL, source/epoch and **multiset occurrence counts** against the verified chosen generation. Measure diversity and near-duplicate event clustering on rendered first cards, not only the collector's 30 stored articles. Proposed World baseline: >=5 publisher-timed qualified items from >=2 independent canonical families; not yet an approved production SLO.

## 5. Browser timing and cache semantics (A08)

The existing loader's 1,500 ms snapshot budget is **per requestSnapshotUrl invocation**. On primary failure, requesting the fallback initializes another budget; it is NOT a guaranteed absolute user-visible 1.5-second deadline.

**Design hypothesis, not yet ratified:** one monotonic deadline encompassing authority resolution, eligible source fetch, retry, JSON/manifest validation, full-byte identity binding and UI terminal state; aim for p95 <=2.5 seconds, with proposed absolute 3-second cap under a defined connectivity profile. M1 must establish measurement devices, latency cohort, retryable errors, minimum fallback reserve and timeout behavior before accepting numbers.

A source is selectable only when its publication pointer, immutable blob, policy evidence and displayed articles are valid. Cache design must specify pointer TTL/revalidation, immutable content cache, browser memory TTL, service-worker generations, CDN 404 caching, edge convergence and bad-cache recovery. A stale cached pointer may not be reclassified as current because its HTTP request succeeds.

During S1, excluded Cloudflare preview receives no production fallback traffic under any timeout or cache condition.

## 6. Measured operational contract (A06, A09)

Metrics are measured against **anonymous publicly served bytes and actual browser content**, with UTC event clocks and explicit sampling periods, not merely successful workflow runs.

| Measurement | Initial proposal; not ratified |
| --- | --- |
| Acquisition cadence | Every 3 h; record planned vs actual start, qualification, commit and failure |
| Public generation age | >=99% of 15-minute samples within <=6 h over rolling 30 days; explicitly fail on missing or invalid response |
| Accepted-candidate-to-public latency | Provisional p95 <=30 min; measured from qualified candidate freeze to publicly verified pointer, per 30-day window |
| Publication integrity | 100% matching trusted pointer identity, full public SHA-256, immutable blob and validation evidence |
| Core section readiness | World, India, TN, Muscat individually reported and alerted; do not hide failures under global pass |
| Browser fidelity | Source/epoch, IDs, canonical URLs and occurrence counts exact against rendered current cards |
| Recovery | One missed 3h scheduled slot creates warning; repeated slots or breached public freshness escalates to named on-call |
| Daily Digest | Separately configured /api/datasets/dailyDigest?date=... with edition/date validity and own alert ownership |

The service definition must define expected observation regions, independent browser cohorts, provider-clock skew, maintenance/error budgets, cost ceiling, runbook routing and evidence retention. Proposed retention for review: raw operational proofs 30 days; summarized immutable promotion/audit ledger 90 days, subject to security approval.

**Accountabilities remain UNASSIGNED until Owner names persons/roles:** product authority; producer operator; data publisher; hosting/account owner; Cloudflare shadow operator; Daily Digest API operator; browser authority maintainer; incident on-call; qualified non-author reviewer; security and release approvers. Do not invent names or treat ChatGPT as an accountable 24/7 operator.

## 7. Gates that actually prevent exposure (A05)

**Application release:** exact-code-SHA candidate -> build/test -> genuine nonpublishing Pages-equivalent browser with actual approved serving generation -> independent non-author review -> Owner exact-SHA release authorization -> production deploy -> public-origin canary -> continuous monitoring. A negative test must show a failed **real** prepublication browser check cannot reach the deploy action. A test that fails only after Pages deploy does not qualify.

**Data publication:** exact qualification and immutable candidate -> staged public GET/hash -> protected publication decision -> externally verified pointer promotion -> served-byte and browser follow-up. Separate identities and approval/rollback rights from app deployment. A permitted data publication is not an app release.

**Incident containment:** a narrowly scoped, separately approved emergency content-integrity intervention may be considered without implying host selection, shadow promotion or normal UI deployment authorization. This concept alone does not authorize it.

## 8. M0–M5 controlling program map (A10)

All outcomes belong to [#150](https://github.com/reallakshman19/NWv-7/issues/150); preserve separate [Cloudflare #121](https://github.com/reallakshman19/NWv-7/issues/121), [incident #143](https://github.com/reallakshman19/NWv-7/issues/143), and draft/unmerged [release verifier PR #142](https://github.com/reallakshman19/NWv-7/pull/142).

| Gate | Deliverable / acceptance | Status and permission |
| --- | --- | --- |
| **M0 Evidence** | Immutable timestamped current source/host/workflow map, real public evidence, accountabilities and explicit UNKNOWNs | IN PROGRESS; read-only |
| **M1 Design** | Ratified S1, host/trust comparison, security/identities, H01–H12 plan, SLOs, resource/cost/ops owners and binding contract | DOCUMENTED FOR REVIEW; not ratified |
| M2 Publication | H01–H12 on authorized real sandboxes, immutable/collision/edge/CAS tests, rollback and two real cycles without app build | HOLD; host experiment deferred |
| M3 Cloudflare | Authorized read-only D1/Cron/Queue/DLQ diagnosis, later 41-lane epochs and #121 7-day/200-comparable-epoch qualification | HOLD for mutation; no S2/S3 |
| M4 Browser/product | Actual served source-to-DOM multiset proof, cache, outage/event/partial tests, Digest independent readiness | HOLD for implementation |
| M5 Release/operations | Enforced protected main, prepublication blocking, independent review, Owner release, public canary, alerts and rollback | HOLD |

The present ADR's merge to main does not ratify it. The owner has not selected A/B; branch protection is not enforced; cloud operations and Daily Digest account ownership remain UNKNOWN. No preview, CI, simulated local test or publication success may substitute for missing independent evidence.

## 9. Decisions requested — not silently assumed

| Decision | Proposed direction | Current disposition |
| --- | --- | --- |
| S1 authority | GitHub/static primary and Cloudflare shadow; reconcile live Cloudflare-default discrepancy through gate | Owner + independent reviewer signoff PENDING |
| Provider A vs B | Run comparable H01–H12 after resource and cost authorization | DEFERRED_BY_OWNER; neither selected |
| Manifest/trust | nwv7-sections-delivery/v1 with full public SHA-256 and protected publisher decision | Security review PENDING |
| Freshness and events | 6 h generation goal, 36 h ordinary article cap, explicit event supersession, section-specific availability | Editorial/Owner review PENDING |
| Latency/cache | Absolute deadline with bounded fallback and verified edge/browser semantics | Measured M1 review PENDING |
| M2–M5 implementation | Separate approval after M1/host gates | HOLD |
| Oracle/canonical release | Existing rev1 unchanged | NO CHANGE |

## 10. Independent review checklist

This revision addresses A01 (S1 authority), A02 (actual-host proof), A03 (three validity dimensions), A04 (trust/schema), A05 (prepublication blocking), A06 (quantitative SLOs), A07 (canonical editorial/rendered quality), A08 (absolute source latency and cache), A09 (responsible monitoring), and A10 (one #150 program). **Addressed in concept only** does not mean tested, approved or implemented.

**Requested disposition:** independent reviewer validates Rev 0.2 concepts and M0 evidence, returns remaining defects; Owner authorizes/ratifies discrete M1 decisions. No merge while main push still automatically publishes the application without a genuine prepublication block.

**Review state:** Independent reviewer of Rev 0.1 = conditional direction approval; Rev 0.2 = NOT YET REVIEWED; Owner ratification = PENDING; Security review = PENDING; Hosting = DEFERRED; Production = HOLD.
