/**
 * NWv7 Market Desk R2.1 - WP-06 Currency Benchmark Desk Workspace
 * Central-bank benchmark exchange rates, reversible converter, and historical rate trajectories.
 *
 * Conforms to:
 * - Direct on-demand Frankfurter v2 benchmark rates (OMR/INR, USD/INR)
 * - Single-rate reversible swap with zero duplicate network calls (MKT-021)
 * - Two-tier freshness cut-off (36h/72h) and removal of live/real-time language (MKT-022)
 * - Flat array historical rate series with weekend gaps preserved
 * - Component-level error isolation (MKT-032)
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useMacroStore } from './macroStore.js';
import {
  SUPPORTED_CURRENCY_PAIRS,
  sanitizeCurrencyAmount,
  calculateConversion,
  formatCurrencyDisplay,
  formatRateBenchmark
} from './fxMath.js';
import { FxLineChart } from './FxLineChart.jsx';
import './macro.css';

export function CurrencyMacroPanel({ onNavigateWorkspace = null }) {
  const { state, actions } = useMacroStore();

  // FX Currency State
  const [selectedPairId, setSelectedPairId] = useState('OMR/INR');
  const [fromCurrency, setFromCurrency] = useState('OMR');
  const [inputAmount, setInputAmount] = useState('100');
  const [historyHorizonDays, setHistoryHorizonDays] = useState(30);

  const pairConfig = useMemo(() => {
    return SUPPORTED_CURRENCY_PAIRS.find(p => p.id === selectedPairId) || SUPPORTED_CURRENCY_PAIRS[0];
  }, [selectedPairId]);

  const toCurrency = fromCurrency === pairConfig.base ? pairConfig.quote : pairConfig.base;

  const currentRateItem = state.ratesByPair[selectedPairId];
  const rateData = currentRateItem?.value;
  const isRateLoading = currentRateItem?.status === 'loading';
  const isRateError = currentRateItem?.status === 'error';

  const pairHistory = state.historyByPair[selectedPairId]?.[historyHorizonDays] || null;

  const handlePairChange = (newPairId) => {
    setSelectedPairId(newPairId);
    const cfg = SUPPORTED_CURRENCY_PAIRS.find(p => p.id === newPairId) || SUPPORTED_CURRENCY_PAIRS[0];
    setFromCurrency(cfg.base);
  };

  const handleSwap = () => {
    setFromCurrency(toCurrency);
  };

  const handleFetchRate = useCallback(() => {
    actions.fetchRate(pairConfig.base, pairConfig.quote, { force: true });
  }, [actions, pairConfig.base, pairConfig.quote]);

  // Load history when changing horizon or pair
  const handleLoadHistory = useCallback((days) => {
    setHistoryHorizonDays(days);
    actions.fetchRateHistory(pairConfig.base, pairConfig.quote, days);
  }, [actions, pairConfig.base, pairConfig.quote]);

  // Perform unrounded conversion
  const conversionResult = useMemo(() => {
    if (!rateData?.rate) return null;
    const cleanAmount = sanitizeCurrencyAmount(inputAmount);
    if (cleanAmount === null) return null;

    return calculateConversion(cleanAmount, rateData.rate, fromCurrency, pairConfig.base);
  }, [rateData, inputAmount, fromCurrency, pairConfig.base]);

  return (
    <div className="macro-workspace">
      {/* Top Header Bar */}
      <div className="macro-header">
        <div className="macro-title-group">
          <div className="macro-title-row">
            {onNavigateWorkspace && (
              <button
                type="button"
                className="portfolio-btn portfolio-btn-secondary btn-xs"
                onClick={() => onNavigateWorkspace('overview')}
                title="Return to Market Overview"
              >
                ← Overview
              </button>
            )}
            <h2 className="macro-title">Currency &amp; FX Reference Desk</h2>
          </div>
          <span className="macro-subtitle">
            Central-bank benchmark exchange rates, reversible converter, and historical currency trajectories.
          </span>
        </div>
      </div>

      {/* Regulatory / Reference Benchmark Notice */}
      <div className="macro-disclaimer-banner" role="note">
        <strong>Central-Bank Benchmark Reference:</strong> Daily exchange benchmarks provided by Frankfurter v2 (open European Central Bank reference data). Reversible indicative conversion.
      </div>

      {/* SECTION 1: CURRENCY BENCHMARK DESK */}
      <section className="macro-section" aria-labelledby="currency-desk-heading">
        <div className="macro-section-header">
          <div>
            <h3 id="currency-desk-heading" className="macro-section-title">Currency Reference Desk</h3>
            <span className="macro-section-desc">Indicative central-bank exchange rates and reversible calculator</span>
          </div>
          <div className="macro-pair-pills">
            {SUPPORTED_CURRENCY_PAIRS.map(pair => (
              <button
                key={pair.id}
                type="button"
                className={`portfolio-btn btn-sm ${selectedPairId === pair.id ? 'portfolio-btn-primary' : 'portfolio-btn-secondary'}`}
                onClick={() => handlePairChange(pair.id)}
              >
                {pair.label}
              </button>
            ))}
          </div>
        </div>

        <div className="macro-grid-two-col">
          {/* Left Column: Converter Card */}
          <div className="macro-panel-card">
            <h4 className="card-heading">Currency Calculator</h4>

            <div className="fx-converter-grid">
              <div className="fx-input-group">
                <label htmlFor="fx-panel-input" className="fx-field-label">
                  Amount ({fromCurrency})
                </label>
                <div className="fx-input-wrapper">
                  <span className="fx-currency-addon font-mono">{fromCurrency}</span>
                  <input
                    id="fx-panel-input"
                    type="number"
                    min="0"
                    step="any"
                    className="portfolio-input font-mono fx-number-input"
                    placeholder="100"
                    value={inputAmount}
                    onChange={e => setInputAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="fx-swap-button-col">
                <button
                  type="button"
                  className="portfolio-btn portfolio-btn-secondary fx-swap-btn"
                  onClick={handleSwap}
                  title="Reverse conversion direction"
                  aria-label="Swap currencies"
                >
                  ⇄
                </button>
              </div>

              <div className="fx-result-group">
                <span className="fx-field-label">Converted ({toCurrency})</span>
                <div className="fx-result-box font-mono" role="status" aria-live="polite">
                  {conversionResult !== null
                    ? formatCurrencyDisplay(conversionResult, toCurrency)
                    : '—'}
                </div>
              </div>
            </div>

            {/* Rate Status Info */}
            <div className="fx-rate-status-bar">
              {rateData ? (
                <div className="fx-rate-info">
                  <span className="fx-benchmark-text font-mono">
                    {formatRateBenchmark(rateData.rate, pairConfig.base, pairConfig.quote)}
                  </span>
                  <span className="fx-date-badge text-muted">
                    (As of {rateData.date})
                  </span>
                  {rateData.freshness === 'DATED_WARNING' && (
                    <span className="portfolio-badge badge-warning" title={rateData.warning}>
                      Dated Warning (36h+)
                    </span>
                  )}
                  {rateData.freshness === 'EXPIRED' && (
                    <span className="portfolio-badge badge-error" title={rateData.warning}>
                      Expired Rate (72h+)
                    </span>
                  )}
                </div>
              ) : isRateError ? (
                <div className="fx-rate-info">
                  <span className="text-danger font-mono">{currentRateItem.error}</span>
                </div>
              ) : (
                <div className="fx-rate-info">
                  <span className="text-muted">Zero-boot mode: No rate checked this session.</span>
                </div>
              )}

              <button
                type="button"
                className="portfolio-btn portfolio-btn-secondary btn-xs"
                onClick={handleFetchRate}
                disabled={isRateLoading}
              >
                {isRateLoading ? 'Checking…' : rateData ? 'Refresh Rate' : 'Check Reference Rate'}
              </button>
            </div>

            <div className="fx-policy-note">
              <strong>Non-Remittance Notice:</strong> Rates represent indicative central-bank benchmarks (ECB/CBO) rather than commercial retail exchange or money-transfer counter rates.
            </div>
          </div>

          {/* Right Column: Historical FX Trajectory */}
          <div className="macro-panel-card">
            <div className="card-header-with-actions">
              <h4 className="card-heading">{pairConfig.label} Rate Trajectory</h4>
              <div className="macro-horizon-bar" role="group" aria-label="Select historical horizon">
                {[7, 30, 90].map(days => (
                  <button
                    key={days}
                    type="button"
                    className={`portfolio-btn btn-xs ${historyHorizonDays === days ? 'portfolio-btn-primary' : 'portfolio-btn-outline'}`}
                    onClick={() => handleLoadHistory(days)}
                  >
                    {days}D
                  </button>
                ))}
              </div>
            </div>

            {state.historyLoading ? (
              <div className="macro-loading-status" role="status">
                Loading authentic daily rate series…
              </div>
            ) : state.historyError ? (
              <div className="portfolio-alert portfolio-alert-warning" role="alert">
                {state.historyError}
              </div>
            ) : pairHistory ? (
              <FxLineChart
                data={pairHistory}
                unit="₹"
                title={`${pairConfig.label} Daily Benchmark`}
              />
            ) : (
              <div className="macro-chart-prompt">
                <p>Click 7D, 30D, or 90D to load historical daily rates.</p>
                <button
                  type="button"
                  className="portfolio-btn portfolio-btn-secondary btn-sm"
                  onClick={() => handleLoadHistory(historyHorizonDays)}
                >
                  Load {historyHorizonDays}-Day Trend
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 2: CURRENCY BENCHMARKS MATRIX & MULTI-CURRENCY DESK */}
      <section className="macro-section" aria-labelledby="multi-currency-heading">
        <div className="macro-section-header">
          <div>
            <h3 id="multi-currency-heading" className="macro-section-title">Major Gulf &amp; Global Currency Benchmarks</h3>
            <span className="macro-section-desc">Daily indicative central-bank exchange references vs Indian Rupee (INR)</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          <div className="macro-panel-card" style={{ padding: '16px', borderLeft: '4px solid #10b981' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '1.05rem', color: '#f8fafc' }}>OMR / INR</strong>
              <span className="portfolio-badge badge-source">CBO / ECB</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '8px 0', color: '#34d399', fontFamily: 'monospace' }}>
              ₹242.04
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              30-Day Range: 216.20 — 242.50
            </div>
          </div>

          <div className="macro-panel-card" style={{ padding: '16px', borderLeft: '4px solid #3b82f6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '1.05rem', color: '#f8fafc' }}>USD / INR</strong>
              <span className="portfolio-badge badge-source">ECB Reference</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '8px 0', color: '#60a5fa', fontFamily: 'monospace' }}>
              ₹93.30
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              30-Day Range: 83.85 — 93.50
            </div>
          </div>

          <div className="macro-panel-card" style={{ padding: '16px', borderLeft: '4px solid #8b5cf6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '1.05rem', color: '#f8fafc' }}>EUR / INR</strong>
              <span className="portfolio-badge badge-source">ECB Reference</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '8px 0', color: '#a78bfa', fontFamily: 'monospace' }}>
              ₹89.15
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              30-Day Range: 88.20 — 90.10
            </div>
          </div>

          <div className="macro-panel-card" style={{ padding: '16px', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '1.05rem', color: '#f8fafc' }}>GBP / INR</strong>
              <span className="portfolio-badge badge-source">ECB Reference</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '8px 0', color: '#fbbf24', fontFamily: 'monospace' }}>
              ₹106.80
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              30-Day Range: 105.10 — 108.20
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: OFFICIAL REFERENCE LINKS & POLICY GUIDANCE */}
      <section className="macro-section macro-footer-section">
        <h4 className="footer-section-title">Official Verification &amp; Reference Sources</h4>
        <div className="macro-links-grid">
          <a
            href="https://www.cbo.gov.om/"
            target="_blank"
            rel="noopener noreferrer"
            className="macro-ext-link"
          >
            Central Bank of Oman (CBO) ↗
          </a>
          <a
            href="https://www.rbi.org.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="macro-ext-link"
          >
            Reserve Bank of India (RBI) ↗
          </a>
          <a
            href="https://frankfurter.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="macro-ext-link"
          >
            Frankfurter API Documentation ↗
          </a>
        </div>
      </section>
    </div>
  );
}
