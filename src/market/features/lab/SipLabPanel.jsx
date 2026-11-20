import React, { useMemo } from 'react';
import { useLabStore, labStore } from './labStore.js';
import { calcSip, calcStepUpSip, calcGoalSip } from '../../math/index.js';

export function SipLabPanel() {
  const store = useLabStore();
  const { sip } = store;

  const result = useMemo(() => {
    if (sip.mode === 'stepup') {
      return calcStepUpSip({
        monthlyContribution: sip.monthlyContribution,
        termYears: sip.termYears,
        nominalAnnualPercent: sip.nominalAnnualPercent,
        stepUpType: sip.stepUpType,
        stepUpValue: sip.stepUpValue,
        contributionTiming: sip.contributionTiming
      });
    }
    if (sip.mode === 'goal') {
      return calcGoalSip({
        targetCorpus: sip.targetCorpus,
        termYears: sip.termYears,
        nominalAnnualPercent: sip.nominalAnnualPercent,
        contributionTiming: sip.contributionTiming
      });
    }
    return calcSip({
      monthlyContribution: sip.monthlyContribution,
      termYears: sip.termYears,
      nominalAnnualPercent: sip.nominalAnnualPercent,
      contributionTiming: sip.contributionTiming
    });
  }, [sip]);

  const invested = result.ok ? (result.invested || 0) : 0;
  const gain = result.ok ? (result.gain || 0) : 0;
  const totalValue = result.ok ? (result.futureValue ?? result.targetCorpus ?? 0) : 0;
  const investedRatio = totalValue > 0 ? (invested / totalValue) * 100 : 0;
  const gainRatio = totalValue > 0 ? (gain / totalValue) * 100 : 0;

  return (
    <div className="lab-subdesk" data-testid="sip-lab-panel">
      <div className="lab-mode-bar" role="tablist" aria-label="SIP calculation modes">
        <button
          type="button"
          role="tab"
          aria-selected={sip.mode === 'regular'}
          className={`lab-mode-btn ${sip.mode === 'regular' ? 'active' : ''}`}
          onClick={() => labStore.updateSip({ mode: 'regular' })}
        >
          Regular SIP
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sip.mode === 'stepup'}
          className={`lab-mode-btn ${sip.mode === 'stepup' ? 'active' : ''}`}
          onClick={() => labStore.updateSip({ mode: 'stepup' })}
        >
          Annual Step-Up SIP
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sip.mode === 'goal'}
          className={`lab-mode-btn ${sip.mode === 'goal' ? 'active' : ''}`}
          onClick={() => labStore.updateSip({ mode: 'goal' })}
        >
          Target Goal Planner
        </button>
      </div>

      <div className="lab-content-grid">
        <div className="lab-form-column">
          {sip.mode === 'goal' ? (
            <div className="lab-field-group">
              <label htmlFor="goal-target-input">Target Wealth (₹)</label>
              <div className="lab-dual-input">
                <input
                  id="goal-target-input"
                  type="number"
                  min="10000"
                  max="100000000"
                  step="10000"
                  value={sip.targetCorpus}
                  onChange={(e) => labStore.updateSip({ targetCorpus: Math.max(0, Number(e.target.value)) })}
                />
              </div>
            </div>
          ) : (
            <div className="lab-field-group">
              <div className="lab-field-header">
                <label htmlFor="sip-monthly-input">Monthly Investment</label>
                <span className="lab-field-val">₹{sip.monthlyContribution.toLocaleString('en-IN')}</span>
              </div>
              <input
                id="sip-monthly-input"
                type="range"
                min="500"
                max="200000"
                step="500"
                value={sip.monthlyContribution}
                onChange={(e) => labStore.updateSip({ monthlyContribution: Number(e.target.value) })}
              />
            </div>
          )}

          <div className="lab-field-group">
            <div className="lab-field-header">
              <label htmlFor="sip-tenure-input">Investment Horizon</label>
              <span className="lab-field-val">{sip.termYears} Years ({sip.termYears * 12} Months)</span>
            </div>
            <input
              id="sip-tenure-input"
              type="range"
              min="1"
              max="40"
              step="1"
              value={sip.termYears}
              onChange={(e) => labStore.updateSip({ termYears: Number(e.target.value) })}
            />
          </div>

          <div className="lab-field-group">
            <div className="lab-field-header">
              <label htmlFor="sip-rate-input">Expected Annual Return</label>
              <span className="lab-field-val">{sip.nominalAnnualPercent}% p.a.</span>
            </div>
            <input
              id="sip-rate-input"
              type="range"
              min="0"
              max="35"
              step="0.5"
              value={sip.nominalAnnualPercent}
              onChange={(e) => labStore.updateSip({ nominalAnnualPercent: Number(e.target.value) })}
            />
          </div>

          {sip.mode === 'stepup' && (
            <div className="lab-field-group lab-subgroup">
              <div className="lab-field-header">
                <label>Annual Step-Up Increment</label>
                <div className="lab-chip-group">
                  <button
                    type="button"
                    className={`lab-chip ${sip.stepUpType === 'AMOUNT' ? 'active' : ''}`}
                    onClick={() => labStore.updateSip({ stepUpType: 'AMOUNT' })}
                  >
                    Fixed ₹
                  </button>
                  <button
                    type="button"
                    className={`lab-chip ${sip.stepUpType === 'PERCENT' ? 'active' : ''}`}
                    onClick={() => labStore.updateSip({ stepUpType: 'PERCENT' })}
                  >
                    Percentage %
                  </button>
                </div>
              </div>
              <input
                type="number"
                min="0"
                max={sip.stepUpType === 'PERCENT' ? 50 : 50000}
                value={sip.stepUpValue}
                onChange={(e) => labStore.updateSip({ stepUpValue: Math.max(0, Number(e.target.value)) })}
              />
              <small className="lab-muted">
                {sip.stepUpType === 'PERCENT'
                  ? `Increases monthly investment by ${sip.stepUpValue}% every 12 months`
                  : `Increases monthly investment by ₹${sip.stepUpValue.toLocaleString('en-IN')} every 12 months`}
              </small>
            </div>
          )}

          <div className="lab-field-group">
            <div className="lab-field-header">
              <label>Contribution Timing</label>
              <div className="lab-chip-group">
                <button
                  type="button"
                  className={`lab-chip ${sip.contributionTiming === 'END_OF_MONTH' ? 'active' : ''}`}
                  onClick={() => labStore.updateSip({ contributionTiming: 'END_OF_MONTH' })}
                >
                  End of Month
                </button>
                <button
                  type="button"
                  className={`lab-chip ${sip.contributionTiming === 'BEGINNING_OF_MONTH' ? 'active' : ''}`}
                  onClick={() => labStore.updateSip({ contributionTiming: 'BEGINNING_OF_MONTH' })}
                >
                  Beginning of Month
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="lab-results-column">
          <div className="lab-kpi-card">
            {sip.mode === 'goal' ? (
              <div className="lab-kpi-block lab-kpi-primary">
                <span className="lab-kpi-label">Required Monthly SIP</span>
                <span className="lab-kpi-val" data-testid="required-sip-value">
                  ₹{Math.round(result.requiredMonthly || 0).toLocaleString('en-IN')}
                </span>
                <span className="lab-kpi-sub">To achieve ₹{sip.targetCorpus.toLocaleString('en-IN')} in {sip.termYears} years</span>
              </div>
            ) : (
              <div className="lab-kpi-block lab-kpi-primary">
                <span className="lab-kpi-label">Estimated Future Value</span>
                <span className="lab-kpi-val" data-testid="future-value">
                  ₹{Math.round(totalValue).toLocaleString('en-IN')}
                </span>
                <span className="lab-kpi-sub">Compounded monthly at {sip.nominalAnnualPercent}% p.a.</span>
              </div>
            )}

            <div className="lab-kpi-row">
              <div className="lab-kpi-block">
                <span className="lab-kpi-label">Total Capital Invested</span>
                <span className="lab-kpi-val">₹{Math.round(invested).toLocaleString('en-IN')}</span>
                <span className="lab-kpi-sub">{investedRatio.toFixed(1)}% of total</span>
              </div>
              <div className="lab-kpi-block">
                <span className="lab-kpi-label">Estimated Wealth Gain</span>
                <span className="lab-kpi-val text-success">₹{Math.round(gain).toLocaleString('en-IN')}</span>
                <span className="lab-kpi-sub">{gainRatio.toFixed(1)}% of total</span>
              </div>
            </div>

            <div className="lab-breakdown-bar" role="img" aria-label={`Invested ${investedRatio.toFixed(1)}%, Gain ${gainRatio.toFixed(1)}%`}>
              <div className="lab-bar-invested" style={{ width: `${investedRatio}%` }} />
              <div className="lab-bar-gain" style={{ width: `${gainRatio}%` }} />
            </div>
            <div className="lab-bar-legend">
              <span className="lab-legend-item"><span className="lab-legend-dot dot-invested" /> Invested ({investedRatio.toFixed(0)}%)</span>
              <span className="lab-legend-item"><span className="lab-legend-dot dot-gain" /> Wealth Gain ({gainRatio.toFixed(0)}%)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
