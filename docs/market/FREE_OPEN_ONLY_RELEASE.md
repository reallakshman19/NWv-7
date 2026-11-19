# NWv-7 Market — Free/open-source-only decision

**Owner direction:** only free and open-source tools/data paths. No paid market-data subscriptions, procurement emails or paid vendor integration. This supersedes the paid-licensing route from Slice 8B as the near-term product plan. No production merge/deployment authority is implied.

## Data rights are not the same as open-source software

NSE and BSE market data carries exchange/index licensing conditions. A scraper, a no-cost endpoint, TejHQ MIT pipeline, yfinance, Stooq download or copied AMFI NAV feed is not by itself an open-data redistribution license. The product will not publish market prices from those feeds.

- India Indices: keep NSE/BSE official links, search, saved index pin UI, and honest `Unavailable` status when quote data is absent. Do not fabricate daily values or use a Yahoo/third-party mirror.
- Equity: preserve the sixteen NSE tracked symbols, watchlist persistence and direct NSE verification links. No public quote prices, changes or derived gainers/losers are served without verified public redistribution rights.
- Funds: preserve direct user-triggered MFapi searches and selected/saved NAV lookup. Those lookups are browser-side and from a free public API, but its AMFI-derived NAV values are not bulk republished by NWv-7. Show source date and stale state; retain provider request caps. Fund SIP is local calculation, no provider dependency.
- IPO/FPO: use official NSE/BSE public pages. BSE HTTP 403 or no refresh is `unverified`/`unavailable`, never zero confirmed issues.
- Currency: use MIT-licensed Frankfurter v2 open API directly from the browser for OMR/INR, with visible attribution, date and 3-day freshness requirement. **Frankfurter does not own underlying central-bank data**, so do not republish rate datasets as public static JSON.

## Public assets and operational safeguards

The branch replaces these four legacy public quote extracts with metadata-only quote-free files: `public/data/market_snapshot.json`, `public/data/mutual_fund_snapshot.json`, `public/data/market_source_health.json`, `public/data/market_metrics.json`. The public Market context and service ignore old quote caches in production and return a truthful free/open-only status. The previous automatic job with Yahoo/AMFI source acquisition, git push to `main` and scheduled publication has been retired in this branch; the workflow now runs only local publisher regression tests without fetching data.

The change lives in a **draft PR** after #177, and has **not modified main, GitHub Pages or Cloudflare**. The earlier screenshots/tests used synthetic source fixtures; the new built-browser test must verify no static quote publication requests, no market quote proxy waterfall, user-initiated funds and currency work, watchlist reload and no 320 px overflow.

## Official references

- NSE rights policy: https://www.nseindia.in/static/market-data/nse-data-policy
- TejHQ data license caveat: https://huggingface.co/datasets/tejhq/indian-markets
- Frankfurter free MIT software license and underlying data terms: https://frankfurter.dev/license/
- Frankfurter OMR/INR reference API: https://api.frankfurter.dev/v2/rate/omr/inr
- Frankfurter Central Bank of Oman provider: https://frankfurter.dev/providers/cbo/
- MFapi free API docs: https://www.mfapi.in/docs/
- Official NSE indices: https://www.nseindia.com/market-data/live-market-indices
- Official NSE equities: https://www.nseindia.com/market-data/live-equity-market
- Official BSE issues: https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx

## Release criteria

Full test/lint/build/browser CI green on the exact draft commit. Verify all four public assets contain **no quotes/NAV values** and the Market workflow has **no scheduled or manual data-writing job**. Inspect third-party provider attributions and cache behavior. Owner must separately approve the exact draft PR merge/deployment; no price data will be displayed on the public page until a genuinely free-to-redistribute feed exists.
