# WP-10 Integration Proposal for WP-01 Overview

This document specifies the narrow, atomic integration patch for **WP-10 (Integration and E2E Repair)** to activate the Overview workspace and the 9-workspace router once all candidate features have landed.

## 1. Shared Files Invariant during WP-01
During WP-01, the following shared files were preserved strictly as **READ_ONLY**:
- `src/pages/MarketPage.jsx`
- `src/services/marketWorkspaceRoute.js`
- `src/context/MarketContext.jsx`
- `src/components/market/MarketWorkspaceTools.jsx`
- `src/market/contracts/*`
- `src/market/registry/*`

## 2. Exports Delivered by WP-01
Import path: `src/market/features/overview/index.js`

```javascript
import {
  Overview,               // Canonical 8-section Overview workspace
  MarketOverview,         // Convenient alias
  MarketNav,              // Desktop 9-tab + Mobile 3-tab/'More' navigation
  MOBILE_DIRECT_IDS,      // ['overview', 'equity', 'funds']
  MOBILE_MORE_IDS,        // ['indices', 'portfolio', 'ipo-events', 'currency-macro', 'lab', 'health']
  MarketSessionHeader,    // Asia/Kolkata indicative session header
  OverviewSlotErrorBoundary, // Local error boundary for slot isolation
  DEFAULT_OVERVIEW_SLOTS, // Reference slot mapping
} from '../market/features/overview/index.js';
```

## 3. Proposed Integration Changes for WP-10

### A. Activate 9-Workspace Routing in `src/services/marketWorkspaceRoute.js`

```diff
--- a/src/services/marketWorkspaceRoute.js
+++ b/src/services/marketWorkspaceRoute.js
@@ -1,13 +1,19 @@
-export const MARKET_WORKSPACE_IDS = Object.freeze(['indices', 'equity', 'funds', 'currency']);
+import {
+  R21_MARKET_WORKSPACE_IDS,
+  R21_DEFAULT_WORKSPACE,
+  normalizeR21MarketView,
+  getR21MarketViewFromHash,
+  withR21MarketViewHash,
+} from '../market/contracts/index.js';
+
+export const MARKET_WORKSPACE_IDS = R21_MARKET_WORKSPACE_IDS;

 export function getMarketWorkspaceFromHash(hash = '') {
-  const query = String(hash).split('?')[1]?.split('#')[0] || '';
-  const candidate = new URLSearchParams(query).get('view');
-  return MARKET_WORKSPACE_IDS.includes(candidate) ? candidate : 'indices';
+  return getR21MarketViewFromHash(hash);
 }

-export function withMarketWorkspaceHash(hash = '#/markets', view = 'indices') {
-  if (!MARKET_WORKSPACE_IDS.includes(view)) return hash;
-  const [route, rawQuery = ''] = String(hash).split('?');
-  const params = new URLSearchParams(rawQuery);
-  params.set('view', view);
-  return `${route || '#/markets'}?${params.toString()}`;
+export function withMarketWorkspaceHash(hash = '#/markets', view = R21_DEFAULT_WORKSPACE) {
+  return withR21MarketViewHash(hash, view);
 }
```

### B. Mount Overview in `src/pages/MarketPage.jsx`

```diff
--- a/src/pages/MarketPage.jsx
+++ b/src/pages/MarketPage.jsx
@@ -8,4 +8,5 @@
+import { Overview } from '../market/features/overview/index.js';

...

     <main className="market-workspace__body" id={`market-${view}-content`}>
+      {view === 'overview' && (
+        <Overview
+          onNavigate={changeView}
+          data={marketData || {}}
+          settings={marketSettings}
+          onRefresh={refresh}
+          refreshing={loading}
+          currentWorkspace={view}
+        />
+      )}
       {view === 'indices' && <IndexWorkspace data={marketData || {}} ... />}
```

### C. Connect Sibling Feature Slots
When WP-02 through WP-09 are merged, WP-10 passes their exports into `<Overview slots={{ ... }} />`:
```javascript
const slots = {
  providerBoard: <MarketProviderBoard />,     // WP-02
  watchlist: <WatchlistSummary />,            // WP-03
  fundSearch: <FundQuickSearch />,            // WP-05
  currency: <FXQuickConverter />,             // WP-06
  marketBriefing: <MarketBriefingPanel />,    // WP-07
  events: <MarketEventsPanel />,              // WP-07
  portfolio: <PortfolioSummary />,            // WP-04
  investmentLab: <SIPQuickCalculator />,      // WP-08
  sourceHealth: <SourceHealthPanel />,        // WP-09
};
```
