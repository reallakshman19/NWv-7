/**
 * NWv7 Market Desk R2.1 - WP-06 Currency & Macro Panel Workspace
 * Comprehensive Currency Benchmark Desk & World Bank Macroeconomic Indicators.
 *
 * Conforms to:
 * - Direct on-demand Frankfurter v2 benchmark rates (OMR/INR, USD/INR)
 * - Single-rate reversible swap with zero duplicate network calls (MKT-021)
 * - Two-tier freshness cut-off (36h/72h) and removal of live/real-time language (MKT-022)
 * - Flat array historical rate series with weekend gaps preserved
 * - World Bank WDI annual indicators (GDP Growth, Consumer Inflation) under CC BY-4.0 (MKT-023)
 * - Independent observation-year display (no unequal-year conflation)
 * - Component-level error isolation (MKT-032)
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useMacroStore } from './macroStore.js';
import {
  SUPPORTED_CURRENCY_PAIRS,
  sanitizeCurrencyAmount,
  calculateConversion,
  formatCurrencyDisplay,
  formatRateBenchmark
} from './fxMath.js';
import {
  WDI_INDICATORS,
  SUPPORTED_MACRO_COUNTRIES
} from './macroClient.js';
import { MacroChart } from './MacroChart.jsx';
import './macro.css';

export function CurrencyMacroPanel({ onNavigateWorkspace = null }) {
  const { state, actions } = useMacroStore();

  // FX Currency State
  const [selectedPairId, setSelectedPairId] = useState('OMR/INR');
  const [fromCurrency, setFromCurrency] = useState('OMR');
  const [inputAmount, setInputAmount] = useState('100');
  const [historyHorizonDays, setHistoryHorizonDays] = useState(30);

  // Macro State
  const [selectedCountryCode, setSelectedCountryCode] = useState('IND');
  const [selectedMacroIndicator, setSelectedMacroIndicator] = useState(WDI_INDICATORS.GDP_GROWTH.id);

  const pairConfig = useMemo(() => {
    return SUPPORTED_CURRENCY_PAIRS.find(p => p.id === selectedPairId) || SUPPORTED_CURRENCY_PAIRS[0];
  }, [selectedPairId]);

  const toCurrency = fromCurrency === pairConfig.base ? pairConfig.quote : pairConfig.base;

  const currentRateItem = state.ratesByPair[selectedPairId];
  const rateData = currentRateItem?.value;
  const isRateLoading = currentRateItem?.status === 'loading';
  const isRateError = currentRateItem?.status === 'error';

  const pairHistory = state.historyByPair[selectedPairId]?.[historyHorizonDays] || null;

  // Active Macro Indicator Data
  const gdpKey = `${selectedCountryCode}_${WDI_INDICATORS.GDP_GROWTH.id}`;
  const inflationKey = `${selectedCountryCode}_${WDI_INDICATORS.INFLATION.id}`;

  const gdpItem = state.macroByKey[gdpKey];
  const inflationItem = state.macroByKey[inflationKey];

  const activeMacroData = selectedMacroIndicator === WDI_INDICATORS.GDP_GROWTH.id
    ? gdpItem?.data
    : inflationItem?.data;

  const isMacroLoading = selectedMacroIndicator === WDI_INDICATORS.GDP_GROWTH.id
    ? gdpItem?.status === 'loading'
    : inflationItem?.status === 'loading';

  const macroError = selectedMacroIndicator === WDI_INDICATORS.GDP_GROWTH.id
    ? gdpItem?.error
    : inflationItem?.error;

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

  // Load macro indicators on-demand when entering workspace or switching country
  const handleLoadCountryMacro = useCallback((country) => {
    setSelectedCountryCode(country);
    actions.fetchMacroIndicator(country, WDI_INDICATORS.GDP_GROWTH.id).catch(() => {});
    actions.fetchMacroIndicator(country, WDI_INDICATORS.INFLATION.id).catch(() => {});
  }, [actions]);

  useEffect(() => {
    // Initial fetch of macro indicator if not present
    if (!state.macroByKey[gdpKey]) {
      actions.fetchMacroIndicator(selectedCountryCode, WDI_INDICATORS.GDP_GROWTH.id).catch(() => {});
    }
    if (!state.macroByKey[inflationKey]) {
      actions.fetchMacroIndicator(selectedCountryCode, WDI_INDICATORS.INFLATION.id).catch(() => {});
    }
  }, [selectedCountryCode, gdpKey, inflationKey, actions, state.macroByKey]);

  // Perform unrounded conversion
  const conversionResult = useMemo(() => {
    if (!rateData?.rate) return null;
    const cleanAmount = sanitizeCurrencyAmount(inputAmount);
    if (cleanAmount === null) return null;

    return calculateConversion(cleanAmount, rateData.rate, fromCurrency, pairConfig.base);
  }, [rateData, inputAmount, fromCurrency, pairConfig.base]);

  const activeCountryMeta = SUPPORTED_MACRO_COUNTRIES.find(c => c.code === selectedCountryCode) || SUPPORTED_MACRO_COUNTRIES[0];

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
                &larr; Overview
              </button>
            )}
            <h2 className="macro-title">Currency &amp; Macro Indicators</h2>
          </div>
          <span className="macro-subtitle">
            Central-bank benchmark exchange rates, reversible converter, and World Bank annual macroeconomic statistics.
          </span>
        </div>
      </div>

      {/* Regulatory / Open Source Disclaimer */}
      <div className="macro-disclaimer-banner" role="note">
        <strong>$0 Budget &amp; Free Open Sources:</strong> Exchange benchmarks provided by Frankfurter v2 (open ECB/CBO reference data) and macroeconomic statistics from World Bank WDI under Creative Commons Attribution 4.0 (CC BY-4.0).
        Zero background boot polling.
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
              <MacroChart
                mode="LINE"
                data={pairHistory}
                unit=""
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

      {/* SECTION 2: WORLD BANK MACROECONOMIC INDICATORS */}
      <section className="macro-section" aria-labelledby="macro-desk-heading">
        <div className="macro-section-header">
          <div>
            <h3 id="macro-desk-heading" className="macro-section-title">World Bank Macroeconomic Indicators</h3>
            <span className="macro-section-desc">Annual economic growth and consumer price inflation statistics</span>
          </div>
          <div className="macro-country-pills">
            {SUPPORTED_MACRO_COUNTRIES.map(c => (
              <button
                key={c.code}
                type="button"
                className={`portfolio-btn btn-sm ${selectedCountryCode === c.code ? 'portfolio-btn-primary' : 'portfolio-btn-secondary'}`}
                onClick={() => handleLoadCountryMacro(c.code)}
              >
                {c.flag} {c.name} ({c.code})
              </button>
            ))}
          </div>
        </div>

        {/* Indicator Metric Cards Grid */}
        <div className="macro-metrics-grid">
          {/* GDP Growth Metric Card */}
          <div
            className={`macro-metric-card ${selectedMacroIndicator === WDI_INDICATORS.GDP_GROWTH.id ? 'active' : ''}`}
            onClick={() => setSelectedMacroIndicator(WDI_INDICATORS.GDP_GROWTH.id)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && setSelectedMacroIndicator(WDI_INDICATORS.GDP_GROWTH.id)}
          >
            <div className="metric-header-row">
              <span className="metric-title">{WDI_INDICATORS.GDP_GROWTH.name}</span>
              <span className="metric-country-tag">{activeCountryMeta.code}</span>
            </div>
            <div className="metric-value-row">
              {gdpItem?.status === 'loading' ? (
                <span className="metric-val loading">Loading…</span>
              ) : gdpItem?.data ? (
                <span className={`metric-val font-mono ${gdpItem.data.latestValue >= 0 ? 'profit' : 'loss'}`}>
                  {gdpItem.data.latestValue > 0 ? '+' : ''}{gdpItem.data.latestValue.toFixed(2)}%
                </span>
              ) : (
                <span className="metric-val text-muted">—</span>
              )}
            </div>
            <div className="metric-footer-row">
              <span className="metric-period">
                {gdpItem?.data ? `Reference: ${gdpItem.data.latestYear} (Annual)` : 'Year unavailable'}
              </span>
              <span className="metric-unit">Constant Local Currency</span>
            </div>
          </div>

          {/* Inflation Metric Card */}
          <div
            className={`macro-metric-card ${selectedMacroIndicator === WDI_INDICATORS.INFLATION.id ? 'active' : ''}`}
            onClick={() => setSelectedMacroIndicator(WDI_INDICATORS.INFLATION.id)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && setSelectedMacroIndicator(WDI_INDICATORS.INFLATION.id)}
          >
            <div className="metric-header-row">
              <span className="metric-title">{WDI_INDICATORS.INFLATION.name}</span>
              <span className="metric-country-tag">{activeCountryMeta.code}</span>
            </div>
            <div className="metric-value-row">
              {inflationItem?.status === 'loading' ? (
                <span className="metric-val loading">Loading…</span>
              ) : inflationItem?.data ? (
                <span className="metric-val font-mono">
                  {inflationItem.data.latestValue.toFixed(2)}%
                </span>
              ) : (
                <span className="metric-val text-muted">—</span>
              )}
            </div>
            <div className="metric-footer-row">
              <span className="metric-period">
                {inflationItem?.data ? `Reference: ${inflationItem.data.latestYear} (Annual)` : 'Year unavailable'}
              </span>
              <span className="metric-unit">Consumer Price Index</span>
            </div>
          </div>
        </div>

        {/* Selected Indicator Historical Bar Chart */}
        <div className="macro-panel-card macro-chart-panel">
          <div className="macro-indicator-detail-header">
            <div>
              <h4 className="card-heading">
                {activeCountryMeta.name}: {selectedMacroIndicator === WDI_INDICATORS.GDP_GROWTH.id ? WDI_INDICATORS.GDP_GROWTH.name : WDI_INDICATORS.INFLATION.name}
              </h4>
              <p className="macro-indicator-desc">
                {selectedMacroIndicator === WDI_INDICATORS.GDP_GROWTH.id
                  ? WDI_INDICATORS.GDP_GROWTH.description
                  : WDI_INDICATORS.INFLATION.description}
              </p>
            </div>
            <div className="macro-license-pill" title="Creative Commons Attribution 4.0">
              CC BY-4.0
            </div>
          </div>

          {isMacroLoading ? (
            <div className="macro-loading-status" role="status">
              Loading World Bank observations…
            </div>
          ) : macroError ? (
            <div className="portfolio-alert portfolio-alert-warning" role="alert">
              {macroError}
            </div>
          ) : activeMacroData?.observations ? (
            <MacroChart
              mode="BAR"
              data={activeMacroData.observations}
              unit="%"
              title={`${activeCountryMeta.name} ${activeMacroData.indicatorName}`}
            />
          ) : (
            <div className="macro-chart-prompt">
              <p>No qualified historical data available for this indicator.</p>
            </div>
          )}

          <div className="macro-license-footer">
            <span><strong>Source Attribution:</strong> World Bank, World Development Indicators (WDI). Licensed under Creative Commons Attribution 4.0 (CC BY-4.0).</span>
          </div>
        </div>
      </section>

      {/* SECTION 3: OFFICIAL REFERENCE LINKS & OFFLINE GUIDANCE */}
      <section className="macro-section macro-footer-section">
        <h4 className="footer-section-title">Official Verification &amp; Reference Sources</h4>
        <div className="macro-links-grid">
          <a
            href="https://www.cbo.gov.om/"
            target="_blank"
            rel="noopener noreferrer"
            className="macro-ext-link"
          >
            Central Bank of Oman (CBO) &nearr;
          </a>
          <a
            href="https://www.rbi.org.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="macro-ext-link"
          >
            Reserve Bank of India (RBI) &nearr;
          </a>
          <a
            href="https://data.worldbank.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="macro-ext-link"
          >
            World Bank Open Data &nearr;
          </a>
          <a
            href="https://frankfurter.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="macro-ext-link"
          >
            Frankfurter API Documentation &nearr;
          </a>
        </div>
      </section>
    </div>
  );
}
