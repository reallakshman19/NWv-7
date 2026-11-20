# WP-10 Integration Specification: Equity Research and Watchlist (WP-03)

This document specifies the exact, bounded integration diffs for WP-10 to connect WP-03 deliverables into the shared Market Desk entrypoints.

---

## 1. Primary Exports (`src/market/features/equity/index.js`)

```javascript
import {
  EquityResearchPanel,
  WatchlistSummary,
  defaultWatchlistStore,
} from './market/features/equity/index.js';
```

---

## 2. Slot Integration in Overview (`src/market/features/overview/Overview.jsx`)

WP-10 passes `WatchlistSummary` into the `watchlist` slot of `Overview`:

```jsx
import { WatchlistSummary } from '../equity/index.js';

// Inside MarketPage / Overview orchestration:
<Overview
  slots={{
    providerBoard: <MarketProviderBoard onNavigate={handleNavigate} />,
    watchlist: <WatchlistSummary onNavigate={handleNavigate} />,
    // Sibling slots...
  }}
  onNavigate={handleNavigate}
/>
```

---

## 3. Full Workspace Integration (`src/pages/MarketPage.jsx`)

When the active workspace is `'equity'`, `MarketPage` renders `EquityResearchPanel`:

```jsx
import { EquityResearchPanel } from '../market/features/equity/index.js';

// Inside MarketPage workspace renderer:
{activeWorkspace === 'equity' && (
  <EquityResearchPanel
    onNavigate={handleNavigate}
    onOpenHolding={(canonicalKey) => {
      // Connects to WP-04 Portfolio
      setActiveWorkspace('portfolio');
      setSelectedPortfolioHolding(canonicalKey);
    }}
    onFindNews={(canonicalKey) => {
      // Connects to WP-07 Market News
      setActiveWorkspace('ipo-events');
      setNewsFilterSymbol(canonicalKey);
    }}
  />
)}
```

---

## 4. Shared Storage Harmonization
- WP-03 uses the versioned V2 schema: `nw7.market-watchlist.v2`.
- When WP-10 retires the legacy `EquityWorkspace` in `MarketWorkspaceTools.jsx`, all watchlist reads and writes cleanly consolidate to `nw7.market-watchlist.v2`.
- The legacy key `nw7.india-watchlist.v1` is never deleted or overwritten during automatic migration, preserving backward compatibility.
