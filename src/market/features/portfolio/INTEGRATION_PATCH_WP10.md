# WP-04 -> WP-10 Integration Specification

**Module:** Portfolio & Transactions Desk (`src/market/features/portfolio/`)  
**Target:** WP-10 Harmonization & Wiring  
**Branch:** `feat/market-r21-wp04-portfolio-transactions`  
**Base Commit:** `2510cac78e4ec177efaaedfb8de2ac3504415813`  

---

## 1. Overview
WP-04 provides an isolated, production-ready portfolio management engine and user interface. It requires zero modifications to shared routing or existing workspace files in its own branch. When WP-10 integrates WP-04 into the main application, the following hooks and routes should be connected:

---

## 2. Shared File Connections (WP-10 Only)

### A. `src/services/marketWorkspaceRoute.js`
Incorporate `'portfolio'` into the active workspace routes:
```javascript
export const MARKET_WORKSPACE_IDS = ['overview', 'indices', 'equity', 'portfolio', 'funds', 'currency'];
```

### B. `src/pages/MarketPage.jsx`
Import and render `PortfolioPanel` when `activeWorkspace === 'portfolio'`:
```jsx
import { PortfolioPanel, PortfolioSummary } from '../market/features/portfolio/index.js';

// Inside workspace render switch:
case 'portfolio':
  return <PortfolioPanel initialKey={routeParams?.initialKey} onNavigateWorkspace={handleNavigate} />;

// Inside Overview workspace (WP-01):
<PortfolioSummary onOpenPortfolio={() => handleNavigate('portfolio')} />
```

### C. WP-08 Math Engine Binding
WP-04's `computePortfolioXirr` can directly consume WP-08's `calcXirr` contract export:
```javascript
import { calcXirr } from '../math/index.js'; // provided by WP-08
import { computePortfolioXirr } from '../portfolio/index.js';

const outcome = computePortfolioXirr(cashFlows, calcXirr);
```

---

## 3. Storage Contract Registry
- **Key:** `nw7.market-portfolio.v1`
- **Access Rule:** Local storage only. No telemetry export. No remote quote polling.
- **Max Portfolios:** 5
- **Backup Formats:** JSON (Full fidelity including marks), CSV (Transactions ledger only).

---

## 4. Verification Evidence
All WP-04 contracts and behaviors are verified via:
- `scripts/test_market_r21_wp04_portfolio.mjs` (Node-native unit & contract suite)
- `src/market/features/portfolio/Portfolio.cert.test.jsx` (Vitest React testing-library suite)
