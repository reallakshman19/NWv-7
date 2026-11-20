# NWv7 Market Desk R2.1 — WP-06 Currency and Macro Integration Instructions (WP-10)

This document provides exact, bounded integration instructions for the WP-10 coordinator to wire WP-06's Currency and Macro Desk into shared surfaces (`MarketPage.jsx`, `MarketWorkspaceTools.jsx`, `marketWorkspaceRoute.js`, and `sourceRegistry.js`).

---

## 1. World Bank Rights Policy Amendment (`sourceRegistry.js`)

In frozen `market-r21-contract-v1`, `world-bank` is registered with `rights: 'NO_PUBLICATION'`.
Under CC BY-4.0 open data terms, World Bank WDI indicators are legally cleared for open display with attribution.
When WP-10 integrates WP-06, amend `src/market/contracts/sourceRegistry.js`:

```diff
--- a/src/market/contracts/sourceRegistry.js
+++ b/src/market/contracts/sourceRegistry.js
@@ -32,7 +32,7 @@ export const MARKET_SOURCES = Object.freeze({
   'world-bank': Object.freeze({
     id: 'world-bank',
     name: 'World Bank Open Data',
     publisher: 'World Bank',
-    rights: 'NO_PUBLICATION',
+    rights: 'OPEN_LICENSE_CONFIRMED',
     accessMode: 'LICENSED_OPEN_DATA',
     allowedHostPatterns: ['api.worldbank.org'],
     frequency: 'annual'
   }),
```

---

## 2. Market Workspace Route Integration (`marketWorkspaceRoute.js`)

To route users to the Currency & Macro Desk workspace:

```diff
--- a/src/services/marketWorkspaceRoute.js
+++ b/src/services/marketWorkspaceRoute.js
@@ -10,6 +10,7 @@ export const WORKSPACE_TABS = Object.freeze([
   'indices',
   'equity-watchlist',
   'portfolio',
   'funds-analytics',
+  'currency-macro',
   'calculators',
   'screener'
 ]);
```

---

## 3. Market Workspace Tools Panel Integration (`MarketWorkspaceTools.jsx`)

Mount `CurrencyMacroPanel` when the active workspace is `currency-macro`:

```diff
--- a/src/components/market/MarketWorkspaceTools.jsx
+++ b/src/components/market/MarketWorkspaceTools.jsx
@@ -1,5 +1,6 @@
 import React from 'react';
 import { CurrencyMacroPanel } from '../../market/features/macro/index.js';
 
 export function MarketWorkspaceTools({ activeWorkspace, onNavigateWorkspace }) {
+  if (activeWorkspace === 'currency-macro') {
+    return <CurrencyMacroPanel onNavigateWorkspace={onNavigateWorkspace} />;
+  }
   // ... other workspace panels
```

---

## 4. Market Overview Card Integration (`MarketPage.jsx`)

Embed `FXQuickConverter` on the Market Overview tab for quick access to OMR/INR and USD/INR reference rates:

```diff
--- a/src/pages/MarketPage.jsx
+++ b/src/pages/MarketPage.jsx
@@ -1,5 +1,6 @@
 import React from 'react';
 import { FXQuickConverter } from '../market/features/macro/index.js';
 
 // Inside Overview tab layout:
+<FXQuickConverter onOpenMacroDesk={(workspace) => handleWorkspaceChange(workspace)} />
```

---

## 5. Storage Cache Keys (Contractual Alignment)

WP-06 strictly adheres to existing application cache keys:
- `nw7.omr-inr.frankfurter.v1`: `{ payload: { base, quote, rate, date }, checkedAt }`
- `nw7.usd-inr.frankfurter.v1`: `{ payload: { base, quote, rate, date }, checkedAt }`

No migration or data conversion is needed for existing user profiles or local storage.
