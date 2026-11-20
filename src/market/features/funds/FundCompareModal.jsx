/**
 * NWv7 Market Desk R2.1 - WP-05 Multi-Fund Comparison Modal
 * Enables side-by-side comparative analysis of 2 to 3 saved mutual funds.
 *
 * Rules:
 * 1. Evaluates over qualified common observation dates (intersection).
 * 2. Rebases all comparing schemes to 100 at horizon start date.
 * 3. Compares trailing return, Max Drawdown, and Annualized Volatility.
 * 4. Discloses that base-100 reflects relative NAV movement, not identical risk.
 */

import React, { useState, useEffect } from 'react';
import {
  alignComparativeHistory,
  calculateTrailingReturns,
  calculateMaxDrawdown,
  calculateAnnualizedVolatility,
  subtractCalendarPeriod
} from './fundMath.js';
import { FundNavChart, CHART_RANGES } from './FundNavChart.jsx';

function buildComparisonOutcome(activeSelectedCodes, historyCache, horizon) {
  if (activeSelectedCodes.length < 2) return null;

  const schemesMap = {};
  for (const code of activeSelectedCodes) {
    const hist = historyCache[code];
    if (hist && Array.isArray(hist.observations) && hist.observations.length > 0) {
      schemesMap[code] = hist.observations;
    } else {
      // Missing history
      return { isReady: false, missingCode: code };
    }
  }

  // Find latest common reference date across funds
  let minLatestDate = '9999-99-99';
  for (const code of activeSelectedCodes) {
    const obs = schemesMap[code];
    const latest = obs[obs.length - 1].date;
    if (latest < minLatestDate) minLatestDate = latest;
  }

  const rangeConfig = CHART_RANGES.find(r => r.id === horizon) || CHART_RANGES[2];
  const startDate = subtractCalendarPeriod(minLatestDate, {
    months: rangeConfig.months,
    years: rangeConfig.years
  });

  const aligned = alignComparativeHistory(schemesMap, startDate);

  // Compute metrics per scheme over aligned window
  const metricsByScheme = {};
  for (const code of activeSelectedCodes) {
    const obs = schemesMap[code].filter(o => o.date >= startDate);
    const trailing = calculateTrailingReturns(obs);
    const mdd = calculateMaxDrawdown(obs);
    const vol = calculateAnnualizedVolatility(obs);

    const hist = historyCache[code];
    metricsByScheme[code] = {
      code,
      name: hist.schemeName || `Scheme ${code}`,
      category: hist.category || 'Mutual Fund',
      plan: hist.plan || 'Direct',
      option: hist.option || 'Growth',
      isIdcw: hist.isIdcw || false,
      latestNav: hist.latestNav,
      latestDate: hist.latestDate,
      returnPercent: trailing[horizon]?.returnPercent ?? null,
      isCagr: trailing[horizon]?.isCagr ?? false,
      mddPercent: mdd.mddPercent,
      volatilityPercent: vol.volatilityPercent
    };
  }

  return {
    isReady: true,
    alignedDates: aligned.alignedDates,
    seriesByScheme: aligned.seriesByScheme,
    metricsByScheme
  };
}

