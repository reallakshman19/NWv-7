import React, { useMemo } from 'react';
import { useLabStore, labStore } from './labStore.js';
import { calcSwp, SWP_DISCLAIMER } from '../../math/index.js';

export function SwpLabPanel() {
  const store = useLabStore();
  const { swp } = store;

  const result = useMemo(() => {
    return calcSwp({
      initialCorpus: swp.initialCorpus,
      monthlyWithdrawal: swp.monthlyWithdrawal,
      nominalAnnualPercent: swp.nominalAnnualPercent,
      termYears: swp.termYears,
      withdrawalTiming: swp.withdrawalTiming
    });
  }, [swp]);

  const finalBal = result.ok ? result.finalBalance : 0;
  const isDepleted = result.ok && result.status === 'DEPLETED';
  const totalWithdrawn = result.ok ? result.totalWithdrawn : 0;
  const totalInterest = result.ok ? result.totalInterestEarned : 0;

  return (
    <div className="lab-subdesk" data-testid="swp-lab-panel">
      <div className="lab-content-grid">
        <div className="lab-form-column">
          <div className="lab-field-group">
            <div className="lab-field-header">
              <label htmlFor="swp-corpus-input">Total Retirement Corpus</label>
              <span className="lab-field-val">₹{swp.initialCorpus.toLocaleString('en-IN')}</span>
            </div>
            <input
              id="swp-corpus-input"
              type="range"
              min="500000"
              max="20000000"
              step="100000"
              value={swp.initialCorpus}
              onChange={(e) => labStore.updateSwp({ initialCorpus: Number(e.target.value) })}
            />
          </div>

          <div className="lab-field-group">
            <div className="lab-field-header">
              <label htmlFor="swp-withdrawal-input">Monthly Withdrawal</label>
              <span className="lab-field-val">₹{swp.monthlyWithdrawal.toLocaleString('en-IN')}</span>
            </div>
            <input
              id="swp-withdrawal-input"
              type="range"
              min="5000"
              max="200000"
              step="1000"
              value={swp.monthlyWithdrawal}
              onChange={(e) => labStore.updateSwp({ monthlyWithdrawal: Number(e.target.value) })}
            />
          </div>

          <div className="lab-field-group">
            <div className="lab-field-header">
              <label htmlFor="swp-rate-input">Expected Portfolio Return</label>
              <span className="lab-field-val">{swp.nominalAnnualPercent}% p.a.</span>
            </div>
            <input
              id="swp-rate-input"
              type="range"
              min="0"
              max="20"
              step="0.5"
              value={swp.nominalAnnualPercent}
              onChange={(e) => labStore.updateSwp({ nominalAnnualPercent: Number(e.target.value) })}
            />
          </div>

          <div className="lab-field-group">
            <div className="lab-field-header">
              <label htmlFor="swp-tenure-input">Simulation Horizon</label>
              <span className="lab-field-val">{swp.termYears} Years</span>
            </div>
            <input
              id="swp-tenure-input"
              type="range"
              min="5"
              max="40"
              step="1"
              value={swp.termYears}
              onChange={(e) => labStore.updateSwp({ termYears: Number(e.target.value) })}
            />
          </div>

          <div className="lab-field-group">
            <div className="lab-field-header">
              <label>Withdrawal Timing</label>
              <div className="lab-chip-group">
                <button
                  type="button"
                  className={`lab-chip ${swp.withdrawalTiming === 'BEGINNING_OF_MONTH' ? 'active' : ''}`}
                  onClick={() => labStore.updateSwp({ withdrawalTiming: 'BEGINNING_OF_MONTH' })}
                >
                  Beginning of Month (Standard)
                </button>
                <button
                  type="button"
                  className={`lab-chip ${swp.withdrawalTiming === 'END_OF_MONTH' ? 'active' : ''}`}
                  onClick={() => labStore.updateSwp({ withdrawalTiming: 'END_OF_MONTH' })}
                >
                  End of Month
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="lab-results-column">
          <div className="lab-kpi-card">
            <div className={`lab-kpi-block ${isDepleted ? 'lab-kpi-danger' : 'lab-kpi-success'}`}>
              <span className="lab-kpi-label">Simulation Longevity Status</span>
              <span className="lab-kpi-val" data-testid="swp-status-val">
                {isDepleted
                  ? `Depleted in Year ${result.depletionYears} (Month ${result.depletionMonth})`
                  : 'Not depleted in simulation'}
              </span>
              <span className="lab-kpi-sub">
                {isDepleted
                  ? 'Withdrawals exceeded return and exhausted the principal.'
                  : `Ending balance at Year ${swp.termYears}: ₹${Math.round(finalBal).toLocaleString('en-IN')}`}
              </span>
            </div>

            <div className="lab-kpi-row">
              <div className="lab-kpi-block">
                <span className="lab-kpi-label">Total Cash Withdrawn</span>
                <span className="lab-kpi-val">₹{Math.round(totalWithdrawn).toLocaleString('en-IN')}</span>
                <span className="lab-kpi-sub">Received across simulation</span>
              </div>
              <div className="lab-kpi-block">
                <span className="lab-kpi-label">Returns Earned</span>
                <span className="lab-kpi-val text-success">₹{Math.round(totalInterest).toLocaleString('en-IN')}</span>
                <span className="lab-kpi-sub">Compounded growth generated</span>
              </div>
            </div>

            <div className="lab-disclaimer-box" data-testid="swp-disclaimer">
              <strong>Retirement Model Disclaimer:</strong> {SWP_DISCLAIMER}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
