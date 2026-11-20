# WP-10 Integration Patch for WP-09 (Health & Privacy Desk)

This document provides non-destructive assembly diffs for the WP-10 coordinator to mount the WP-09 Data Health, Rights, Cache & Privacy Desk into `MarketPage.jsx`.

## 1. Import Statement in `src/pages/MarketPage.jsx`

```javascript
import { HealthPanel } from '../market/features/health/index.js';
```

## 2. Workspace View Mount in `MarketPage.jsx`

In the workspace rendering switch/conditional:

```jsx
{activeWorkspace === 'health' && (
  <HealthPanel />
)}
```

## 3. Multi-Dimensional Quality Grading Replacement

To replace the legacy `auditMarketTabQuality()` with the honest multi-dimensional adapter:

```javascript
import { evaluateMarketQuality } from '../market/features/health/index.js';

// Legacy call:
// const audit = auditMarketTabQuality({ ... });

// R2.1 Multi-Dimensional Quality call:
const r21Audit = evaluateMarketQuality({
  sourceStates: healthStore.getSnapshot().sourceStates,
  receipts: healthStore.getSnapshot().receipts,
  dataCoverage: {
    indicesCount: marketData.indices?.length || 0,
    moversCount: (marketData.movers?.gainers?.length || 0) + (marketData.movers?.losers?.length || 0),
    fundsCount: savedFunds.length || 0,
    currenciesCount: Object.keys(fxRates || {}).length
  }
});
```
