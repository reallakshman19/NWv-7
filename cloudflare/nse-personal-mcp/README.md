# NSE personal quote bridge — DRAFT / NOT DEPLOYED

Purpose: enable the **owner's personal, informational** NWv-7 Market desk to request an NSE equity quote through the exchange's official Streamable HTTP MCP server, without a public redistribution feed. The site is a static GitHub Pages application; NSE's MCP browser CORS preflight has been independently reported blocked, so a restricted backend is needed.

Official provider: https://www.nseindia.in/nse-mcp
Endpoint: https://mcp.nseindia.in/cmmkt/mcp
Tool: `cm_get_stock_quote` (one allowlisted NSE equity at a time).

## Explicit two-fallback source cascade

| Order | Technical path | What the user sees | Limitation |
| --- | --- | --- | --- |
| Primary | `cm_get_stock_quote` on `https://mcp.nseindia.in/cmmkt/mcp` | Dated delayed NSE equity price, labeled CM primary | NSE advertises 1–3-minute delay; the result may be stale/outage |
| Fallback 1 | `get_bulk_quote` for the same symbol on `https://mcp.nseindia.in/bhavcopy/cm/mcp` | Dated *end-of-day close*, explicitly NOT LIVE | Separate NSE EOD server, not an independent non-NSE provider |
| Fallback 2 | TradingView **NSE Symbol Info branded embed**, loaded only after visitor action | Provider-hosted NSE view, approximately 15 minutes delayed on the free tier | Data never extracted into our app; blocked embeds fall back to direct TradingView link |
| Final recovery | Official NSE symbol-specific link | Original NSE web quote page | External site, not an app-owned quote |

The backend only automatically switches from CM to EOD when CM cannot produce a qualified observation. The TradingView visual fallback requires explicit visitor consent and has no extraction or public snapshot side effect. EOD returns `priceDate` (date only), not an invented `quoteAt`; the frontend visibly labels it *NOT LIVE*. If both MCP sources fail, the UI retains the independently hosted TradingView option and official NSE link.

Independent references:
- https://www.nseindia.in/nse-mcp (two official MCP services)
- https://www.tradingview.com/widget-docs/widgets/symbol-details/symbol-info/
- https://www.tradingview.com/data-coverage/ (free NSE data delayed 15 minutes)



## No-publication and rights boundary

- Never use this Worker as a public quote API or relay. Access requires a private bearer token AND an exact allowed browser Origin.
- No schedule, no database, no public JSON/CSV, no service-worker price storage, no cache; one explicit owner action per request. The fallback makes a second NSE MCP request only if the primary fails or its response is unqualified.
- Do not enable public access or deploy before NSE source use and noncommercial restrictions are confirmed for this installation. NSE retains ownership of its data.
- Informational personal lookup only. Not for real-time trading, automated signals or financial advice.
- Index prices (NIFTY, BANK NIFTY) are **not** returned by this NSE CM tool; the overview continues to link to the exchange's original index board. The TradingView widget is a provider-hosted NSE **equity** view, not a native index level feed.
- The upstream often reports 1–3 minute delayed quotes and may be unavailable; do not label response time as exchange price time.

## Owner-only deployment steps (deliberately NOT automated)

1. Create your own restricted Cloudflare Worker project from `src/index.js`. Copy `wrangler.toml.example` to `wrangler.toml` and set the exact site origin.
2. From `cloudflare/nse-personal-mcp`, run `npx wrangler secret put MARKET_OWNER_TOKEN` and enter a strong unique token privately.
3. Deploy after reviewing applicable NSE usage permissions and installing rate controls / WAF protections appropriate to your private environment.
4. Build NWv-7 with the public, non-secret `VITE_NSE_PERSONAL_GATEWAY_URL=https://<your-worker-domain>`. The token must **not** be placed in Vite env or committed.
5. On the Market tab, enter the owner token (held only in React memory), choose an allowlisted NSE symbol, and click Check NSE quote.
6. Validate NSE CM `updatedAt`, EOD `priceDate`, field values, source tier and HTTP errors from a real Android GitHub Pages session. Separately load the branded TradingView widget only after consent and confirm no data is scraped or cached. Keep deployment on HOLD if live behavior is not demonstrated.

## Verification status

Wire-format handling, NSE source exhaustion/EOD qualification, and TradingView opt-in behavior are covered by offline/mock fixtures. Live NSE connectivity, exact production CORS behavior and commercial/data-rights approval are NOT verified in this branch. No deployment or merge is authorized by the code itself.
