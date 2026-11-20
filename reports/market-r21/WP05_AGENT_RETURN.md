# WP-05 Deliverable Return & Evidence Receipt

**Workpack:** WP-05 (Mutual Funds Desk & Analytics)  
**Branch:** `feat/market-r21-wp05-funds-analytics`  
**Base Commit:** `2510cac78e4ec177efaaedfb8de2ac3504415813`  
**Delivered Commit:** `6726111a31d6c364b516b142b4cf41a7a8300919`  
**Contract:** `market-r21-contract-v1`  
**Timestamp:** 2026-11-20T13:30:00+04:00  

---

## 1. Executive Summary
WP-05 delivers a complete, direct-source mutual funds research, risk analytics, and comparison desk conforming strictly to the approved engineering specification and review requirements:

1. **Strict Scheme Identity Verification (P0-01):**
   - Every response from MFapi undergoes canonical verification: `canonicalFundCode(response.meta.scheme_code) === canonicalFundCode(requestedCode)`.
   - Cross-scheme payloads (e.g. requesting 125497 and receiving 125498) are rejected fail-closed with `SCHEME_CODE_MISMATCH`.
   - Scheme metadata preserves Plan (Direct vs Regular) and Option (Growth vs IDCW); IDCW schemes carry explicit disclaimers that historical NAV price changes exclude cash payouts and dividend reinvestments.

2. **Deterministic 7-Day Lookback Window Trailing Returns (P0-02):**
   - Trailing returns algorithm strictly searches the calendar interval $[Date_{target} - 7\text{d}, Date_{target}]$.
   - Never picks observations after the target date; never extrapolates or manufactures points.
   - If no observation exists within the 7-day lookback window, the period return is safely marked `available: false` and rendered as "Unavailable".
   - True observation dates and actual elapsed days are tracked and used in compound annualization.

3. **4,000-Point History Truncation Semantics (P0-03):**
   - High-observation historical series are capped at 4,000 observations, retaining the newest 4,000 points sorted in chronological `date ASC` order.
   - Truncated metrics are explicitly labeled **"Available-period CAGR"** with start and end dates prominently displayed, never mislabeled as "Since Inception".

4. **Common-Date Multi-Scheme Comparative Analysis (P0-04):**
   - Multi-fund comparison normalizes across the strict date intersection of selected schemes.
   - Trajectories are rebased to base-100 ($I_t = \frac{NAV_t}{NAV_{base}} \times 100$) at the start of the horizon.
   - Discloses that base-100 indexing reflects relative percentage NAV movement, not identical risk profiles.

5. **Same-Day IST Caching & Transport Resilience (P0-05):**
   - Implements same-day Indian Standard Time (IST, UTC+05:30) date-keyed caching via `getIstDayKey()`.
   - Max 3 concurrent requests queue avoids saturating upstream API.
   - 429 cooldown tracking (`cooldownUntil`, `isCoolingDown`) prevents cascading failures and preserves cached NAV availability.
   - Zero-boot network policy: no background polling or automatic network requests on page load.

6. **WP-08 SIP Math Adapter Boundary (P0-06):**
   - Consumes the WP-08 `calcSip` shared contract interface and maintains a conforming end-of-month ordinary annuity reference solver ($FV = P \times \frac{(1+r)^n - 1}{r}$).
   - Historical rate shortcut labeled *"Use historical rate as illustrative assumption"* and disabled if the required historical window is incomplete.
   - Prominent disclaimer that simulations do not constitute investment forecasts or return guarantees.

7. **Risk Metrics & Maximum Drawdown (P1-01):**
   - Peak-to-trough Maximum Drawdown (MDD) calculation.
   - Annualized volatility requires a minimum of 20 trading observations and excludes calendar gaps $> 4$ days from variance calculation.

8. **Formula Injection Sanitization & Safe Portability (P1-02):**
   - Sanitizes CSV cells starting with `^[=+@\t\r|-]` with leading `'`.
   - Full fidelity JSON backup vs CSV watchlist export.
   - Safe localStorage persistence under legacy key `nw7.market-saved-funds.v1` (max 12 schemes) and R2.1 cache key `nw7.market-fund-history.v1`.

9. **Path Isolation & Zero Shared File Modifications:**
   - Zero changes made to shared market files (`MarketPage.jsx`, `MarketWorkspaceTools.jsx`, `MarketContext.jsx`, `marketWorkspaceRoute.js`, `storagePolicy.js`, etc.).
   - All authored components are isolated under `src/market/features/funds/**`.