function FundCompareDialog({
  onClose,
  savedCodes = [],
  historyCache = {},
  onFetchHistory = null
}) {
  const [selectedCodes, setSelectedCodes] = useState(() => savedCodes.slice(0, 2));
  const [horizon, setHorizon] = useState('1Y');
  const [loadingCode, setLoadingCode] = useState(null);

  const activeSelectedCodes = selectedCodes.length >= 2 ? selectedCodes : savedCodes.slice(0, 2);

  // Ensure histories are fetched for selected funds
  useEffect(() => {
    if (!onFetchHistory) return;
    let isMounted = true;
    for (const code of activeSelectedCodes) {
      if (!historyCache[code] || !historyCache[code].observations) {
        Promise.resolve().then(() => {
          if (isMounted) setLoadingCode(code);
        });
        onFetchHistory(code).finally(() => {
          if (isMounted) setLoadingCode(null);
        });
      }
    }
    return () => {
      isMounted = false;
    };
  }, [activeSelectedCodes, historyCache, onFetchHistory]);

  const toggleCodeSelection = (code) => {
    if (activeSelectedCodes.includes(code)) {
      if (activeSelectedCodes.length > 1) {
        setSelectedCodes(activeSelectedCodes.filter(c => c !== code));
      }
    } else {
      if (activeSelectedCodes.length < 3) {
        setSelectedCodes([...activeSelectedCodes, code]);
      }
    }
  };

  const comparisonOutcome = buildComparisonOutcome(activeSelectedCodes, historyCache, horizon);

  const schemesMeta = {};
  for (const code of activeSelectedCodes) {
    const hist = historyCache[code];
    schemesMeta[code] = {
      name: hist?.schemeName || `Scheme ${code}`
    };
  }

  return (
    <div className="portfolio-modal-overlay" role="presentation">
      <div
        className="portfolio-modal fund-compare-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-modal-title"
      >
        <div className="portfolio-modal-header">
          <h3 id="compare-modal-title">Multi-Scheme Comparative Analysis</h3>
          <button
            type="button"
            className="portfolio-btn-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>

        <div className="fund-compare-body">
          {/* Scheme Selection Pills */}
          <div className="fund-compare-selection-bar">
            <span className="selection-label">Select 2 or 3 funds to compare:</span>
            <div className="scheme-pills-wrap">
              {savedCodes.map((code) => {
                const hist = historyCache[code];
                const isSelected = activeSelectedCodes.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    className={`scheme-toggle-pill ${isSelected ? 'active' : ''}`}
                    onClick={() => toggleCodeSelection(code)}
                  >
                    <span>{hist?.schemeName ? hist.schemeName.slice(0, 24) + '…' : `Scheme ${code}`}</span>
                    {isSelected && <span className="check-mark">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Horizon Bar */}
          <div className="fund-compare-horizon-bar">
            <span className="horizon-label">Comparison Horizon:</span>
            <div className="fund-chart-range-bar" role="group" aria-label="Select horizon">
              {['1M', '6M', '1Y', '3Y', '5Y'].map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`fund-range-btn ${horizon === h ? 'active' : ''}`}
                  onClick={() => setHorizon(h)}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {/* Status Notifications */}
          <div className="fund-compare-disclosure" role="note">
            <strong>Base-100 Rebase Convention:</strong> All schemes are indexed to 100 on the earliest shared observation date for the selected horizon.
            Charts reflect relative growth from a common baseline, not identical initial risk. IDCW NAVs exclude cash distributions.
          </div>

          {loadingCode && (
            <div className="fund-loading-status" role="status">
              Loading historical observations for scheme {loadingCode}…
            </div>
          )}

          {comparisonOutcome?.isReady ? (
            <>
              {/* Comparative Chart */}
              <FundNavChart
                isComparison={true}
                comparisonData={{
                  alignedDates: comparisonOutcome.alignedDates,
                  seriesByScheme: comparisonOutcome.seriesByScheme
                }}
                schemesMeta={schemesMeta}
              />

              {/* Side-by-Side Metrics Table */}
              <div className="portfolio-table-container">
                <table className="portfolio-table" aria-label="Scheme comparison table">
                  <thead>
                    <tr>
                      <th>Scheme</th>
                      <th>Plan / Option</th>
                      <th className="num">Latest NAV</th>
                      <th className="num">{horizon} Return</th>
                      <th className="num">Max Drawdown</th>
                      <th className="num">Volatility</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSelectedCodes.map((code) => {
                      const m = comparisonOutcome.metricsByScheme[code];
                      if (!m) return null;
                      return (
                        <tr key={code}>
                          <td>
                            <strong>{m.name}</strong>
                            <div className="text-muted"><small>{m.category}</small></div>
                          </td>
                          <td>
                            <span className="badge-tag tag-neutral">{m.plan}</span>{' '}
                            <span className={`badge-tag ${m.isIdcw ? 'tag-warning' : 'tag-success'}`}>{m.option}</span>
                          </td>
                          <td className="num font-mono">
                            {m.latestNav ? `₹${Number(m.latestNav).toFixed(2)}` : '—'}
                          </td>
                          <td className={`num font-mono ${m.returnPercent !== null ? (m.returnPercent >= 0 ? 'profit' : 'loss') : ''}`}>
                            {m.returnPercent !== null ? `${m.returnPercent >= 0 ? '+' : ''}${m.returnPercent.toFixed(2)}%` : 'Unavailable'}
                          </td>
                          <td className="num font-mono loss">
                            {m.mddPercent !== null ? `-${m.mddPercent.toFixed(2)}%` : '—'}
                          </td>
                          <td className="num font-mono">
                            {m.volatilityPercent !== null ? `${m.volatilityPercent.toFixed(2)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="fund-empty-state">
              <p>Select at least 2 saved funds with complete historical observations to begin comparison.</p>
            </div>
          )}
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

export function FundCompareModal({ isOpen = false, ...props }) {
  if (!isOpen) return null;
  return <FundCompareDialog {...props} />;
}
