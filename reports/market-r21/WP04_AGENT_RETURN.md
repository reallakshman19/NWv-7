# WP-04 Deliverable Return & Evidence Receipt

**Workpack:** WP-04 (Portfolio & Transactions Desk)  
**Branch:** `feat/market-r21-wp04-portfolio-transactions`  
**Base Commit:** `2510cac78e4ec177efaaedfb8de2ac3504415813`  
**Delivered Commit:** `0eb7170f8fa04c6f08d3a9bcd318a8ce02fd5770`  
**Timestamp:** 2026-11-20T12:35:00+04:00  

---

## 1. Executive Summary
WP-04 has delivered a self-contained, long-only equity portfolio accounting desk conforming strictly to the approved engineering specification and review requirements:
1. **Financial Accuracy & Tax Boundary:**
   - Analytical P&L based on moving weighted-average cost basis, labeled clearly across the UI and documentation as *analytical portfolio tracking*, noting that the Indian Income Tax Act Sec 45(2A) requires FIFO for tax-grade capital gains reporting.
   - Golden Case verified: BUY 10 @ 100 with 20 fee, SELL 5 @ 120 with 10 fee => ₹80 realized P&L, ₹510 remaining basis, 5 remaining units @ ₹102 average cost.
2. **Fail-Closed Accounting Replay:**
   - On oversell (`quantity > currentQty`), the affected instrument is flagged as `INVALID_LEDGER` with exact deficit recorded.
   - Sells are never skipped or erased to force false validity; portfolio valuation and dependent totals display as unavailable.
3. **Manual Price Marks (No Live Quote Scraping / Zero Paid Feeds):**
   - Valuation relies exclusively on user-recorded manual price marks (`ManualPriceMark`). Missing marks display "Unavailable", never false ₹0.00.
4. **WP-08 XIRR Integration Contract:**
   - Cash flows generated via `portfolioCashFlows.js` with terminal valuation date verification ($terminalDate \ge latestTxDate$) and support for fully liquidated portfolios.
   - Standardized to 365.25 day annualization convention ($1.1^{365.25/365} - 1 \approx 10.00718\%$).
5. **Storage & Privacy:**
   - Storage key: `nw7.market-portfolio.v1`.
   - Formula injection protection on CSV import/export (`^[=+@\t\r|-]`).
   - JSON full fidelity backup vs CSV ledger export.
   - Zero telemetry leaks, zero unauthorized network calls.
6. **Zero Changes to Shared Files:**
   - Shared market files (`src/pages/MarketPage.jsx`, `src/services/marketWorkspaceRoute.js`, etc.) remain 100% untouched.

---

## 2. Deliverables Inventory
| File | Size / Purpose |
|---|---|
| `src/market/features/portfolio/portfolioAccounting.js` | Moving weighted-average cost basis, deterministic sorting, oversell detection |
| `src/market/features/portfolio/portfolioCashFlows.js` | Cash flow builder for XIRR, terminal mark date consistency |
| `src/market/features/portfolio/portfolioXirrAdapter.js` | WP-08 calcXirr consumer & reference solver with 365.25 day annualization |
| `src/market/features/portfolio/portfolioStore.js` | `nw7.market-portfolio.v1` pub/sub store, JSON & CSV import/export with formula escaping |
| `src/market/features/portfolio/TransactionModal.jsx` | Add/Edit trade modal with same-day sequence order & live flow preview |
| `src/market/features/portfolio/PriceMarkModal.jsx` | Manual price mark entry dialog with zero-budget disclaimer |
| `src/market/features/portfolio/PortfolioImportModal.jsx` | Transactional import dialog with row preview |
| `src/market/features/portfolio/PortfolioSummary.jsx` | Compact card for Overview integration |
| `src/market/features/portfolio/PortfolioPanel.jsx` | Full workspace with metrics grid, holdings table, ledger, filter toolbar |
| `src/market/features/portfolio/portfolio.css` | Accessible, responsive dark/light styling |
| `src/market/features/portfolio/index.js` | Canonical barrel exports |
| `src/market/features/portfolio/INTEGRATION_PATCH_WP10.md` | Bounded integration patch instructions for WP-10 |
| `src/market/features/portfolio/Portfolio.cert.test.jsx` | 10 Vitest React testing-library certification tests |
| `scripts/test_market_r21_wp04_portfolio.mjs` | 10 Node-native unit & contract verification tests |

---

## 3. Test & Verification Gates
1. **Node Native Tests:**
   - Command: `node --test scripts/test_market_r21_contracts.mjs scripts/test_market_r21_wp04_portfolio.mjs`
   - Outcome: **32/32 tests passed (0 failed)**.
2. **Vitest Certification Suite:**
   - Command: `npx vitest run --config vitest.config.js src/market/features/portfolio/Portfolio.cert.test.jsx`
   - Outcome: **10/10 tests passed (0 failed)**.
3. **ESLint Static Analysis:**
   - Command: `npx eslint src/market/features/portfolio/ scripts/test_market_r21_wp04_portfolio.mjs`
   - Outcome: **0 errors, 0 warnings**.
   - Global `npm run lint`: **0 errors, 0 warnings**.
4. **Vite Production Build:**
   - Command: `npm run build`
   - Outcome: **Clean build succeeded in 8.61s**.
5. **Path Isolation Audit:**
   - Command: `git diff 2510cac78e4ec177efaaedfb8de2ac3504415813`
   - Outcome: **0 changes to shared tracked files**.
