# WP-10 Integration Proposal for WP-02 Provider Displays and Indices

This document specifies the narrow, atomic integration patch for **WP-10 (Integration and E2E Repair)** to wire `MarketProviderBoard` and `IndexSectorPanel` into the Overview dashboard and Indices workspace.

## 1. Shared Files Invariant during WP-02
During WP-02, the following shared files were preserved strictly as **READ_ONLY**:
- `src/pages/MarketPage.jsx`
- `src/components/market/BseMarketWidget.jsx`
- `src/services/marketWorkspaceRoute.js`
- `src/context/MarketContext.jsx`
- `src/components/market/MarketWorkspaceTools.jsx`
- `src/market/contracts/*`

## 2. Exports Delivered by WP-02
Import path: `src/market/features/providers/index.js`

```javascript
import {
  MarketProviderBoard,    // Opt-in BSE EOD TradingView embed board
  IndexSectorPanel,       // Benchmark indices, sector references, movers
  BSE_GROUPS,             // ['indices', 'equities']
  BSE_CATALOG,            // Curated catalog with widgetVerified flags
  BSE_SUPPORTED_INDICES,  // Verified index symbols
  BSE_SUPPORTED_EQUITIES, // Verified equity symbols
  isSupportedBseSymbol,   // Catalog validation
  getBseTradingViewUrl,   // Approved catalog lookup
} from '../market/features/providers/index.js';
```

## 3. Proposed Integration Changes for WP-10

### A. Pass `MarketProviderBoard` into Overview Slots (`Overview.jsx`)
In `src/pages/MarketPage.jsx` or the integrated Overview container:
```jsx
import { MarketProviderBoard } from '../market/features/providers/index.js';

// In Overview render:
<Overview
  slots={{
    providerBoard: <MarketProviderBoard group="indices" />,
    // Sibling slots...
  }}
  onNavigate={changeView}
/>
```

### B. Upgrade `IndexWorkspace` in `src/pages/MarketPage.jsx`
Replace legacy inline TradingView widget calls with the unified `IndexSectorPanel` and `MarketProviderBoard`:
```diff
--- a/src/pages/MarketPage.jsx
+++ b/src/pages/MarketPage.jsx
@@ -8,2 +8,3 @@
+import { MarketProviderBoard, IndexSectorPanel } from '../market/features/providers/index.js';
-import BseMarketWidget from '../components/market/BseMarketWidget.jsx';

...

 function IndexWorkspace({ data, settings, loading, onRefresh }) {
+  const [providerGroup, setProviderGroup] = useState('indices');
   ...
   return (
     <section className="market-workspace__panel" id="market-indices">
+      <IndexSectorPanel
+        activeGroup={providerGroup}
+        onSelectProviderGroup={setProviderGroup}
+      />
+      <MarketProviderBoard
+        group={providerGroup}
+        onGroupChange={setProviderGroup}
+      />
     </section>
   );
 }
```
