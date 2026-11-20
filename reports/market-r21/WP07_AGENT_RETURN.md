# NWv7 Market Desk R2.1 — WP-07 Events Desk Return Receipt

**Workpack ID:** WP-07 — IPO/NFO, Public Issue Events & Finance Briefing  
**Branch:** `feat/market-r21-wp07-ipo-events`  
**Foundation Base Commit:** `2510cac78e4ec177efaaedfb8de2ac3504415813`  
**Contract Baseline:** `market-r21-contract-v1`  
**Status:** COMPLETED & VERIFIED (Zero Escape, Isolated Worktree)  
**Date:** 2026-11-20  

---

## 1. Executive Summary

WP-07 delivers the complete **IPO, NFO, Public Issue Events & Finance Briefing Desk** for NWv-7 Market Desk R2.1. The implementation strictly incorporates all independent review mandates:
1. **$0 Budget & Free Open Data Policy:** Uses free, official public portals (`NSE`, `BSE`, `AMFI`, `SEBI`) and local editorial news reuse. Strictly zero paid feeds or unauthorized web crawling.
2. **False-Zero Prevention & Negative Assertion Rule (WP00-020):** Official links (`LINK_ONLY`) can never establish `state: 'NO_RESULTS'` or claim zero active issues. The UI clearly states that live bidding status, retail quotas, and allotments reside exclusively on official exchange books.
3. **NFO Source Qualification vs. Date Classification (P0-01):** Decoupled the pure NFO date classifier from source verification. The Overview widget renders honest navigation actions (`"View official AMFI NFO announcements"`), never claiming unverified counts like `"3 open NFOs"`. Expired NFOs are filtered from active views while preserving historical audit custody.
4. **Calendar Verification States & Multi-Day Range (P0-02):** Event records distinguish verification certainty (`CONFIRMED_SCHEDULE`, `TENTATIVE`, `UNVERIFIED`). RBI MPC is modeled as a confirmed 2–4 December 2026 date range with official RBI press release citation. Union Budget 2027–28 and Q3 corporate earnings are explicitly tagged as `TENTATIVE` windows.
5. **Corrected Official Navigation Destinations (P0-03):** Fixed the NSE corporate advertisement URL to `https://www.nseindia.com/companies-listing/corporate-public-issue-advertisements`. WP-00 registered sources are strictly verified against `sourceRegistry.js`, while additional external navigation links (SEBI DRHP, NSE Corporate Ads) are validated via HTTPS host allowlists.
6. **Real `sectionsDataset` Contract & Zero-Boot Ingestion (P0-04 & P0-05):** Ingests business news from the actual `data.sections.business` envelope with a deterministic finance filter. Zero-boot network silence is maintained: news is ingested passively without triggering network loaders on mount. Authentic ISO instant timestamps are strictly required for source receipts.
7. **`Asia/Kolkata` Calendar Math (P1-01 & P1-02):** All date calculations, midnight transitions, and countdowns (`Starts in X days`, `In progress`, `Ended X days ago`) operate in `Asia/Kolkata` time zone (UTC+05:30).
8. **Component-Level Failure Isolation (MKT-032):** Failures or empty states in news reuse never hide or disrupt the IPO issue desks or market calendar.
9. **Strict Path Isolation:** Zero modifications to existing shared application files (`MarketPage.jsx`, `MarketWorkspaceTools.jsx`, `marketWorkspaceRoute.js`, etc.).

---

## 2. Deliverables & File Manifest

| File Path | Description | Lines |
| :--- | :--- | :--- |
| `src/market/features/events/ipoData.js` | Official registered issue portals, verified external links, structured market calendar with verification states, and `Asia/Kolkata` date/countdown utilities. | 185 |
| `src/market/features/events/nfoEngine.js` | Pure NFO lifecycle classifier (`Open`, `Upcoming`, `Announced`, `Expired`), Indian date parsing (`parseIndiaDate`), and custody preservation. | 180 |
| `src/market/features/events/newsReuseClient.js` | Editorial news reader adapting `sectionsDataset.business`, deterministic finance topic filter, authentic source receipt builder. | 135 |
| `src/market/features/events/eventsStore.js` | Reactive store (`useSyncExternalStore`), zero-boot silence enforcement, active tab and filter state management. | 105 |
| `src/market/features/events/EventTimeline.jsx` | Accessible chronological event timeline component displaying verification badges, date ranges, and countdowns. | 125 |
| `src/market/features/events/EventsQuickWidget.jsx` | Overview tab widget (WP-01) with honest navigation prompts ("View official NFO announcements"), next event countdown, zero-boot mounting. | 115 |
| `src/market/features/events/IpoEventsPanel.jsx` | Complete workspace panel: 4 dedicated views (Official IPOs, Mutual Fund NFOs, Market Calendar, Finance News Briefing). | 340 |
| `src/market/features/events/events.css` | WCAG-compliant styling for light and dark themes, timeline badges, responsive cards (320px–1280px). | 390 |
| `src/market/features/events/index.js` | Canonical barrel module export. | 45 |
| `src/market/features/events/INTEGRATION_PATCH_WP10.md` | Bounded integration patch instructions and diffs for WP-10 coordinator. | 65 |
| `scripts/test_market_r21_wp07_events.mjs` | Node-native test suite covering all 28 requirements (WP07-T01 through WP07-T28). | 370 |
| `src/market/features/events/Events.cert.test.jsx` | Vitest React certification suite (12 tests). | 195 |

