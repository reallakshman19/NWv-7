/**
 * NWv7 Market Desk R2.1 - WP-05 Fund SIP Scenario Modal
 * Illustrative compounding calculator consuming WP-08 calcSip contract interface.
 *
 * Rules:
 * 1. Delegates calculation to fundSipAdapter.js.
 * 2. Shortcut button labeled "Use historical rate as illustrative assumption", disabled if period incomplete.
 * 3. Prominently discloses that illustrative scenarios are not investment forecasts or return guarantees.
 */

import React, { useState, useMemo } from 'react';
import { computeFundSip } from './fundSipAdapter.js';

export function FundSipModal({
  isOpen,
  onClose,
  selectedFund = null // { schemeCode, schemeName, trailingReturns }
}) {
  const [monthly, setMonthly] = useState('5000');
  const [years, setYears] = useState('10');
  const [annualReturn, setAnnualReturn] = useState('12');
  const [rateSource, setRateSource] = useState('custom'); // 'custom' | 'historical_3y' | 'historical_5y'

  const availableHistoricalRate = useMemo(() => {
    if (!selectedFund?.trailingReturns) return null;
    const r5 = selectedFund.trailingReturns['5Y'];
    if (r5?.available && typeof r5.returnPercent === 'number' && r5.returnPercent > 0) {
      return { horizon: '5Y', rate: r5.returnPercent };
    }
    const r3 = selectedFund.trailingReturns['3Y'];
    if (r3?.available && typeof r3.returnPercent === 'number' && r3.returnPercent > 0) {
      return { horizon: '3Y', rate: r3.returnPercent };
    }
    return null;
  }, [selectedFund]);

  const handleApplyHistoricalRate = () => {
    if (availableHistoricalRate) {
      setAnnualReturn(String(availableHistoricalRate.rate.toFixed(2)));
      setRateSource(`historical_${availableHistoricalRate.horizon.toLowerCase()}`);
    }
  };

  const outcome = useMemo(() => {
    const p = Number(monthly);
    const y = Number(years);
    const r = Number(annualReturn);
    return computeFundSip(p, y, r);
  }, [monthly, years, annualReturn]);

  if (!isOpen) return null;

  const formatRupees = (val) => {
    if (!Number.isFinite(val)) return '₹0.00';
    return '₹' + Math.round(val).toLocaleString('en-IN');
  };

  return (
    <div className="portfolio-modal-overlay" role="presentation">
      <div
        className="portfolio-modal fund-sip-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sip-modal-title"
      >
        <div className="portfolio-modal-header">
          <h3 id="sip-modal-title">SIP Scenario Calculator</h3>
          <button
            type="button"
            className="portfolio-btn-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>

        <div className="fund-sip-body">
          {selectedFund && (
            <div className="fund-sip-target-scheme">
              <span className="scheme-label">Simulating for:</span>
              <strong className="scheme-name">{selectedFund.schemeName}</strong>
            </div>
          )}

          {/* Form Inputs */}
          <div className="fund-form-grid">
            <div className="portfolio-form-group">
              <label htmlFor="sip-monthly" className="portfolio-form-label">
                Monthly Contribution (₹)
              </label>
              <input
                id="sip-monthly"
                type="number"
                min="100"
                step="100"
                className="portfolio-input font-mono"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                required
              />
            </div>

            <div className="portfolio-form-group">
              <label htmlFor="sip-years" className="portfolio-form-label">
                Tenure (Years)
              </label>
              <input
                id="sip-years"
                type="number"
                min="1"
                max="50"
                className="portfolio-input font-mono"
                value={years}
                onChange={(e) => setYears(e.target.value)}
                required
              />
            </div>

            <div className="portfolio-form-group">
              <label htmlFor="sip-return" className="portfolio-form-label">
                Assumed Annual Return (%)
              </label>
              <input
                id="sip-return"
                type="number"
                min="0"
                max="100"
                step="0.1"
                className="portfolio-input font-mono"
                value={annualReturn}
                onChange={(e) => {
                  setAnnualReturn(e.target.value);
                  setRateSource('custom');
                }}
                required
              />
            </div>
          </div>

          {/* Historical Shortcut Button */}
          {availableHistoricalRate ? (
            <div className="fund-sip-shortcut-wrap">
              <button
                type="button"
                className="portfolio-btn portfolio-btn-secondary btn-sm"
                onClick={handleApplyHistoricalRate}
              >
                Use {availableHistoricalRate.horizon} CAGR ({availableHistoricalRate.rate.toFixed(1)}%) as illustrative assumption
              </button>
              {rateSource.startsWith('historical') && (
                <span className="shortcut-active-pill">
                  Applied {availableHistoricalRate.horizon} historical rate
                </span>
              )}
            </div>
          ) : (
            <div className="fund-sip-shortcut-wrap text-muted">
              <small>Historical 3Y/5Y CAGR unavailable for auto-fill on this scheme.</small>
            </div>
          )}

          {/* Compounding Results Card */}
          <div className="fund-sip-results-card">
            <div className="result-metric-row">
              <span className="result-label">Total Amount Invested:</span>
              <span className="result-val font-mono">{formatRupees(outcome.invested)}</span>
            </div>
            <div className="result-metric-row">
              <span className="result-label">Estimated Wealth Gain:</span>
              <span className="result-val font-mono profit">+{formatRupees(outcome.estimatedGain)}</span>
            </div>
            <div className="result-metric-row total-row">
              <span className="result-label">Illustrative Future Value:</span>
              <span className="result-val font-mono highlight">{formatRupees(outcome.futureValue)}</span>
            </div>
          </div>

          {/* Mandatory Regulatory & Math Disclaimer */}
          <div className="fund-disclaimer-note">
            <strong>Illustrative Scenario Only:</strong> Calculations assume end-of-month contributions and monthly compounding based on an assumed nominal rate.
            This does <em>not</em> constitute an investment forecast or guarantee of future returns.
            Mutual fund investments are subject to market risks.
          </div>
        </div>

        <div className="portfolio-modal-actions">
          <button
            type="button"
            className="portfolio-btn portfolio-btn-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