---

## 2. Deliverables Inventory
| File | Lines / Size | Purpose |
|---|---|---|
| `src/market/features/funds/fundMath.js` | 338 lines / 14.4 kB | Pure financial math: 7-day lookback trailing returns, 365.25 CAGR, MDD, gap-filtered volatility, base-100 rebase, comparative alignment |
| `src/market/features/funds/fundSipAdapter.js` | 74 lines / 2.7 kB | WP-08 calcSip contract consumer & conforming end-of-month ordinary annuity reference solver |
| `src/market/features/funds/fundClient.js` | 336 lines / 12.3 kB | MFapi transport client, host allowlist check, strict scheme identity verification, source receipt builder, 429 cooldown |
| `src/market/features/funds/fundStore.js` | 585 lines / 18.4 kB | Pub/sub manager for `nw7.market-saved-funds.v1` & `nw7.market-fund-history.v1`, same-day IST cache, max-3 queue, CSV/JSON portability |
| `src/market/features/funds/FundNavChart.jsx` | 368 lines / 13.8 kB | Pure SVG trajectory chart, single-fund range selector, multi-fund base-100 overlay, screen-reader table fallback |
| `src/market/features/funds/FundCompareModal.jsx` | 275 lines / 10.1 kB | Multi-scheme comparison dialog, common-date metrics alignment, side-by-side risk table |
| `src/market/features/funds/FundSipModal.jsx` | 199 lines / 7.3 kB | SIP compounding calculator dialog with historical rate shortcut & regulatory disclaimers |
| `src/market/features/funds/FundSummary.jsx` | 96 lines / 3.5 kB | Compact zero-boot card for Overview (WP-01) integration |
| `src/market/features/funds/FundsPanel.jsx` | 619 lines / 26.2 kB | Complete mutual funds workspace panel: Saved, Research, and Search tabs |
| `src/market/features/funds/funds.css` | 370 lines / 9.8 kB | Accessible, responsive dark/light styling |
| `src/market/features/funds/index.js` | 47 lines / 1.1 kB | Canonical barrel exports |
| `src/market/features/funds/INTEGRATION_PATCH_WP10.md` | 58 lines / 2.1 kB | Bounded integration patch instructions for WP-10 coordinator |
| `src/market/features/funds/Funds.cert.test.jsx` | 296 lines / 11.1 kB | Vitest React testing-library certification suite (12 tests) |
| `scripts/test_market_r21_wp05_funds.mjs` | 335 lines / 13.2 kB | Node-native contract and algorithm verification suite (10 tests) |

---

## 3. Test & Verification Gates
1. **Node Native Test Suite:**
   - Command: `node --test scripts/test_market_r21_contracts.mjs scripts/test_market_r21_wp05_funds.mjs`
   - Outcome: **32/32 tests passed (0 failed)**.
   - Tests: WP00-001 through WP00-022 (contract baselines) + WP05-S01 through WP05-S10 (fund algorithms, strict identity, 7-day lookback, CAGR, truncation, volatility, SIP, sanitization, path isolation).

2. **Vitest Certification Suite:**
   - Command: `npx.cmd vitest run --config vitest.config.js src/market/features/funds/Funds.cert.test.jsx`
   - Outcome: **12/12 tests passed (0 failed)**.
   - Tests: zero-boot summary card, workspace navigation, saved schemes count, SVG chart trajectory, multi-fund comparative base-100 series, SIP scenario calculator, comparison modal empty/ready states, search & discovery debouncing, researched fund metrics with strict scheme identity, CSV/JSON export.

3. **ESLint Static Analysis:**
   - Command: `npx.cmd eslint src/market/features/funds/ scripts/test_market_r21_wp05_funds.mjs`
   - Outcome: **0 errors, 0 warnings**.
   - Global `npm.cmd run lint`: **0 errors, 0 warnings**.

4. **Vite Production Build:**
   - Command: `npm.cmd run build`
   - Outcome: **Clean build succeeded in 8.26s**.

5. **Path Isolation Audit:**
   - Command: `git diff 2510cac78e4ec177efaaedfb8de2ac3504415813 --name-only`
   - Outcome: **0 changes to shared tracked files**. All changes strictly inside `src/market/features/funds/**`, `scripts/test_market_r21_wp05_funds.mjs`, and `reports/market-r21/WP05_AGENT_RETURN.md`.
