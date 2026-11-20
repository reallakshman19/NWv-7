# NWv-7 Market Desk R2.1 — Agent Dispatch Matrix

Read R21_WP00_FOUNDATION.md first. Contract: market-r21-contract-v1.
Original C0: 838339e5b6bd6696c4ea8a6dd2b7bb142ddc9421.
Foundation ref: feat/market-r21-wp00-contracts-20261120. Pin the EXACT foundation commit SHA from coordinator handoff, never a floating branch.
Status: workpack execution may be assigned; no merge or deployment authorization is inferred.

| Pack | Outcome | Exclusive new namespace | Shared integration edits |
| --- | --- | --- | --- |
| WP-01 | Default Overview, nav, mobile/print | src/market/features/overview/ | MarketPage.jsx and route adapter: WP-10 only |
| WP-02 | Provider BSE, indices/sectors/movers | src/market/features/providers/ | BseMarketWidget.jsx: coordinator only |
| WP-03 | Equity/watchlist/research | src/market/features/equity/ | MarketWorkspaceTools.jsx: WP-10 only |
| WP-04 | Local transaction ledger/holdings/P&L | src/market/features/portfolio/ | None |
| WP-05 | Selected fund NAV/history/compare | src/market/features/funds/ | MarketWorkspaceTools.jsx: WP-10 only |
| WP-06 | FX/macro/dated historical observations | src/market/features/macro/ | Existing FX tool: WP-10 only |
| WP-07 | IPO/NFO/events and finance briefing | src/market/features/events/ | Existing news producer: read-only |
| WP-08 | Pure math, SIP/XIRR and lab | src/market/math/, src/market/features/lab/ | None |
| WP-09 | Source health/rights/cache/privacy | src/market/features/health/ | MarketContext.jsx: WP-10 only |
| WP-10 | Integration/route activation/e2e fix | Integration branch only | All shared paths through controlled integration |
| WP-11 | Cold independent challenge | Reports/tests, READ_ONLY | No implementation, merge or deploy |

Agents must return exact base/head SHA, changed paths, native tests with PASS/FAIL/NOT_RUN, adverse scenarios, saved-data compatibility, browser evidence when executed, policy compliance, unresolved failures and a recoverable patch/source package. No fabricated evidence.

Protected: marketFreeOpenPolicy=true; no paid keys; no native quote copying or TradingView iframe scraping; no public holdings; no silent cache migration; no fake IPO zero; no synthetic source clocks; no unapproved production mutations.

WP-01 cannot activate Overview until its UI exists. WP-10 owns that integration switch and must preserve existing deep links. Full UI acceptance includes 320px and 390px, visible provider failure fallbacks, printed full route information, and independent challenge from WP-11.

Owner releases only after WP-10 integration and WP-11 evidence. Workpack completion is not production acceptance.
