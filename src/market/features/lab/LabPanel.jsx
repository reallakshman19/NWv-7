import React from 'react';
import { useLabStore, labStore } from './labStore.js';
import { SipLabPanel } from './SipLabPanel.jsx';
import { LumpsumLabPanel } from './LumpsumLabPanel.jsx';
import { SwpLabPanel } from './SwpLabPanel.jsx';
import { XirrLabPanel } from './XirrLabPanel.jsx';
import { PrepayVsInvestPanel } from './PrepayVsInvestPanel.jsx';
import './lab.css';

const TABS = [
  { id: 'sip', label: 'SIP & Goals', ariaLabel: 'Systematic Investment Plan and Target Goal Planner' },
  { id: 'lumpsum', label: 'Lumpsum & Inflation', ariaLabel: 'Compound interest and inflation-adjusted purchasing power' },
  { id: 'swp', label: 'SWP & Longevity', ariaLabel: 'Systematic Withdrawal Plan and retirement longevity simulator' },
  { id: 'xirr', label: 'XIRR Playground', ariaLabel: 'Irregular cash flow XIRR engine with ACT 365.25 basis' },
  { id: 'prepay', label: 'Prepay vs. Invest', ariaLabel: 'Equal cash budget loan prepayment vs investment comparator' }
];

export function LabPanel() {
  const store = useLabStore();
  const { activeTab } = store;

  return (
    <div className="lab-workspace" data-testid="investment-lab-workspace">
      <header className="lab-header">
        <div className="lab-header-text">
          <h2 className="lab-title">Investment Lab & Financial Mathematics</h2>
          <p className="lab-subtitle">
            Pure client-side mathematical simulation desk. 100% offline, zero data tracking, and verified actuarial formulas.
          </p>
        </div>
      </header>

      <nav className="lab-nav-tabs" role="tablist" aria-label="Investment lab calculator tools">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            title={t.ariaLabel}
            className={`lab-nav-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => labStore.setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="lab-tab-content" role="tabpanel" aria-label={activeTab}>
        {activeTab === 'sip' && <SipLabPanel />}
        {activeTab === 'lumpsum' && <LumpsumLabPanel />}
        {activeTab === 'swp' && <SwpLabPanel />}
        {activeTab === 'xirr' && <XirrLabPanel />}
        {activeTab === 'prepay' && <PrepayVsInvestPanel />}
      </main>

      <footer className="lab-footer-disclaimer" data-testid="universal-lab-disclaimer">
        <strong>Statutory Notice & Financial Disclaimer:</strong> All calculations, compounding projections, and portfolio simulations shown in the Investment Lab are mathematical models based on user-entered hypothetical inputs. They do not constitute investment advice, portfolio recommendations, or guarantees of future returns. Mutual fund and equity investments are subject to market risks. Past returns are not indicative of future performance.
      </footer>
    </div>
  );
}
