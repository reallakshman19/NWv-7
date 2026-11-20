# WP-10 Integration Instructions for WP-08 (Financial Math & Investment Lab)

**Workpack:** WP-08 (Financial Math, SIP/XIRR & Investment Lab)  
**Target Consumer:** WP-10 (Integration & Route Activation)  
**Status:** Ready for assembly  

---

## 1. Overview of Delivered Assets

WP-08 provides:
1. **Pure Financial Math Engine:** `src/market/math/index.js`
   - Canonical `calcXirr`, `findXirrRoots`, `calcSip`, `calcStepUpSip`, `calcGoalSip`, `calcSwp`, `calcLumpsum`, `calcEmi`, `comparePrepayVsInvest`, `calcCagr`, `calcRuleOf72`.
   - Consumed by WP-04 (`portfolioXirrAdapter.js`), WP-05 (`fundSipAdapter.js`), and the Investment Lab.
2. **Investment Lab Feature Workspace:** `src/market/features/lab/`
   - Canonical `LabPanel`, sub-desks (`SipLabPanel`, `LumpsumLabPanel`, `SwpLabPanel`, `XirrLabPanel`, `PrepayVsInvestPanel`), and `labStore`.

---

## 2. MarketPage.jsx Integration Diff

When WP-10 activates the 9-workspace registry (`R21_MARKET_WORKSPACES`), import `LabPanel` and mount it under `activeWorkspace === 'lab'`:

```diff
--- a/src/pages/MarketPage.jsx
+++ b/src/pages/MarketPage.jsx
@@ -8,6 +8,7 @@
 import { EquityWorkspace, FundsWorkspace, CurrencyWorkspace } from '../components/market/MarketWorkspaceTools.jsx';
 import BseMarketWidget from '../components/market/BseMarketWidget.jsx';
+import { LabPanel } from '../market/features/lab/index.js';
 import { OPEN_SOURCE_REFERENCE_LINKS } from '../services/marketFreeOpenPolicy.js';

@@ -145,6 +146,8 @@
         {activeWorkspace === 'portfolio' && <PortfolioWorkspace />}
         {activeWorkspace === 'funds' && <FundsWorkspace />}
         {activeWorkspace === 'ipo-events' && <IpoEventsWorkspace />}
         {activeWorkspace === 'currency-macro' && <CurrencyWorkspace />}
+        {activeWorkspace === 'lab' && <LabPanel />}
         {activeWorkspace === 'health' && <HealthWorkspace />}
```

---

## 3. Sibling Workpack Integration Connections

1. **WP-04 Portfolio Transactions:**
   - In `src/market/features/portfolio/portfolioXirrAdapter.js`, replace any temporary mock solver with:
     ```javascript
     import { calcXirr } from '../../math/index.js';
     export function calculatePortfolioXirr(cashFlows, options) {
       return calcXirr(cashFlows, options);
     }
     ```
2. **WP-05 Mutual Funds:**
   - In `src/market/features/funds/fundSipAdapter.js`, connect:
     ```javascript
     import { calcSip } from '../../math/index.js';
     export function calculateFundSip(monthly, years, annualPercent) {
       return calcSip({ monthlyContribution: monthly, termYears: years, nominalAnnualPercent: annualPercent });
     }
     ```
