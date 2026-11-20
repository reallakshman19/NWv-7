# NWv-7 Market — Free/open-source-only decision

**Owner direction:** use free market-data sources. No paid market-data subscriptions or paid vendor integration. The Owner has authorized integration and merge after verification.

## Data rights are not the same as open-source software

NSE and BSE market data carries exchange/index licensing conditions. A scraper, a no-cost endpoint, TejHQ MIT pipeline, yfinance, Stooq download or copied AMFI NAV feed is not by itself an open-data redistribution license. The product will not publish market prices from those feeds.

- India Indices and Equity: the optional, branded TradingView widget displays selected BSE end-of-day indices and shares directly from the provider. It loads only on user request, discloses the third-party connection and keeps provider links as a fallback. It does not populate the app's NSE watchlist, extract widget data or imply live NSE quotes. NSE/BSE official links and watchlist persistence remain available.
- Funds: preserve direct user-triggered MFapi searches and selected/saved NAV lookup. Those lookups are browser-side and from a free public API, but its AMFI-derived NAV values are not bulk republished by NWv-7. Show source date and stale state; retain provider request caps. Fund SIP is local calculation, no provider dependency.
- IPO/FPO: use official NSE/BSE public pages. BSE HTTP 403 or no refresh is `unverified`/`unavailable`, never zero confirmed issues.
- Currency: use MIT-licensed Frankfurter v2 open API directly from the browser for OMR/INR, with visible attribution, date and 3-day freshness requirement. **Frankfurter does not own underlying central-bank data**, so do not republish rate datasets as public static JSON.

## Public assets and operational safeguards

The branch replaces these four legacy public quote extracts with metadata-only quote-free files: `public/data/market_snapshot.json`, `public/data/mutual_fund_snapshot.json`, `public/data/market_source_health.json`, `public/data/market_metrics.json`. Market context and service ignore old quote caches in every build mode and return an explicit free-only status. The previous automatic job with Yahoo/AMFI source acquisition, git push to `main` and scheduled publication has been retired in this branch; the workflow now runs only local publisher regression tests without fetching data.

The change lives in a **draft PR** after #177, and has **not modified main, GitHub Pages or Cloudflare**. The earlier screenshots/tests used synthetic source fixtures; the new built-browser test must verify no static quote publication requests, no market quote proxy waterfall, user-initiated funds and currency work, watchlist reload and no 320 px overflow.

## Official references

- NSE rights policy: https://www.nseindia.in/static/market-data/nse-data-policy
- TejHQ data license caveat: https://huggingface.co/datasets/tejhq/indian-markets
- Frankfurter free MIT software license and underlying data terms: https://frankfurter.dev/license/
- Frankfurter OMR/INR reference API: https://api.frankfurter.dev/v2/rate/omr/inr
- Frankfurter Central Bank of Oman provider: https://frankfurter.dev/providers/cbo/
- MFapi free API docs: https://www.mfapi.in/docs/
- TradingView free widget and attribution: https://www.tradingview.com/widget/
- TradingView widget market coverage (BSE EOD): https://www.tradingview.com/widget-docs/markets/asia-pacific/
- Official NSE indices: https://www.nseindia.com/market-data/live-market-indices
- Official NSE equities: https://www.nseindia.com/market-data/live-equity-market
- Official BSE issues: https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx

## Release criteria

Verify tests, build and browser behavior on the integrated candidate. All four public assets must contain **no copied quotes/NAV values**, and the Market workflow must have **no scheduled or manual data-writing job**. Preserve third-party attribution and honest source dates; TradingView independently renders its own widget and may be unavailable or subject to provider restrictions.
