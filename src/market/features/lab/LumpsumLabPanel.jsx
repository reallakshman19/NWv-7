import React, { useMemo } from 'react';
import { useLabStore, labStore } from './labStore.js';
import { calcLumpsum } from '../../math/index.js';

export function LumpsumLabPanel() {
  const store = useLabStore();
  const { lumpsum } = store;

  const result = useMemo(() => {
    return calcLumpsum({
      principal: lumpsum.principal,
      termYears: lumpsum.termYears,
      nominalAnnualPercent: lumpsum.nominalAnnualPercent,
      compoundingFrequency: lumpsum.compoundingFrequency,
      inflationAnnualPercent: lumpsum.inflationAnnualPercent
    });
  }, [lumpsum]);

  const nominalVal = result.ok ? result.nominalFutureValue : 0;
  const realVal = result.ok ? result.realFutureValue : 0;
  const gain = result.ok ? result.totalGain : 0;
  const ear = result.ok ? result.effectiveAnnualRatePercent : 0;

  return (
    <div className="lab-subdesk" data-testid="lumpsum-lab-panel">
      <div className="lab-content-grid">
        <div className="lab-form-column">
          <div className="lab-field-group">
            <div className="lab-field-header">
              <label htmlFor="lumpsum-principal-input">One-Time Investment</label>
              <span className="lab-field-val">₹{lumpsum.principal.toLocaleString('en-IN')}</span>
            </div>
            <input
              id="lumpsum-principal-input"
              type="range"
              min="5000"
              max="5000000"
              step="5000"
              value={lumpsum.principal}
              onChange={(e) => labStore.updateLumpsum({ principal: Number(e.target.value) })}
            />
          </div>

          <div className="lab-field-group">
            <div className="lab-field-header">
              <label htmlFor="lumpsum-tenure-input">Investment Horizon</label>
              <span className="lab-field-val">{lumpsum.termYears} Years</span>
            </div>
            <input
              id="lumpsum-tenure-input"
              type="range"
              min="1"
              max="30"
              step="1"
              value={lumpsum.termYears}
              onChange={(e) => labStore.updateLumpsum({ termYears: Number(e.target.value) })}
            />
          </div>

          <div className="lab-field-group">
            <div className="lab-field-header">
              <label htmlFor="lumpsum-rate-input">Nominal Annual Return</label>
              <span className="lab-field-val">{lumpsum.nominalAnnualPercent}% p.a.</span>
            </div>
            <input
              id="lumpsum-rate-input"
              type="range"
              min="1"
              max="30"
              step="0.5"
              value={lumpsum.nominalAnnualPercent}
              onChange={(e) => labStore.updateLumpsum({ nominalAnnualPercent: Number(e.target.value) })}
            />
          </div>

          <div className="lab-field-group">
            <div className="lab-field-header">
              <label>Compounding Frequency</label>
              <div className="lab-chip-group">
                {[
                  { label: 'Quarterly (FD)', val: 4 },
                  { label: 'Monthly', val: 12 },
                  { label: 'Semi-Annual', val: 2 },
                  { label: 'Annual', val: 1 }
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    className={`lab-chip ${lumpsum.compoundingFrequency === item.val ? 'active' : ''}`}
                    onClick={() => labStore.updateLumpsum({ compoundingFrequency: item.val })}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lab-field-group">
            <div className="lab-field-header">
              <label htmlFor="lumpsum-inflation-input">Hypothetical Inflation Assumption</label>
              <span className="lab-field-val">{lumpsum.inflationAnnualPercent}% p.a.</span>
            </div>
            <input
              id="lumpsum-inflation-input"
              type="range"
              min="0"
              max="15"
              step="0.5"
              value={lumpsum.inflationAnnualPercent}
              onChange={(e) => labStore.updateLumpsum({ inflationAnnualPercent: Number(e.target.value) })}
            />
            <small className="lab-muted">User-entered assumption for purchasing power comparison (not a live CPI feed).</small>
          </div>
        </div>

        <div className="lab-results-column">
          <div className="lab-kpi-card">
            <div className="lab-kpi-block lab-kpi-primary">
              <span className="lab-kpi-label">Nominal Future Value</span>
              <span className="lab-kpi-val" data-testid="lumpsum-nominal-val">
                ₹{Math.round(nominalVal).toLocaleString('en-IN')}
              </span>
              <span className="lab-kpi-sub">
                Effective Annual Rate (EAR): {ear.toFixed(2)}% | Total Gain: ₹{Math.round(gain).toLocaleString('en-IN')}
              </span>
            </div>

            <div className="lab-kpi-row">
              <div className="lab-kpi-block">
                <span className="lab-kpi-label">Real Purchasing Power</span>
                <span className="lab-kpi-val text-accent">
                  ₹{Math.round(realVal).toLocaleString('en-IN')}
                </span>
                <span className="lab-kpi-sub">In today's money at {lumpsum.inflationAnnualPercent}% inflation</span>
              </div>
              <div className="lab-kpi-block">
                <span className="lab-kpi-label">Inflation Wealth Erosion</span>
                <span className="lab-kpi-val text-danger">
                  {result.ok ? result.wealthErosionPercent.toFixed(1) : 0}%
                </span>
                <span className="lab-kpi-sub">Loss in real purchasing power</span>
              </div>
            </div>

            <div className="lab-inflation-callout">
              <strong>Why Purchasing Power Matters:</strong> In {lumpsum.termYears} years, your ₹{lumpsum.principal.toLocaleString('en-IN')} will grow nominally to ₹{Math.round(nominalVal).toLocaleString('en-IN')}, but inflation at {lumpsum.inflationAnnualPercent}% reduces its real buying capacity to ₹{Math.round(realVal).toLocaleString('en-IN')}.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
