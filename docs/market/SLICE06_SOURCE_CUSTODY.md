# NWv-7 Market — Slice 6 source custody and publication readiness

**Authority:** READ_ONLY qualification. No merge, deployment, Cloudflare mutation, external quote acquisition or redistribution is authorized by this work.

## Verified checkpoint facts — 19 November 2026

- Slice 5 (PR #173) built-browser qualification passed **69 Node**, **27 publisher**, **80 targeted Vitest**, **1,907 full-suite Vitest** (8 skipped), lint/build and **30 Chromium assertions**. Those used deterministic/fixture-based providers.
- `public/data/market_snapshot.json` on the accepted checkpoint is dated **2026-11-18T12:22:59.592515Z**. It includes six index quotes and older top-mover fields but **no `equities` array or equity-coverage receipt**. This does not demonstrate delivery of the intended 16 tracked NSE shares.
- `docs/data/market_snapshot.json` is a different, July 2026 schema; do not treat it as the authoritative public asset.
- The revised `scripts/refresh_india_market.py` can produce source-dated equities, but its existing workflow, `.github/workflows/market_refresh.yml`, automatically writes only from `main`. That source-acquisition and publication path has not been independently certified against live providers and redistribution permission.
- The legacy `scripts/test_market_snapshot_integrity.mjs` can return success after skipping freshness checks for snapshots more than 48 hours old. Its success cannot establish release freshness.

## New read-only gate

Run `node scripts/check_market_publication_readiness.mjs --out reports/market-publication-readiness.json`. The script never requests market data, mutates the source file, invents quote dates or reports rights as approved. `--enforce-technical` intentionally exits nonzero on technical HOLD.

**Technical HOLD:** collection older than 24 hours, missing or non-offset clocks, index quote older than five days, fewer than three eligible India indices, missing NIFTY 50, missing tracked equity array, zero eligible shares, duplicate/invalid NSE identity, mismatching source-health or coverage receipt.

**Technical PASS:** those structural and source-clock checks are satisfied at inspection time. Partial coverage is visible as a note and requires truthful unavailable-symbols metadata. This does not prove live upstream rights or deployed Pages equality.

**Release HOLD:** is maintained while publisher redistribution rights are unverified. A technical PASS is not Owner merge or deployment authority. The branch-only GitHub workflow stores its JSON receipt and has `contents: read` permissions.

## Source terms reviewed — not an authorization claim

| Source | Purpose | Review required |
|---|---|---|
| Yahoo Finance chart | Six India indices and 16 tracked shares | Yahoo terms restrict some republishing and competitive datasets; third-party data licensors can impose further restrictions. https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html and https://help.yahoo.com/kb/finance/SLN2310.html |
| AMFI NAV/NFO | Mutual-fund public snapshot | AMFI's site terms describe personal/non-commercial permitted use and restrict unauthorized public publication. https://www.amfiindia.com/terms-of-use |
| BSE IPO API | IPO schedule | Public redistribution rights are unverified; no grant in custody |
| MFapi.in | Browser-initiated saved NAV and search | API docs describe rate limits and no-auth endpoints; keep bounded concurrency, caching and 429 handling. https://www.mfapi.in/docs/ |
| ExchangeRate-API open endpoint | OMR/INR browser converter | Provider explicitly permits cached conversion but requires linked attribution and prohibits redistribution. https://www.exchangerate-api.com/docs/free |

The Currency workspace has been updated to show the required **Rates By Exchange Rate API** link. This does not authorize rebroadcasting the provider's rate tables.

## Release sequence

1. Obtain applicable documented permissions or select licensed alternative sources for any public redistribution; never infer rights from an accessible endpoint.
2. Execute any live producer check as a **separately authorized, bounded dry run in temporary storage**; do not touch `main` or copy values into published datasets.
3. Inspect HTTP/source-health receipts, counts (maximum 25 upstream requests), original quote timestamps, eligible 16-share coverage, unchanged fallback history, and validation results.
4. Run both publisher validation and the independent technical readiness checker against the resulting candidate; retain exact file hashes and a signed rights/approval decision.
5. After explicit Owner authorization, merge/deploy separately and compare published asset SHA against the approved candidate. Monitor age and source failures.

This stage is stacked after PR #173 and does not merge or deploy either branch.
