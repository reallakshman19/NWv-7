# NSE personal quote bridge — DRAFT / NOT DEPLOYED

Purpose: enable the **owner's personal, informational** NWv-7 Market desk to request an NSE equity quote through the exchange's official Streamable HTTP MCP server, without a public redistribution feed. The site is a static GitHub Pages application; NSE's MCP browser CORS preflight has been independently reported blocked, so a restricted backend is needed.

Official provider: https://www.nseindia.in/nse-mcp
Endpoint: https://mcp.nseindia.in/cmmkt/mcp
Tool: `cm_get_stock_quote` (one allowlisted NSE equity at a time).

## No-publication and rights boundary

- Never use this Worker as a public quote API or relay. Access requires a private bearer token AND an exact allowed browser Origin.
- No schedule, no database, no public JSON/CSV, no service-worker price storage, no cache; one explicit owner action per request.
- Do not enable public access or deploy before NSE source use and noncommercial restrictions are confirmed for this installation. NSE retains ownership of its data.
- Informational personal lookup only. Not for real-time trading, automated signals or financial advice.
- Index prices (NIFTY, BANK NIFTY) are **not** returned by this tool; the overview continues to link to the exchange's original index board.
- The upstream often reports 1–3 minute delayed quotes and may be unavailable; do not label response time as exchange price time.

## Owner-only deployment steps (deliberately NOT automated)

1. Create your own restricted Cloudflare Worker project from `src/index.js`. Copy `wrangler.toml.example` to `wrangler.toml` and set the exact site origin.
2. From `cloudflare/nse-personal-mcp`, run `npx wrangler secret put MARKET_OWNER_TOKEN` and enter a strong unique token privately.
3. Deploy after reviewing applicable NSE usage permissions and installing rate controls / WAF protections appropriate to your private environment.
4. Build NWv-7 with the public, non-secret `VITE_NSE_PERSONAL_GATEWAY_URL=https://<your-worker-domain>`. The token must **not** be placed in Vite env or committed.
5. On the Market tab, enter the owner token (held only in React memory), choose an allowlisted NSE symbol, and click Check NSE quote.
6. Validate the source's `updatedAt` clock, field values, non-session state, HTTP errors and CORS from a real Android GitHub Pages session. Keep deployment on HOLD if live behavior is not demonstrated.

## Verification status

Wire-format handling and normalization can be tested with offline recorded-format fixtures. Live NSE connectivity, exact production CORS behavior and commercial/data-rights approval are NOT verified in this branch. No deployment or merge is authorized by the code itself.
