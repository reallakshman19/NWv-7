# NWv7 Market Desk R2.1 — WP-06 Currency and Macro Return Receipt

**Workpack:** WP-06 — Currency and Macro Desk  
**Branch:** `feat/market-r21-wp06-currency-macro`  
**Foundation Base Commit:** `2510cac78e4ec177efaaedfb8de2ac3504415813`  
**Contract Baseline:** `market-r21-contract-v1`  
**Status:** COMPLETED & VERIFIED (Zero Escape, Isolated Worktree)  
**Date:** 2026-11-20  

---

## 1. Executive Summary

WP-06 implements the complete **Currency and Macro Desk** for NWv-7 Market Desk R2.1. The implementation strictly adheres to:
1. **$0 Budget & Free Open Data Policy:** Only free, publicly documented APIs with confirmed license terms are utilized (`Frankfurter v2` for ECB/CBO indicative reference benchmark rates and `World Bank WDI` for annual macroeconomic indicators under CC BY-4.0). Strictly zero paid feeds or unauthorized real-time redistribution.
2. **Reversible Currency Conversion (MKT-021):** Bidirectional currency conversion between OMR/INR and USD/INR using the exact same qualified reference rate ($1/rate$) with zero duplicate network calls.
3. **Two-Tier Freshness Enforcement (MKT-022):** Strict two-tier freshness windows: $\le 36\text{h}$ is `READY` (Fresh), $36\text{h} - 72\text{h}$ is `READY, dated warning` (Dated Reference), and $> 72\text{h}$ is `HISTORICAL` (Expired for current conversion). Misleading "Real-time" and "Live Reference" language has been completely eradicated.
4. **Authentic Historical Rate Series:** Frankfurter v2 flat array format (`[{ date, rate }]`) with natural trading weekend gaps preserved (zero weekend data fabrication).
5. **Annual Macroeconomic Indicators (MKT-023):** World Bank annual indicators (GDP Growth `NY.GDP.MKTP.KD.ZG` and Consumer Price Inflation `FP.CPI.TOTL.ZG`) for India (`IND`) and Oman (`OMN`). Zero and negative values (GDP contractions, deflation) are fully supported.
6. **Independent Observation-Year Decoupling:** Countries and indicators maintain their authentic published observation years independently without false year conflation.
7. **Component-Level Failure Isolation (MKT-032):** World Bank HTTP 403 or network timeouts never obscure the FX Converter; Frankfurter rate errors never crash or hide macroeconomic statistics.
8. **Zero-Boot Network Silence:** Neither the Overview quick converter nor the workspace panel triggers automatic background network calls on initial page boot.
9. **Legacy Cache Schema Preservation:** Exactly preserves `{ payload, checkedAt }` for `nw7.omr-inr.frankfurter.v1` and `nw7.usd-inr.frankfurter.v1`.
10. **Strict Path Isolation:** Zero modifications to existing shared application files (`MarketPage.jsx`, `MarketWorkspaceTools.jsx`, `marketWorkspaceRoute.js`, etc.). All code is strictly self-contained within `src/market/features/macro/**`. Complete coordinator instructions are provided in `INTEGRATION_PATCH_WP10.md`.

---

## 2. Deliverables & File Manifest

| File Path | Description | Lines |
| :--- | :--- | :--- |
| `src/market/features/macro/fxMath.js` | Pure mathematical engine, unrounded swap ($1/rate$), input sanitization, and regional currency formatters (`en-OM`, `en-IN`, `en-US`). | 165 |
| `src/market/features/macro/fxClient.js` | Frankfurter v2 transport client, 36h/72h two-tier freshness, source receipts, flat historical series parser with natural trading gaps. | 204 |
| `src/market/features/macro/macroClient.js` | World Bank WDI transport client, CC BY-4.0 license metadata, observation year granularity, negative/zero value support. | 169 |
| `src/market/features/macro/macroStore.js` | Unified reactive store (`useSyncExternalStore`), in-flight request coalescing, race-condition protection, and exact legacy cache compatibility. | 315 |
| `src/market/features/macro/MacroChart.jsx` | Accessible SVG chart (macro bars with zero baseline, FX daily line) with dynamic X-axis labels and screen-reader data table. | 292 |
| `src/market/features/macro/FXQuickConverter.jsx` | Compact Overview tab widget card supporting pair switching, instant swap, dated warning badges, and zero-boot mounting. | 183 |
| `src/market/features/macro/CurrencyMacroPanel.jsx` | Comprehensive workspace panel containing Currency Desk, 7D/30D/90D historical trajectory, Macro Desk, CC BY-4.0 disclaimers, and official links. | 488 |
| `src/market/features/macro/macro.css` | Responsive, accessible dark/light theme CSS styling with WCAG contrast compliance. | 385 |
| `src/market/features/macro/index.js` | Canonical barrel module export. | 36 |
| `src/market/features/macro/INTEGRATION_PATCH_WP10.md` | Bounded integration patch instructions and diffs for WP-10 coordinator. | 78 |
| `scripts/test_market_r21_wp06_macro.mjs` | Node-native test suite covering WP06-T01 through WP06-T22. | 385 |
| `src/market/features/macro/Macro.cert.test.jsx` | Vitest React certification test suite (11 tests). | 245 |

