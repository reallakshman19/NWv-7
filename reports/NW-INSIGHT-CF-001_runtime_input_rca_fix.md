# NW-INSIGHT-CF-001 — Insight runtime input RCA and repair

Date: 2026-09-02  
Base: `8a9b9d365fc3f932f65106f01b6e8297c5be61fb`  
Branch: `nw-insight-cf-001-unify-runtime-input`

## Status

Implementation is complete on the branch. No GitHub workflow was created, modified, or dispatched. A pull request is intentionally not opened from this session because the repository CI workflow runs on `pull_request` and the project owner has explicitly constrained GitHub Actions usage due to credits.

Dependency-backed lint, Vitest, build, browser certification, Wrangler deployment, and production Cloudflare verification are **NOT_RUN** in this session. The private repository is not mounted in the execution container, the container has no external network access, and GitHub Actions was intentionally not used.

## RCA

The production symptom was not a single Cloudflare failure.

1. The old GitHub data-production architecture is no longer present. The workflow directory contains only `ci.yml` and `deploy.yml`, while `deploy.yml` still references historical producer workflow names. Pages can deploy current application code but cannot generate fresh news snapshots by itself.
2. Insight was not consuming the Cloudflare Sections Preview. On static hosting it used `public/newsdata/insight_latest.json`, then fell back to browser-side search/RSS proxy acquisition after the snapshot exceeded its 48-hour stale ceiling.
3. The browser fallback destroyed publication-date provenance. `newsService.js` converted RSS `pubDate` to a clock-only display string and omitted numeric `publishedAt`; `newsFetcher.js` then substituted `Date.now()` when no publication timestamp was present. Old search results therefore entered Insight as apparently new stories and rendered as `0m ago`.
4. The Insight runtime quality gate then correctly rejected the thin/low-diversity result, producing the observed empty state rather than rendering low-quality clusters.
5. The latest CI failure contained two independent stale certifications: an empty-section health test still expected `Unknown` after the product contract changed to `Critical`, and a deterministic historical Top Stories replay test depended on an expired real study configuration.

## Repair architecture

When Cloudflare Preview is explicitly selected, Insight now uses the same independently acquired, verified Sections epoch as its input authority:

```text
Cloudflare committed Sections epoch
    -> Sections snapshot loader
    -> fail-closed Cloudflare authority check
    -> flat deduplicated Insight evidence pool
    -> existing Insight slotting/normalization
    -> existing clustering/tree/ranking
    -> existing runtime quality gate
```

The adapter accepts Cloudflare input only when:

- the effective runtime data source is `cloudflare_preview`;
- `preview.evidenceVerified === true`;
- `fetchedAt` is valid;
- at least one story has a title, URL, and real numeric publication timestamp.

A Sections loader fallback to GitHub is **not** accepted as Cloudflare Insight evidence. The Cloudflare attempt returns an explicit fallback reason and the existing Insight source chain then continues.

When Cloudflare is not selected, the legacy Insight authority chain is preserved. When Cloudflare is selected but unavailable/unusable, the fallback reason is retained in dataset diagnostics and validation warnings.

The Sections source toggle already clears the Sections cache, dataset envelope cache, and news cache, then reloads the page. This prevents a previously cached GitHub/live Insight envelope from masking a newly selected Cloudflare source.

## Timestamp provenance repair

`newsService.js` now preserves a numeric publication timestamp instead of only a formatted clock time. Aggregator timestamps are explicitly identified as:

- `newsdata_pubdate`
- `google_news_rss_timestamp`
- `bing_news_rss_timestamp`

They carry `timestampConfidence: medium` when present. Missing or invalid timestamps remain missing/zero.

`newsFetcher.js` resolves publication time from Schema.org first, then available feed/article timestamp fields. It no longer substitutes `Date.now()` for an absent or malformed publication time. Stories without a proven publication timestamp are removed before the Insight live fallback pipeline.

This closes the specific failure that made July/August stories appear as `0m ago` on 2026-09-02.

## Cloudflare-to-Insight projection rules

`insightSectionsSnapshotAdapter.js`:

- is pure and read-only;
- deduplicates the cross-section pool by URL/id;
- processes `topStories` first so a duplicate retains `topFeedRank` and `topFeedSource` signals;
- rejects missing timestamps;
- preserves source/sourceGroup, summary, category and existing collector signals;
- records the committed epoch/source-registry authority in `sourceAuthority`.

