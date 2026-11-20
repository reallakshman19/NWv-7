# NWv-7 Market — Source authorization and release-candidate custody

**Review date:** 19 November 2026. **Authority:** read-only source/licensing investigation and private candidate preparation; no merge, data redistribution or deployment.

## Source-rights findings

| Data class | Supplier / technical observation | Legitimate route | Decision |
| --- | --- | --- | --- |
| 6 India indices incl. SENSEX | Yahoo Finance charts derived from exchange/index data; no shown public rebroadcast grant | NSE Data & Analytics, BSE/index owners or explicitly authorized public-web-display reseller | UNVERIFIED — no new quote publication |
| 16 tracked NSE shares and derived movers | Yahoo *.NS chart source; NSE data policy governs use and redistribution by agreement | Obtain written web display, storage and downstream distribution license covering selected shares and derived percentages | UNVERIFIED — no new quote publication |
| AMFI NAV / NFO | Public AMFI endpoint, site terms limit access to personal/non-commercial use and prohibit unauthorized public publication | Obtain AMFI written permission or independently licensed NAV/NFO publisher | UNVERIFIED — no new NAV/NFO publication |
| BSE IPO | HTTP 403 observed in one-time source dry run | Link official BSE/NSE public issue pages; investigate a licensed BSE feed, no proxy bypass | UNAVAILABLE — not evidence of zero IPOs |
| OMR/INR calculator | ExchangeRate-API open endpoint | Direct browser conversion with linked attribution, caching and 429 limits; no republishing provider rates | CONDITIONAL CONVERSION USE, not data redistribution |

Official references:
- NSE Data Sharing & Usage Policy: https://www.nseindia.in/static/market-data/nse-data-policy
- NSE subscriptions and authorized vendors: https://www.nse.in/static/market-data/real-time-data-subscription
- NSE site Terms: https://www.nseindia.in/static/nse-terms-of-use
- BSE data-feed catalogue: https://marketdata.bseindia.com/
- BSE public issues: https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx
- NSE public issues: https://www.nseindia.com/market-data/all-upcoming-issues-ipo
- AMFI site terms: https://www.amfiindia.com/terms-of-use
- Yahoo terms: https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html
- Yahoo third-party market providers: https://help.yahoo.com/kb/finance/SLN2310.html
- ExchangeRate-API open access terms: https://www.exchangerate-api.com/docs/free

Availability, attribution, non-commercial personal use, delayed quotations, or a successful HTTP request must never be misrepresented as permission to publicly publish the feed. This is an engineering rights screen, not a legal clearance.

## Specific permission to obtain

Ask the vendor or exchange/data licensor for an executed agreement identifying the data and upstream rights holder, precise web audience and territory, 6 indices, 16 NSE symbols, derived movers, delayed/daily clocks, historical/cached data, static JSON in a public GitHub repository, GitHub Pages/Cloudflare public display and CDN caching, retention periods, redistribution clauses, financial use class, attribution, effective dates and termination. An index-data licensor may be separate from the exchange. Obtain separate NAV/NFO rights as applicable. Keep original evidence outside public repositories.

## Private release-candidate workflow

The source-dated live dry run from Slice 7 discarded its candidate and did not authorize publication. The existing public snapshot remains old and has no 16-share equity array. Do not synthesize source values or revive the old candidate's collection time.

Use scripts/prepare_market_publication_candidate.mjs with these arguments after approved source acquisition and signed permission documents:
- --candidate /private/input/market_snapshot.json
- --nav-sidecar /private/input/mutual_fund_snapshot.json
- --health-sidecar /private/input/market_source_health.json
- --rights /private/rights/rights.json
- --evidence-dir /private/rights/evidence
- --out-dir /private/output/market-candidate
- --stage (optional private staging only)

All three assets must share the original source-generated collection timestamp and agree on NAV contents, NAV source health, publisher validation and full market source-health receipt. Every asset is independently hashed with SHA-256; an ordered bundle digest binds all three as an additional rights-manifest reference. No candidate values are printed in metadata receipts. Private output must be outside the checkout and no workflow deploys or writes public/data.

The intentionally unapproved RIGHTS_EVIDENCE_TEMPLATE.json requires a candidate SHA-256, full bundle SHA-256, applicable grants for each present class and source layer, grant ID, named grantor/licensee, rights (public-display, reproduce, distribute), effective window, private evidence filename and SHA-256. Indices and equities require provider and underlying-exchange coverage, even if a comprehensive executed agreement might eventually cover both.

**The gate does not grant rights:** matching evidence bytes do not prove contract authenticity, legal sufficiency or correct authorized use. The result always states HOLD_FOR_LEGAL_AND_OWNER_APPROVAL and publicationAuthorized=false. Technical and document-hash checks merely establish a private inspection/staging result; a human rights reviewer and separate explicit Owner approval of exact asset/commit hashes are necessary before production release.

## Current release disposition

- ENGINEERING: Slice 8A draft PR #176 previously passed 93 Node, 44 Python, 88 focused Vitest, 1,915 full-app Vitest (8 skipped), build/lint and 45 Chromium fixture assertions.
- DATA: existing public/data/market_snapshot.json failed the 24-hour source age and 16-equity readiness requirements at latest inspection.
- RIGHTS: not established for public quote, NAV or IPO redistribution. Do not publish or request additional unlicensed live source values for this release candidate.
- AUTHORITY: no merge or deployment has been approved. A production scheduled refresh workflow on main may still exist; this preparation branch does not change it.

Next human decision: obtain applicable written source licenses or select a licensed vendor, review all affected clauses, then prepare one fresh candidate from an authorized source and record exact bundle SHA-256 for a separate release authorization.
