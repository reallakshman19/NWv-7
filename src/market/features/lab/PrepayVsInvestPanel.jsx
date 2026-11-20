import React, { useMemo } from 'react';
import { useLabStore, labStore } from './labStore.js';
import { comparePrepayVsInvest, PREPAY_COMPARATOR_DISCLAIMER } from '../../math/index.js';

export function PrepayVsInvestPanel() {
  const store = useLabStore();
  const { prepay } = store;

  const result = useMemo(() => {
    return comparePrepayVsInvest({
      loanPrincipal: prepay.loanPrincipal,
      loanAnnualPercent: prepay.loanAnnualPercent,
      loanTermYears: prepay.loanTermYears,
      monthlySurplus: prepay.monthlySurplus,
      investmentAnnualPercent: prepay.investmentAnnualPercent
    });
  }, [prepay]);

  const diff = result.ok ? result.netWealthDifference : 0;
  const isA = result.ok && result.favorableStrategy === 'OPTION_A_PREPAY';

  return (
    <div className="lab-subdesk" data-testid="prepay-lab-panel">
      <div className="lab-content-grid">
        <div className="lab-form-column">
          <div className="lab-field-group">
            <div className="lab-field-header">
              <label htmlFor="prepay-principal-input">Loan Principal Amount</label>
              <span className="lab-field-val">₹{prepay.loanPrincipal.toLocaleString('en-IN')}</span>
            </div>
            <input
              id="prepay-principal-input"
              type="range"
              min="500000"
              max="15000000"
              step="100000"
              value={prepay.loanPrincipal}
              onChange={(e) => labStore.updatePrepay({ loanPrincipal: Number(e.target.value) })}
            />
          </div>

          <div className="lab-field-group">
            <div className="lab-field-header">
              <label htmlFor="prepay-loanrate-input">Loan Interest Rate</label>
              <span className="lab-field-val">{prepay.loanAnnualPercent}% p.a.</span>
            </div>
            <input
              id="prepay-loanrate-input"
              type="range"
              min="5.0"
              max="18.0"
              step="0.25"
              value={prepay.loanAnnualPercent}
              onChange={(e) => labStore.updatePrepay({ loanAnnualPercent: Number(e.target.value) })}
            />
          </div>

          <div className="lab-field-group">
            <div className="lab-field-header">
              <label htmlFor="prepay-tenure-input">Loan Tenure</label>
              <span className="lab-field-val">{prepay.loanTermYears} Years ({prepay.loanTermYears * 12} Months)</span>
            </div>
            <input
              id="prepay-tenure-input"
              type="range"
              min="3"
              max="30"
              step="1"
              value={prepay.loanTermYears}
              onChange={(e) => labStore.updatePrepay({ loanTermYears: Number(e.target.value) })}
            />
          </div>

          <div className="lab-field-group">
            <div className="lab-field-header">
              <label htmlFor="prepay-surplus-input">Monthly Surplus Cash Available</label>
              <span className="lab-field-val">₹{prepay.monthlySurplus.toLocaleString('en-IN')}</span>
            </div>
            <input
              id="prepay-surplus-input"
              type="range"
              min="0"
              max="100000"
              step="1000"
              value={prepay.monthlySurplus}
              onChange={(e) => labStore.updatePrepay({ monthlySurplus: Number(e.target.value) })}
            />
            <small className="lab-muted">Both strategies utilize the exact same monthly cash budget B = EMI + Surplus.</small>
          </div>

          <div className="lab-field-group">
            <div className="lab-field-header">
              <label htmlFor="prepay-invrate-input">Alternative Investment Return</label>
              <span className="lab-field-val">{prepay.investmentAnnualPercent}% p.a.</span>
            </div>
            <input
              id="prepay-invrate-input"
              type="range"
              min="4.0"
              max="25.0"
              step="0.5"
              value={prepay.investmentAnnualPercent}
              onChange={(e) => labStore.updatePrepay({ investmentAnnualPercent: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="lab-results-column">
          <div className="lab-kpi-card">
            <div className="lab-kpi-block lab-kpi-primary">
              <span className="lab-kpi-label">Mathematical Verdict at Horizon (Year {prepay.loanTermYears})</span>
              <span className="lab-kpi-val" data-testid="prepay-verdict-val">
                {isA ? 'Prepaying Debt Leads to Higher Wealth' : 'Investing Surplus Leads to Higher Wealth'}
              </span>
              <span className="lab-kpi-sub">
                Net Wealth Difference: <strong>₹{Math.abs(Math.round(diff)).toLocaleString('en-IN')}</strong> in favor of {isA ? 'Option A' : 'Option B'}.
              </span>
            </div>

            <div className="lab-strategy-grid">
              <div className={`lab-strategy-card ${isA ? 'card-winner' : ''}`}>
                <div className="lab-strategy-header">
                  <strong>Option A: Prepay + Invest</strong>
                  {isA && <span className="lab-badge badge-winner">Higher Wealth</span>}
                </div>
                <div className="lab-strat-body">
                  <div><span>Debt Paid Off in:</span> <strong>Year {result.ok ? +(result.payoffMonthA / 12).toFixed(1) : 0}</strong></div>
                  <div><span>Interest Saved:</span> <strong className="text-success">₹{result.ok ? Math.round(result.interestSaved).toLocaleString('en-IN') : 0}</strong></div>
                  <div><span>Terminal Investment Corpus:</span> <strong className="lab-val-highlight">₹{result.ok ? Math.round(result.optionA.terminalCorpus).toLocaleString('en-IN') : 0}</strong></div>
                </div>
              </div>

              <div className={`lab-strategy-card ${!isA ? 'card-winner' : ''}`}>
                <div className="lab-strategy-header">
                  <strong>Option B: EMI + Invest</strong>
                  {!isA && <span className="lab-badge badge-winner">Higher Wealth</span>}
                </div>
                <div className="lab-strat-body">
                  <div><span>Debt Paid Off in:</span> <strong>Year {prepay.loanTermYears} (Full Term)</strong></div>
                  <div><span>Total Interest Paid:</span> <strong>₹{result.ok ? Math.round(result.optionB.totalInterestPaid).toLocaleString('en-IN') : 0}</strong></div>
                  <div><span>Terminal Investment Corpus:</span> <strong className="lab-val-highlight">₹{result.ok ? Math.round(result.optionB.terminalCorpus).toLocaleString('en-IN') : 0}</strong></div>
                </div>
              </div>
            </div>

            <div className="lab-disclaimer-box" data-testid="prepay-disclaimer">
              <strong>Opportunity Cost Notice:</strong> {PREPAY_COMPARATOR_DISCLAIMER}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
