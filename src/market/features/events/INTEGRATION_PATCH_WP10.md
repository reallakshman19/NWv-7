# NWv7 Market Desk R2.1 — WP-07 Events Desk Integration Instructions (WP-10)

This document provides exact, bounded integration instructions for the WP-10 coordinator to wire WP-07's IPO, NFO & Finance Events Desk into shared surfaces (`MarketPage.jsx`, `MarketWorkspaceTools.jsx`, and `marketWorkspaceRoute.js`).

---

## 1. Market Workspace Route Integration (`marketWorkspaceRoute.js`)

To route users to the IPO & Events Desk workspace:

```diff
--- a/src/services/marketWorkspaceRoute.js
+++ b/src/services/marketWorkspaceRoute.js
@@ -10,6 +10,7 @@ export const WORKSPACE_TABS = Object.freeze([
   'indices',
   'equity-watchlist',
   'portfolio',
   'funds-analytics',
   'currency-macro',
+  'ipo-events',
   'calculators',
   'screener'
 ]);
```

---

## 2. Market Workspace Tools Panel Integration (`MarketWorkspaceTools.jsx`)

Mount `IpoEventsPanel` when the active workspace is `ipo-events`:

```diff
--- a/src/components/market/MarketWorkspaceTools.jsx
+++ b/src/components/market/MarketWorkspaceTools.jsx
@@ -1,5 +1,6 @@
 import React from 'react';
 import { IpoEventsPanel } from '../../market/features/events/index.js';
 
 export function MarketWorkspaceTools({ activeWorkspace, onNavigateWorkspace }) {
+  if (activeWorkspace === 'ipo-events') {
+    return <IpoEventsPanel onNavigateWorkspace={onNavigateWorkspace} />;
+  }
   // ... other workspace panels
```

---

## 3. Market Overview Card Integration (`MarketPage.jsx`)

Embed `EventsQuickWidget` on the Market Overview tab for quick access to upcoming market calendar events, active NFO announcements, and official issue desks:

```diff
--- a/src/pages/MarketPage.jsx
+++ b/src/pages/MarketPage.jsx
@@ -1,5 +1,6 @@
 import React from 'react';
 import { EventsQuickWidget } from '../market/features/events/index.js';
 
 // Inside Overview tab layout:
+<EventsQuickWidget onOpenEventsDesk={(workspace) => handleWorkspaceChange(workspace)} />
```

---

## 4. Policy Reconciliations & Custody Invariants

- **False-Zero Prevention:** Official links (`LINK_ONLY`) never establish `state: 'NO_RESULTS'` or claim zero active issues.
- **Zero-Boot Silence:** Overview widget mounts without making background network requests.
- **News Ingestion:** Ingests qualified news passively from `sectionsDataset` envelope without initiating duplicate network loaders.