---

## 3. Verification & Quality Gates

### A. Node-Native Contract & Feature Tests
```
node --test scripts/test_market_r21_contracts.mjs scripts/test_market_r21_wp06_macro.mjs
```
- **Total Tests:** 44
- **Passed:** 44 (22 baseline contract tests + 22 WP-06 feature tests)
- **Failed:** 0
- **Duration:** 221ms

#### Test Matrix Coverage:
- `WP06-T01`: Zero-Boot Network Silence (no fetch on store init)
- `WP06-T02`: MKT-021 Golden Reference Conversion (100 OMR @ 200 = 20,000 INR; 100 USD @ 90 = 9,000 INR)
- `WP06-T03`: Single-Rate Swap Invariance (swap uses exact same rate $1/rate$, zero duplicate network calls)
- `WP06-T04`: Arbitrary Precision Maintenance & Input Sanitization
- `WP06-T05`: Two-Tier Freshness Clock (fresh $\le 36\text{h}$, dated warning $36\text{h}-72\text{h}$, expired $> 72\text{h}$)
- `WP06-T06`: Clock Drift and Future Date Rejection
- `WP06-T07`: Complete Source Receipt Construction (`validateSourceReceipt`)
- `WP06-T08`: Host Allowlist Verification
- `WP06-T09`: Frankfurter v2 Flat Array Parsing & Validation
- `WP06-T10`: Historical Series Weekend Trading Gap Retention
- `WP06-T11`: Conflicting Historical Rate Rejection
- `WP06-T12`: MKT-023 World Bank Annual Granularity & CC BY-4.0 Metadata
- `WP06-T13`: World Bank Indicator Identity & Country Validation
- `WP06-T14`: Negative and Zero Macro Metric Handling
- `WP06-T15`: Independent Observation-Year Decoupling
- `WP06-T16`: World Bank Rights Policy Compliance
- `WP06-T17`: MKT-032 Macro Failure Isolation (HTTP 403 / timeout)
- `WP06-T18`: MKT-032 FX Failure Isolation (HTTP 500)
- `WP06-T19`: In-Flight Request Coalescing
- `WP06-T20`: Async Race Condition Protection (Request sequence ID)
- `WP06-T21`: Exact Storage Schema Preservation (`payload` and `checkedAt`)
- `WP06-T22`: Calendar Subtraction Utility

### B. Vitest Component Certification
```
npx.cmd vitest run src/market/features/macro/Macro.cert.test.jsx
```
- **Total Tests:** 11
- **Passed:** 11
- **Failed:** 0
- **Duration:** 2.16s

### C. ESLint Static Analysis
```
npx.cmd eslint src/market/features/macro/ scripts/test_market_r21_wp06_macro.mjs
```
- **Exit Code:** 0 (Zero errors, zero warnings)

### D. Full Project Lint & Build
```
npm.cmd run lint
npm.cmd run build
```
- **Lint:** Clean exit (code 0)
- **Vite Build:** 420 modules transformed, production bundles generated in 8.72s (code 0)

### E. Path Isolation Audit
```
git diff 2510cac78e4ec177efaaedfb8de2ac3504415813 --name-only
```
- **Tracked Shared Files Modified:** 0 (Clean isolation)

---

## 4. Policy Reconciliations & Coordination with WP-10

1. **World Bank Rights Amendment:** In the frozen `sourceRegistry.js`, `world-bank` is marked `NO_PUBLICATION`. `macroClient.js` gracefully marks receipts as `NO_RIGHTS` (`LICENSE_AMENDMENT_PENDING_WP10`) under the frozen contract, and provides the exact 2-line patch in `INTEGRATION_PATCH_WP10.md` for the WP-10 coordinator to switch to `OPEN_LICENSE_CONFIRMED`.
2. **Overview & Tools Mount:** WP-10 will wire `FXQuickConverter` into `MarketPage.jsx` and `CurrencyMacroPanel` into `MarketWorkspaceTools.jsx`.
3. **No Breaking Changes:** Zero disruption to existing user configurations or legacy localStorage.
