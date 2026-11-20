# WP-05 -> WP-10 Integration Specification

**Module:** Mutual Funds Desk & Analytics (`src/market/features/funds/`)  
**Target:** WP-10 Harmonization & Wiring  
**Branch:** `feat/market-r21-wp05-funds-analytics`  
**Base Commit:** `2510cac78e4ec177efaaedfb8de2ac3504415813`  

---

## 1. Overview
WP-05 provides an isolated, production-ready mutual funds research, trajectory, and comparison workspace. It maintains zero changes to existing shared routing or page files in its own branch. When WP-10 integrates WP-05 into the main application, the following hooks and routes should be connected:

---

## 2. Shared File Connections (WP-10 Only)

### A. `src/pages/MarketPage.jsx`
Replace existing legacy `FundsWorkspace` tool with `FundsPanel`:
```jsx
import { FundsPanel, FundSummary } from '../market/features/funds/index.js';

// Inside workspace render switch:
case 'funds':
  return <FundsPanel initialCode={routeParams?.code} onNavigateWorkspace={handleNavigate} />;

// Inside Overview workspace (WP-01):
<FundSummary onOpenFunds={() => handleNavigate('funds')} />
```

### B. WP-08 Math Engine Binding
WP-05's `computeFundSip` can directly consume WP-08's `calcSip` contract export:
```javascript
import { calcSip } from '../math/index.js'; // provided by WP-08
import { computeFundSip } from '../funds/index.js';

const outcome = computeFundSip(monthly, years, annualRate, calcSip);
```

---

## 3. Storage Contracts & Backwards Compatibility
- **Legacy Saved Funds Key:** `nw7.market-saved-funds.v1`
  - Array of scheme code strings (e.g. `["119551", "125497"]`), capped at 12 items.
  - Backwards-compatible with previous releases.
- **R2.1 History Cache Key:** `nw7.market-fund-history.v1`
  - Schema version 1, max 12 schemes, max 4,000 observations per scheme.
  - Same-day IST caching avoids redundant network calls.

---

## 4. Verification Evidence
All WP-05 contracts, scheme identity rules, and mathematical formulas are verified via:
- `scripts/test_market_r21_wp05_funds.mjs` (Node-native unit & contract suite)
- `src/market/features/funds/Funds.cert.test.jsx` (Vitest React testing-library suite)
