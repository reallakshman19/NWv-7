# NWv-7 — Market R4 Weather-Parity UX Recovery

Status: **CANDIDATE — NOT DEPLOYED — SOURCE/RIGHTS/INDEPENDENT REVIEW HOLD**

Baseline: `f07c01d40f492abe8cf866acb246f9d401043a58`.
This change addresses the actual mobile Market first-screen defect, not a native market quote licensing override.

## Source-first defect
- Production `MarketContext` returns an empty price payload whenever `MARKET_FREE_OPEN_ONLY=true`.
- All four index placeholders consequently display `No saved value`, but original R3C tests required only four DOM rows and headings.
- On mobile, a third five-column jump-navigation strip appears before the user sees the index content.
- Native refresh is disabled; the old UI did not provide a real provider-board retry.

## Recovery UX
- Preserve all current financial policy guards. Do **not** reactivate Yahoo scraping, direct NSE API CORS evasion, bulk AMFI quote publication or guessed index values.
- When no qualified native index rows exist, display TradingView's *official hosted Market Overview* widget for `NSE:NIFTY`, `BSE:SENSEX`, `NSE:BANKNIFTY`, `BSE:BSE500`.
- Label it as provider-controlled and source-delayed; don't claim official realtime or convert widget information to app-owned native quotes.
- Reload rebuilds the external widget script; script errors are shown and all four original exchange source links remain.
- In qualified cache/snapshot modes, retain native observations and original quote timestamps without replacing them with a third-party number.
- Remove the extra Market overview jump strip **on mobile only**. Preserve the Market workspace tabs and all nine workspace destinations.
- The Indices workspace itself also shows hosted fallback when there are no qualified native India rows.
- Currency, funds, portfolio, events, news and provenance modules remain intact.

## Contract / limitations
- TradingView widget script being delivered does **not** prove the iframe has populated prices. Cross-origin DOM inspection is intentionally excluded.
- External provider requests occur on Market opening; provider privacy, delay, availability and embedding terms need confirmation for this site.
- No market data is copied, transformed, cached, published, or labeled as live based on widget load.
- A provider-hosted quote board is the first viable index display in free-only mode; a direct licensed native index feed remains unresolved.
- Equity NSE CM MCP/Bhavcopy fallback in draft PRs #209/#210 remains separately blocked by merge conflicts, private gateway setup and real source verification. Do not merge those drafts as a substitute for index-data coverage.

## Verification layers
1. **Unit/React:** Empty native observations must show the provider board, not four empty cards; all four widget symbols and source links must match; reload, blocked embed, future/stale native quotes, source clocks and policy guards preserved.
2. **Built browser with no financial fixture:** Playwright at 320, 360, 390, 430, 768 and 1280px; index board visible; third nav row hidden on mobile; no horizontal overflow; reload triggers another widget script; original source links accessible. Screenshot PNGs and SHA-256 report produced.
3. **Unmocked provider check REQUIRED:** Actual TradingView widget values and provider delay observable on Windows desktop Chromium and Android GitHub Pages preview, with source timing and blocked third-party scenario. Cannot be certified by our script fixture.
4. **Cross-module regression:** Search funds, FX dates/refresh, Watchlist, portfolio, historical native quotes and navigation must remain correct.
5. **Independent OnBoard IR:** Cold reviewer validates behavior from accepted source baseline, not from implementer pass claims or screenshot oracles. Classify this PR as producer SELF_REVIEW until new reviewer returns.
6. **Release:** Approval only after all CI + browser + source/rights + independent review pass. Do not merge or deploy based solely on R4 UI tests.

## Acceptance criteria
- At 360px, index board and provider attribution are visible in the first meaningful screen after the compact Market tab controls.
- For a free-only market payload: zero `.md3-pulse-row` blank numeric cards; one hosted provider board with four named source links.
- For valid retained local index rows: value and actual `quoteAt` retained; source unknown/seed/undated never promoted.
- For missing widget script: user can open all original exchange pages.
- No public quote values appear in published `market_snapshot.json`; `MARKET_FREE_OPEN_ONLY` remains true.
- Existing Weather, Main, Insight, UpAhead routes are not changed.

## Rollback
Revert the R4 UI PR. This is a UI-only index-provider integration; no storage schema or financial publication process has changed.