---

## 3. Verification & Quality Gates

### A. Node-Native Contract & Feature Tests
```
node --test scripts/test_market_r21_contracts.mjs scripts/test_market_r21_wp07_events.mjs
```
- **Total Tests:** 50
- **Passed:** 50 (22 baseline contract tests + 28 WP-07 feature tests)
- **Failed:** 0
- **Duration:** 224ms

#### Test Matrix Coverage:
- `WP07-T01`: Zero-Boot Network Silence (no fetch on store init)
- `WP07-T02`: Registered Official Sources Match WP-00 Rights (`LINK_ONLY`) and Actions (`LINK`)
- `WP07-T03`: Additional Official Navigation Links Use Verified HTTPS Destinations
- `WP07-T04`: False-Zero Prohibition: `LINK_ONLY` Sources Cannot Establish `NO_RESULTS` (WP00-020)
- `WP07-T05`: Invalid or Unqualified NFO Rows Never Become `OPEN`
- `WP07-T06`: NFO Boundary Dates are Inclusive and Calculated in `Asia/Kolkata`
- `WP07-T07`: Announced NFO Without Close Date Remains `ANNOUNCED_UNVERIFIED`
- `WP07-T08`: Expired NFOs Leave Current Views but Preserve Historical Evidence
- `WP07-T09`: Stale NFO Replay Cannot Revive a Closed Offer Back to `OPEN`
- `WP07-T10`: Distant Upcoming NFOs (>90d) Excluded from Presentation Window
- `WP07-T11`: Calendar Records Retain Authoritative Evidence URLs and Verification States
- `WP07-T12`: RBI MPC Renders 2–4 Dec 2026 Date Range with Confirmed Schedule
- `WP07-T13`: Tentative Budget and Earnings Dates Cannot Appear as Confirmed
- `WP07-T14`: Trading Holidays Identify Applicable Exchange Segments (`EQUITIES`, `DERIVATIVES`, `CURRENCY`)
- `WP07-T15`: Countdown Works at Midnight IST and Across Date Boundaries
- `WP07-T16`: Missing or Changed Event Dates Produce Truthful Uncertainty
- `WP07-T17`: News Adapter Ingests Real `sectionsDataset` Envelope Structure
- `WP07-T18`: News Adapter Does Not Independently Invoke Network Loader on Mount
- `WP07-T19`: Relative Ages and Missing Timestamps Cannot Produce Fabricated `READY` Receipts
- `WP07-T20`: Publisher, Article URL, Publication Time and Freshness Remain Distinct Fields
- `WP07-T21`: Untrusted Article URLs and HTML are Rejected or Rendered Safely as Text
- `WP07-T22`: News Failure Cannot Remove IPO or Calendar Content (MKT-032)
- `WP07-T23`: `EventsQuickWidget` Data Model Renders Honest Actions Without Fake Counts
- `WP07-T24`: Overview and Full Events Desk Share Coherent Store State
- `WP07-T25`: Calendar Calculations Handle Leap Years and Month Ends Accurately
- `WP07-T26`: Node Native Unit Tests Distinct from React/Browser Tests
- `WP07-T27`: All Shared Contracts and Registry Entries Remain Untouched
- `WP07-T28`: NFO Parser Supports Both ISO (`YYYY-MM-DD`) and Indian DMY (`DD-MM-YYYY`) Dates

### B. Vitest Component Certification
```
npx.cmd vitest run src/market/features/events/Events.cert.test.jsx
```
- **Total Tests:** 12
- **Passed:** 12
- **Failed:** 0
- **Duration:** 2.04s

### C. ESLint Static Code Analysis
```
npx.cmd eslint src/market/features/events/ scripts/test_market_r21_wp07_events.mjs
```
- **Exit Code:** 0 (Zero errors, zero warnings)

### D. Full Project Lint & Build
```
npm.cmd run lint
npm.cmd run build
```
- **Lint:** Clean exit (code 0)
- **Vite Build:** 420 modules compiled cleanly in 5.03s (code 0)

### E. Path Isolation Audit
```
git diff 2510cac78e4ec177efaaedfb8de2ac3504415813 --name-only
```
- **Tracked Shared Files Modified:** 0 (Clean isolation)

---

## 4. Policy Reconciliations & Coordination with WP-10

1. **Workspace Routing:** In `INTEGRATION_PATCH_WP10.md`, WP-10 coordinator instructions detail adding `'ipo-events'` to `WORKSPACE_TABS` in `src/services/marketWorkspaceRoute.js`.
2. **Tools Panel Mounting:** Instructions show mounting `IpoEventsPanel` inside `src/components/market/MarketWorkspaceTools.jsx` when `activeWorkspace === 'ipo-events'`.
3. **Overview Widget Embedding:** Instructions detail embedding `EventsQuickWidget` on `MarketPage.jsx`.
4. **No Destructive Changes:** Zero mutation to user local storage keys or existing news workflows.