No Insight quality thresholds were lowered. No Top Stories ranking policy was changed.

## Diagnostics truthfulness

The new Insight source is exposed as `cloudflare-sections` at the dataset envelope boundary. Core Insight diagnostics and the Insight ViewModel label this as `Cloudflare Sections`, rather than silently calling it `Live`.

If a Cloudflare input attempt falls back, `runtimeInputFallbackReason` is exposed in the fetcher/dataset diagnostics and the validation warning `insight_cloudflare_input_fallback` is emitted.

## Certification changes

New certifications cover:

- publication timestamp preservation and fail-closed missing timestamps;
- Cloudflare authority selection without touching Cloudflare when GitHub is selected;
- explicit fallback reason when the Sections loader falls back to GitHub;
- verified Cloudflare-only projection;
- URL dedupe, Top Stories signal retention, and timestamp rejection;
- explicit Cloudflare dataset and ViewModel labels.

The two certification failures observed on the latest main CI run were repaired in source:

- empty served section now certifies `Critical` with `served_section_empty` and `source_health_unavailable`;
- the historical Top Stories aggregation test now writes a temporary non-expired test copy of the study config. The real production study config remains unchanged and its expiry enforcement remains intact.

## Changed surface

No `.github/workflows/*` file is part of this branch delta.

Functional files:

- `src/services/newsService.js`
- `src/adapters/newsFetcher.js`
- `src/adapters/insightCloudflareInput.js`
- `src/adapters/insightSectionsSnapshotAdapter.js`
- `src/adapters/insightFetcher.js`
- `src/data/datasets/insightDataset.js`
- `src/insight/src/diagnostics/insightCoreQuality.ts`
- `src/viewModels/useInsightTabViewModel.js`

Certification files:

- `src/adapters/newsFetcher.timestamp.cert.test.js`
- `src/adapters/insightCloudflareInput.cert.test.js`
- `src/adapters/insightSectionsSnapshotAdapter.cert.test.js`
- `src/data/datasets/insightDataset.cloudflare.cert.test.js`
- `src/viewModels/useInsightTabViewModel.cert.test.js`
- `src/components/NewsSection.runtimeHealth.cert.test.jsx`
- `src/services/topStories/topStoriesShadowAggregationWorkflow.cert.test.js`

## Validation record

| Check | Status | Evidence / reason |
|---|---|---|
| Main base unchanged during implementation | PASS | main remained `8a9b9d365fc3f932f65106f01b6e8297c5be61fb` |
| Branch compare is fast-forward from audited base | PASS | branch ahead, behind 0 |
| GitHub workflow delta | PASS | zero workflow files in compare |
| Timestamp `Date.now()` fabrication removed | PASS by source review | missing timestamp now resolves to 0 and is filtered |
| Cloudflare effective-source verification | PASS by source review | projection requires `cloudflare_preview` + verified evidence |
| GitHub fallback mislabeled Cloudflare | PASS by source review | fallback projection returns null + explicit reason |
| Top Stories duplicate signal preservation | PASS by source review | `topStories` projection ordered first |
| Insight quality gate unchanged | PASS by source review | no threshold changes |
| Source toggle cache invalidation | PASS by source review | toggle clears caches and reloads |
| Vitest | NOT_RUN | GitHub Actions intentionally not used; repo not locally mounted |
| ESLint | NOT_RUN | same constraint |
| Build | NOT_RUN | same constraint |
| Browser/production smoke | NOT_RUN | no deployed branch build |
| Wrangler/Cloudflare deploy | NOT_RUN | production config/credentials unavailable in this runtime |
| Natural Cloudflare Cron proof | NOT_RUN | requires deployed Worker/runtime evidence |

## Remaining activation dependency

This branch fixes application-side Insight authority and timestamp behavior, but it cannot make Cloudflare current by itself. The deployed Sections Worker still needs independent production proof that the merged live-acquisition configuration is active and producing committed epochs. Until that is proven, selecting Cloudflare may legitimately fall back and will now say so explicitly.

## Handover

The branch is ready for external/local dependency-backed verification. Opening a PR from this branch will trigger the repository `CI Validation Gate`; that action was deliberately not performed here to respect the no-Actions-credit constraint.
