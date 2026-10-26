# ADR-2026-10-26 — Verified NWv-7 news delivery, independent data publication and fail-closed serving

**Status:** PROPOSED — Owner approved an architecture recovery program, not this precise implementation or serving cutover.
**Tracking:** [Architecture program #150](https://github.com/reallakshman19/NWv-7/issues/150).
**Basis:** `main e0cbcfe3d0d1e1b207eb25e5a5c3d1447c087d1f`, observed 26 October 2026.
**Non-goals:** A production patch, Pages release, Cloudflare mutation, immediate S2/S3 promotion, new Oracle authority or implied reviewer approval.

## 1. The failure we must eliminate

On 26 October, both live public news sources lacked current World stories while Pages could build and deploy. The [read-only live source report](https://github.com/reallakshman19/NWv-7/actions/runs/39216612994) observed a Cloudflare preview epoch `live-1792774800000`, fetched 23 October 17:00 UTC, with 0 fresh World stories, and a served Pages snapshot fetched 21 July, also 0 fresh World. The Cloudflare `/health` response was nominal. [Pages run #40325704147](https://github.com/reallakshman19/NWv-7/actions/runs/40325704147) passed build, deploy and byte provenance, then failed World hydration after 90 seconds. The screenshot of Main showed India, Tamil Nadu, Muscat and World empty/critical, and Daily Digest reported an unconfigured backend.

The new [scheduled GitHub fallback refresh](https://github.com/reallakshman19/NWv-7/actions/runs/40326706304) independently acquired 281 publisher-dated stories (30 World) and committed matching `public/` and `docs/` snapshots under `e0cbcfe3`. **This does not prove the deployed Pages site serves or selects these new bytes**: bot commits via GITHUB_TOKEN do not trigger the current Pages push workflow, and the refresh workflow intentionally does not match the deploy workflow's upstream trigger names.

The current Cloudflare [shadow contract](https://github.com/reallakshman19/NWv-7/issues/121) is **S1 GitHub-primary / Cloudflare-shadow**, while `.github/workflows/deploy.yml` currently sets `VITE_SECTIONS_AUTHORITY=cloudflare`. That is a source-authority inconsistency requiring explicit reconciliation, not a reason to pretend the shadow was promoted. PR #142 continues to be draft/unmerged with genuine browser qualification FAIL.

## 2. Decision sought from the Owner and an independent reviewer

Adopt a **logical data plane independent of UI application releases** with the following invariants. Approval of this ADR must be separate from authorization to provision a host, promote Cloudflare, merge product code, or deploy Pages.

1. An immutable, content-addressed NEWS SNAPSHOT is the only candidate that may be published. No partial snapshot and no fake publication time are promoted.
2. Producer output is not serving authority. Every candidate must pass independent quality and identity verification before a serving pointer may move.
3. Publication authority is a deliberate state machine: **S1=GitHub/static primary, Cloudflare shadow/opt-in Preview**. S2 qualification and S3 Cloudflare primary require issue #121's separately recorded replay, live-parity, operational and Owner approval thresholds. Today's configured Cloudflare default is a detected violation of the declared S1 state, **not evidence of a legitimate cutover**.
4. One browser render must be provably bound to the exact accepted snapshot/epoch, including every displayed story's canonical URL and stable story ID.
5. A stale or failed primary causes selection of another **qualified** source. If both are unqualified, return a clearly labelled unavailable/degraded state, never a fresh-looking old headline.
6. Data publication is not a code release. The end user can receive new verified headlines without rebuilding or merging the UI. Conversely, publishing a new UI build does not assert any data is fresh.
7. Real Pages-origin Chromium and independent approvals are release gates; mocks, local previews and `/health` alone never qualify production.

## 3. Target architecture and ownership

    Feed sources / versioned 41-lane registry             Cloudflare Cron / Queue / D1 (SHADOW)
             |                                                        |
             v                                                        v
       GitHub RSS collector                                 candidate immutable epoch
             |                                                        |
             +-------------------- qualification ---------------------+
                                      |
                                      v
                  Independent policy + identity + provenance judge
                        |                            |
                        v                            v
              GitHub candidate store         Cloudflare shadow evidence
                        |
                        v
             DATA RELEASE AUTHORITY (independent from app release)
                qualified immutable blob -> public GET -> pointer CAS
                        |
                        v
                Browser source resolver + observability
                GitHub primary / optional qualified Preview
                        |
                        v
                Actual rendered Sections / Top Stories / Insight

The boxes are **logical**. No new infrastructure is provisioned by this ADR.

| Plane | Owner/control | Operational boundary |
| --- | --- | --- |
| Acquisition | GitHub scheduled producer and independent Cloudflare shadow | Independent schedules, credentials, source failure ledgers, retries/backpressure |
| Reference policy | Single versioned source registry, identity, normalization, admission and ranking authority in repo | Cloudflare imports shared executable rules; never copy weights or aliases |
| Custody | Qualified immutable objects and exact digest checks | D1 SHADOW_COMMITTED atomic pointer remains shadow until approved |
| GitHub data publication | A narrowly scoped data-release identity and immutable artifact host (to be selected) | No app build; no direct `main` data-push-to-prod assumption |
| Browser | Explicit serving-state configuration and client contract validator | Chooses only qualified sources; displays selected identity/source health |
| Application deployment | Protected code release authority | Exact-head CI + actual Pages-origin browser + nonauthor review + explicit Owner release |
| Domain products | Daily Digest, Insight and Up Ahead own their distinct dataset contracts | Share telemetry shape, not provider endpoints, databases or lifecycle windows |

**Preferred data-delivery candidate for design validation:** dedicated GitHub-hosted static data publication endpoint, separated from the NWv-7 application Pages release (for example, a distinct protected repository/Pages data site). This minimizes coupling to Cloudflare when Cloudflare itself fails. **Owner must approve its repository, URL, credentials and cost/security model** before implementation. A separate Pages site may still require its *own* data publish artifact/deployment; this is permitted because it is not an NWv-7 UI code build. Verify actual CDN/cache and cross-origin behavior rather than assuming them.

**Explicitly rejected alternatives:** continuously redeploying NWv-7 UI for every snapshot; treating `raw.githubusercontent.com` as an unverified public production API; storing the sole fallback behind the Cloudflare Worker that is being failed over; marking a fresh collector header as evidence every story is fresh; auto-promoting a shadow merely because the Worker responds; weakening #142's release gate.

## 4. Canonical delivery contract (proposed v1)

**NEWS SNAPSHOT:** `nwv7-sections-delivery/v1` with the existing `sections_latest.json` Section schema **preserved** during migration. A sidecar manifest binds:

| Field | Required meaning |
| --- | --- |
| `snapshotId` | Content-addressed immutable identifier (algorithm and canonicalization recorded) |
| `snapshotSha256` | Full SHA-256 over **actual served snapshot bytes**; truncated `contentHash` is not sufficient alone |
| `producer`, `producerRunId`, `codeSha` | Source identity plus immutable exact producer/commit evidence |
| `generatedAt`, `fetchedAt`, `publishedAt` | Distinct acquisition, snapshot generation and release times; never interchangeable |
| `registryDigest`, `policyDigest`, `identityDigest` | Semantic/executable authority digests from one code authority |
| `sourceLedgerDigest`, `qualityReportDigest` | Validated source dispositions, timestamp provenance and policy decisions |
| `sectionCounts`, `publisherFamilyCounts` | Coverage and editorial diversity including World and core local sections |
| `sourceEpochId`, `epochState`, `epochEvidenceDigest` | Mandatory for Cloudflare selection: one actually consumed committed epoch, not a nearby/header epoch |
| `publicationGeneration`, `predecessorId` | Monotonic pointer generation and explicit rollback ancestry |

**STORY IDENTITY:** stable article ID, canonical URL and publisher-family identity are checked as a **multiset of real displayed cards**, not merely counts or a Set of title strings. Repeated headlines with different canonical URLs remain distinguishable. Verify no extra/hidden/omitted cards and no duplicate IDs unless a domain rule explicitly permits them. Google News wrappers must not count as distinct independent publishers.

**AUTHORITATIVE FRESHNESS:** verify publisher-reported `publishedAt` with provenance and skew bounds, not only `fetchedAt`. Missing publisher timestamps are unqualified for `fresh` status. Enforce view-specific windows: Sections ordinary story <=36 h; Top Stories policy remains per its existing contract; Cloudflare preview selectable only within its documented 12 h limit (stricter operational qualification may apply). Proposed GitHub publication freshness SLO is <=6 h (3-hour acquisition cadence plus bounded recovery), to be ratified using real run distributions. Do not relax existing tighter product rules through this ADR.

**Core readiness acceptance (proposed, not yet enforced):** each of World, India, Tamil Nadu and Muscat must have at least one genuinely current, publisher-attributed renderable story; World at least five qualified rows and two independent canonical publisher families; Top Stories quality and source-diversity rules hold. Each section's own failure stays visible. No city backfill is presented as original city reporting: retain `backfilledFrom` provenance.

**Hashing:** compute binary SHA-256 of snapshot and manifest sources. Pin both in the promotion evidence, including canonicalization/version. At render time report actual source URL and response digest. Do not trust bare in-memory fields as evidence of what the user saw.

## 5. Data publication protocol: two-phase, idempotent and recoverable

**Candidate state machine:** `ACQUIRED -> QUALIFIED -> STAGED -> PUBLICLY_VERIFIED -> PROMOTED`, with `REJECTED` or `ABORTED` as terminal alternatives. One candidate may not skip steps.

A. Acquire with immutable logical slot + attempt ID; retries are idempotent. Save all failure dispositions. Never overwrite the last promoted object.
B. Qualify a specific snapshot and manifest. Fail on content hash mismatch, duplicate/incorrect story identities, old/invalid publisher times, source concentration, missing mandatory sections or partial epoch data. Independent verifier records exact code SHA and per-negative result.
C. Upload to versioned public path (e.g. `/snapshots/<snapshotId>.json`) with no change to `current`. Treat object upload success as **not yet public** until an unauthenticated external GET from the actual client origin matches SHA-256.
D. Publish the promotion pointer `current.json` atomically or with optimistic generation compare-and-swap. The pointer contains snapshot ID, blob URL, hash, generation and activation timestamp. A pointer may only reference a publicly verified immutable object, and the client must revalidate the object digest before calling it current.
E. Client rejects a pointer or blob that is inconsistent, unavailable, stale, replayed/out-of-order or missing qualified provenance. It tries the previous approved generation or an independent qualified source. Cached snapshots retain original timestamps and must not be mislabeled fresh.
F. Rollback changes only the pointer to an **already verified safe generation** (only while still within applicable freshness windows). If every verified object has expired, rollback cannot fabricate current content; display unavailable status and escalate.

**Hosting constraint:** GitHub Pages is artifact/deployment-oriented, so do not claim a cross-deploy atomic pointer until a staged public GET, immutable blob retention, cache-control behavior and two-phase promotion have been proven with the actual chosen hosting implementation. A pointer committed to GitHub but not externally visible is not promoted. Security model: scoped publisher identity, separate workflow for data only, least privileges, protected release reference, recorded independent approval and auditable deny-before-release.

## 6. Serving authority and failover

**No hidden source flip:** `S1_GITHUB_PRIMARY_CF_SHADOW` is the latest explicitly documented Cloudflare authority state. Reconcile deployed `VITE_SECTIONS_AUTHORITY=cloudflare` before declaring S1 healthy; never encode a quiet cutover into a refactor.

Client selects in this order under S1:
1. Verify the current GitHub data endpoint pointer and immutable bytes; accept only when qualification, age and card identity pass.
2. On failure, evaluate **only explicitly permitted** alternatives. Cloudflare in S1 may be a visibly labelled Preview chosen by a user, not a silent production primary or automatic hot fallback.
3. When neither permitted qualified source exists, show `DEGRADED_SOURCE_UNAVAILABLE` with section-specific counts/age; no old news masquerading as today's edition.
4. Publish a bounded diagnostic envelope: requested authority, effective authority, snapshot/epoch ID, fetched/published times, story count, publisher family count, fallback reason, client build SHA, request HTTP status and browser-verification timestamp. No secrets or raw private article bodies.

S2/S3 promotion prerequisites are inherited, **not weakened**, from #121: exact deterministic replay, classified live drift, 7 calendar days and >=200 comparable epochs, weekend/daypart coverage, >=95% coverage and precision, >=90% Top-10 overlap, zero false source corroboration/unknown critical drift/stale admissions, proven operational limits, independent reviewer and separate Owner cutover. The preview remains GET-only, with no public write route.

## 7. Independent application release gate

Current `deploy.yml` publishes on a push to `main` and on a manual dispatch before its real World health job can fail; code CI and Pages provenance PASS do not stop a sick site from being exposed. The proposed state separates:

- **Candidate build**: exact SHA, lint/unit/editorial, reproducible artifact, malicious negative source-identity tests.
- **Nonpublishing real origin rehearsal**: same built artifact hosted as a Pages-equivalent static origin; actually selected current authority and real current snapshot/epoch; real Chromium shows visible World/India/TN/Muscat cards and matches complete IDs+URLs+multisets; no mocked Worker/static accepted for production qualification.
- **Authorization**: qualified, nonauthor GitHub approval; branch/ruleset prevents direct merges, bypasses and premature deployment; explicit Owner approval for exact SHA and source epoch.
- **Production canary**: postdeploy Pages-origin Chromium + downloaded served snapshot/manifest SHA proof + source selection/epoch/section health checks and rollback drill. Fail the release status if any positive story or epoch binding cannot be witnessed.

No additional Pages publication may be performed by the program until the above release gate has separately been implemented, independently accepted, and authorized. Emergency incident operations require their own explicit documented Owner scope and cannot imply S1→S3.

## 8. Daily Digest, Insight and Up Ahead boundaries

| Product | Data authority | Health/readiness contract |
| --- | --- | --- |
| Sections / Top Stories | Selected qualified Sections snapshot or separately qualified future Cloudflare epoch | Publisher timestamps, source families, exact visible cards, policy-verified rank |
| Insight | In Static Live mode first considers Sections authority as current article input; Hybrid has independent Insight snapshot behavior | Prove source actually consumed, dedupe/cluster quality, stale/live indicators; separate mode-specific browser checks |
| Up Ahead | Own `/api/datasets/upAhead` Worker path (when deployed) and static event feed | Future-event timing, date validity, independently verified API activation and 7-day horizon; do not apply news 36h policy |
| Daily Digest | Own `/api/datasets/dailyDigest?date=YYYY-MM-DD` endpoint | Resolve `VITE_API_BASE_URL` or `VITE_BACKEND_URL` deployment configuration; distinguish NOT_FROZEN, MISSED_FREEZE, BACKEND_NOT_CONFIGURED and live Sections-derived fallback; never substitute Sections Worker as Digest API |

Share operational telemetry and alert routing. Do not share storage, ownership, release authority or pretend one product's health implies another's.

## 9. Fault matrix and observable acceptance

Each test must retain the **before-fails / after-passes** artifact and actual-source response, not merely a claim in a PR body.

| Injection | Mandatory expected behavior |
| --- | --- |
| Fresh fetchedAt but 40h-old story | Story rejected as fresh; degraded reason identifies publisher time |
| Invalid/missing publisher date | Never substituted with fetch time; reject or explicitly label unverified |
| Same headline, different URL/ID; duplicates; hidden World | Exact multiset and visible DOM checks catch error |
| Aliased Google News sources | Canonical publisher-family diversity budget prevents false independent corroboration |
| Queue missing terminal lane, DLQ, D1 hash corruption | No SHADOW_COMMITTED pointer advance; show data-plane incident |
| Delayed older epoch vs new committed epoch | Monotonic CAS rejects rollback/replay |
| Cloudflare 503/timeout/stale committed pointer | No selection as qualified production source |
| GitHub data endpoint 404, stale blob, stale pointer or bad digest | No publication/selection of bad bytes; qualified alternative or honest degraded state |
| Pointer ahead of CDN/blob, interrupted upload | Pointer stays on preceding good generation; safe recovery |
| Both producers down or all last-known-good expired | Empty/degraded UI and alert, not synthetic headlines |
| Correct build but empty real Pages DOM | Release blocked/failed regardless of CI green |
| Digest backend absent/invalid | Distinct availability reason, not misleading news failure |
| Negative PR evidence workflow file changed | Both mocked and real/unmocked workflow triggers exercised |

**SLO proposals requiring Owner ratification:** acquisition every 3 hours with an accepted static data generation usually available within 6 hours; alert after 1 missed period and escalate after 2, with operational metrics defined on *served qualified data* not producer success; page-origin positive World hydration under its existing 90-second maximum, with a tighter user-experience target to be measured rather than guessed. Require independent sampled real-browser health from more than a single region/device before asserting global availability.

## 10. Sequenced implementation and anti-drift gates

**M0 / evidence + RACI:** actual selected source, worker Cron/Queue/D1/DLQ state, data publication origin and config, current Pages source, independent reviewer credentials and missing Digest backend. Read-only; report UNKNOWN explicitly. Gate: owner-signed authority map and incident correlation.

**M1 / ADR ratification:** decisions on S1 vs future S3, independent data host/provider, publish principal/security and source-age/core-section thresholds. Gate: independent technical review and Owner ratification; do not merge a design-only PR merely to record it while push-to-Pages remains ungated.

**M2 / GitHub data-plane isolation:** dedicate an independent public data host, create verified immutable blobs + one pointer, staged public GET, strict manifest verifier, safe rollback, duplicate/missing card tests. Gate: two successive real end-to-end public releases with no NWv-7 app build; CI and hash evidence attached.

**M3 / Cloudflare repaired qualification:** read-only incident diagnosis first; then separately approved Cloudflare operational remedy. Gate: pointer advances through valid 41-lane SHADOW_COMMITTED epochs and existing #121 comparison window; no unqualified production flip.

**M4 / browser/product integration:** selected-source manifest display, exact DOM identity testing, feature-specific Daily Digest/Insight/Up Ahead checks; graceful degradation. Gate: local, Pages-origin and negative production-equivalent tests across each domain.

**M5 / governance and release:** branch protection/rulesets requiring independent approval, exact-head CI, release rehearsal before publishing, separated app/data deploy identities, postrelease verification and rollback drill. Gate: Owner signed production authorization of exact app SHA and accepted data source/epoch.

**Anti-overlap:** #121 governs Cloudflare qualification; #141 producer and fallback recovery; #143 operational incident; #142 release verifier remains draft/held; #146 Oracle Cycle authority is unchanged; #149 producer code already merged; #137 Digest correction remains independently blocked. Program #150 is the umbrella that reconciles them, not a substitute to silently close them.

## 11. Open decisions and explicit acceptance

| Decision needed | Proposed default | Who must approve |
| --- | --- | --- |
| Current serving authority | Maintain documented S1 GitHub-primary; treat deployed Cloudflare-default as a configuration discrepancy | Owner + independent reviewer |
| Data host | Independent static-host data site, not NWv-7 app Pages artifact | Owner (hosting, credentials, URL, economics) |
| Publication boundary | Immutable blob GET first, externally verified SHA, CAS pointer second | Owner + security/reviewer |
| Age/coverage thresholds | Snapshot <=6h and real publisher-date qualification, core-section gates as in §4 | Owner + editorial/reviewer |
| Cloudflare promotion | None until #121 S2/S3 qualification and explicit separate Owner decision | Owner |
| Release controls | Admin ruleset, nonauthor approval, browser before deploy | Owner administrator + reviewer |

**ADR status remains PROPOSED until decisions are evidenced in #150 and merged with explicit authorization.** The act of writing or reviewing this file does not initiate a release, a new backend, or transfer Oracle control.

## 12. Reproducible existing evidence and direct file references

- [Issue #150 program](https://github.com/reallakshman19/NWv-7/issues/150)
- [Cloudflare shadow contract #121](https://github.com/reallakshman19/NWv-7/issues/121)
- [Cloudflare concept Rev0](https://github.com/reallakshman19/NWv-7/blob/main/docs/architecture/NW_Hybrid_Cloudflare_Sections_Shadow_Concept_Note_Rev0.md)
- [October 26 public source failure](https://github.com/reallakshman19/NWv-7/actions/runs/39216612994)
- [October 26 deployed World failure](https://github.com/reallakshman19/NWv-7/actions/runs/40325704147)
- [Successful GitHub data collector after merge](https://github.com/reallakshman19/NWv-7/actions/runs/40326706304)
- [Actual deployed Cloudflare default](https://github.com/reallakshman19/NWv-7/blob/main/.github/workflows/deploy.yml)
- [Browser selection implementation](https://github.com/reallakshman19/NWv-7/blob/main/src/adapters/sectionsSnapshotLoader.js)
- [Source data policy](https://github.com/reallakshman19/NWv-7/blob/main/scripts/check_sections_recovery_gate.py)
- [Daily Digest API client](https://github.com/reallakshman19/NWv-7/blob/main/src/data/datasets/dailyDigestDatasetApiClient.js)
