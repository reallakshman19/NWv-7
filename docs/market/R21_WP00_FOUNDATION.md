# NWv-7 Market Desk R2.1 — WP-00 Contract Freeze

Contract **market-r21-contract-v1**. Source C0: main at 838339e5b6bd6696c4ea8a6dd2b7bb142ddc9421 (merged PR #179). Work on an isolated WP-00 branch. DO NOT MERGE OR DEPLOY without separate owner release authority.

## Verified baseline
- Active MarketPage navigation imports src/services/marketWorkspaceRoute.js, currently four workspaces: indices, equity, funds, currency; initial default indices.
- MarketContext.jsx and marketFreeOpenPolicy.js intentionally disable unlicensed native NSE/BSE quote publication and historic cached Yahoo/AMFI quote revival. Keep these protections.
- BseMarketWidget.jsx loads an opt-in third-party TradingView BSE embed. The iframe never supplies native quote values to NWv7.
- Legacy keys: nw7.india-watchlist.v1, nw7.market-saved-funds.v1, nw7.market-index-pins.v1 and dailyEventAI_settings. No destructive migration.
- No legacy source, MarketContext, MarketPage, public/data or publishing workflow changed by WP-00.

## Frozen exports — import src/market/contracts/index.js

| Group | Exports |
| --- | --- |
| Receipt | MARKET_CONTRACT_VERSION, SOURCE_STATES, SOURCE_ACCESS_MODES, SOURCE_RIGHTS, SOURCE_VALIDITY, isSourceClock, validateSourceReceipt, createSourceReceipt, qualifiedSourceResult |
| Identity | canonicalInstrumentKey, parseInstrumentKey, canonicalNseLegacySymbol, canonicalFundCode, planLegacyNseWatchlist, planLegacySavedFunds, MAX_SAVED_EQUITIES, MAX_SAVED_FUNDS |
| Storage | MARKET_LEGACY_STORAGE_KEYS, MARKET_R21_STORAGE_KEYS, MARKET_STORAGE_RULES |
| Source | MARKET_SOURCES, MARKET_SOURCE_ACTIONS, getMarketSource, mayPerformSourceAction |
| R2.1 navigation | R21_MARKET_WORKSPACES, R21_MARKET_WORKSPACE_IDS, R21_DEFAULT_WORKSPACE, normalizeR21MarketView, getR21MarketViewFromHash, withR21MarketViewHash |

## Crucial activation boundary

WP-00 deliberately DOES NOT activate the new Overview route in the live MarketPage. If it changed the current default before WP-01 supplied a real Overview component, Market would render a blank page.

WP-01 builds Overview and WP-10 atomically activates the new registry and replaces old route tests. Until this integration, current four-route MarketPage continues working.

Future R2.1 ids: overview, indices, equity, portfolio, funds, ipo-events, currency-macro, lab, health.
Legacy currency is an alias for currency-macro; legacy hash paths #/market and #/markets must be preserved, including unrelated search parameters.

## Source receipts and rights

- Receipt fields: sourceId, accessMode, state, reasonCode, requestedAt, checkedAt, providerAsOf, providerClockGranularity, originalUrl, publisher, transportStatus, validity, rights, dataVersion.
- sourceId, rights, publisher and accessMode are checked against the immutable registry. A caller cannot relabel NSE as MFapi to bypass policy.
- providerAsOf is the provider observation clock. It is never created from requestedAt, checkedAt or wall clock. Accepted granularity: instant/day/year, explicitly stated.
- READY and HISTORICAL require validity=VALID and a valid provider clock. They cannot originate from a link-only or provider-embed source.
- NO_RESULTS requires valid successful direct acquisition/validation. Official links and scripts cannot prove that zero IPOs or NFOs exist.
- PROVIDER_EMBED never yields native quote values, even when a script loads successfully.
- PUBLIC_SNAPSHOT is disallowed for all registered sources. World Bank needs indicator-specific license review before any native publication.
- The helper qualifiedSourceResult is pure. It never fetches, writes, refreshes or publishes.

## Identity and storage

- NSE:INFY is distinct from BSE:INFY, regardless of issuer. No automatic cross-exchange pairing.
- Bare INFY / INFY.NS may become NSE:INFY only via explicit legacy NSE migration. Do not rewrite the original storage key until roundtrip/rollback are verified by WP-09.
- Fund scheme identity is a 3–8 digit code; preserve leading zeros.
- New schema keys are frozen in MARKET_R21_STORAGE_KEYS; WP-00 does not create live portfolio records.
- WP-04 owns private transaction data; WP-08 supplies pure math; WP-09 owns bounded persistence and provenance displays.

## Feature and integration owner boundaries
- WP-01: overview/new shell; old MarketPage and route adapter only at WP-10 integration.
- WP-02: BSE provider panels, index and sector board; no quote extraction.
- WP-03: NSE equity identities and watchlist/import-export.
- WP-04: private holdings and transactions.
- WP-05: NAV selected-scheme research and historical math.
- WP-06: Frankfurter FX and qualified macro.
- WP-07: official IPO/NFO, events and news reuse.
- WP-08: financial math and Investment Lab.
- WP-09: data health, privacy, cache/provenance.
- WP-10: atomic assembly, source-rights, browser E2E, migrations.
- WP-11: independently derive original requirements, then challenge integrated candidate.

WP-01 through WP-09 must not edit src/market/contracts or src/market/registry. A contract amendment needs a version bump, test, impacted-consumer list and coordinator decision.

## Tests and proof
Run on Node 22: node --test scripts/test_market_r21_contracts.mjs
CI workflow: .github/workflows/market-r21-wp00-contracts.yml

Covered: future route identity and aliases; unchanged current active route; query preservation; NSE/BSE separation; legacy migration non-mutation; date/clock rejection; HTTP 200 without valid source clock; forged publisher/access/rights; false verified-zero; provider-embed extraction; public quote policy.

Full lint, Vitest, full build, live providers and browser layout are not certified by this narrow WP-00 test and remain later integration gates.

## Release invariants
No paid vendor; no Cloudflare/Pages production mutation; no scheduled market-quote publication; no copied third-party native quotes; no source timestamp fabrication; no loss of saved user information. Commit/test PASS is not owner approval.
