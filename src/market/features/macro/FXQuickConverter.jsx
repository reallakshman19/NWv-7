/**
 * NWv7 Market Desk R2.1 - WP-06 FX Quick Converter Card
 * Embeddable overview widget for Market Overview (WP-01).
 *
 * NOTE: Strictly adheres to zero-boot network policy. Does NOT fetch on mount.
 */

import React, { useState, useMemo } from 'react';
import { useMacroStore } from './macroStore.js';
import { evaluateFxObservation, canConvertFxRate } from './fxFreshness.js';
import {
  SUPPORTED_CURRENCY_PAIRS,
  sanitizeCurrencyAmount,
  calculateConversion,
  formatCurrencyDisplay,
  formatRateBenchmark
} from './fxMath.js';

export function FXQuickConverter({ onOpenMacroDesk = null }) {
  const { state, actions } = useMacroStore();

  const [selectedPairId, setSelectedPairId] = useState('OMR/INR');
  const [fromCurrency, setFromCurrency] = useState('OMR');
  const [inputAmount, setInputAmount] = useState('100');

  const pairConfig = useMemo(() => {
    return SUPPORTED_CURRENCY_PAIRS.find(p => p.id === selectedPairId) || SUPPORTED_CURRENCY_PAIRS[0];
  }, [selectedPairId]);

  const toCurrency = fromCurrency === pairConfig.base ? pairConfig.quote : pairConfig.base;

  const currentRateItem = state.ratesByPair[selectedPairId];
  const rateData = currentRateItem?.value;
  const effectiveFreshness = evaluateFxObservation(rateData?.date);
  const conversionAllowed = canConvertFxRate(rateData);
  const isLoading = currentRateItem?.status === 'loading';
  const isError = currentRateItem?.status === 'error';

  const handlePairChange = (newPairId) => {
    setSelectedPairId(newPairId);
    const cfg = SUPPORTED_CURRENCY_PAIRS.find(p => p.id === newPairId) || SUPPORTED_CURRENCY_PAIRS[0];
    setFromCurrency(cfg.base);
  };

  const handleSwap = () => {
    setFromCurrency(toCurrency);
  };

  const handleFetchRate = () => {
    actions.fetchRate(pairConfig.base, pairConfig.quote, { force: true }).catch(() => {
      // The store exposes the source error; do not leak an unhandled rejection.
    });
  };

  // Perform unrounded conversion
  const conversionResult = useMemo(() => {
    if (!conversionAllowed) return null;
    const cleanAmount = sanitizeCurrencyAmount(inputAmount);
    if (cleanAmount === null) return null;

    return calculateConversion(cleanAmount, rateData.rate, fromCurrency, pairConfig.base);
  }, [rateData, conversionAllowed, inputAmount, fromCurrency, pairConfig.base]);

  return (
    <div className="fx-converter-card">
      <div className="fx-converter-header">
        <div className="fx-title-col">
          <h3 className="fx-converter-title">Currency Reference</h3>
          <span className="fx-converter-subtitle">Dated FX reference rates</span>
        </div>
        <div className="fx-pair-selector-wrap">
          {SUPPORTED_CURRENCY_PAIRS.map(pair => (
            <button
              key={pair.id}
              type="button"
              className={`portfolio-btn btn-xs ${selectedPairId === pair.id ? 'portfolio-btn-primary' : 'portfolio-btn-outline'}`}
              onClick={() => handlePairChange(pair.id)}
            >
              {pair.label}
            </button>
          ))}
        </div>
      </div>

      <div className="fx-converter-body">
        {/* Converter Inputs */}
        <div className="fx-converter-grid">
          <div className="fx-input-group">
            <label htmlFor="fx-quick-input" className="fx-field-label">
              Amount ({fromCurrency})
            </label>
            <div className="fx-input-wrapper">
              <span className="fx-currency-addon font-mono">{fromCurrency}</span>
              <input
                id="fx-quick-input"
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

        {/* Status / Rate Bar */}
        <div className="fx-rate-status-bar">
          {rateData ? (
            <div className="fx-rate-info">
              <span className="fx-benchmark-text font-mono">
                {formatRateBenchmark(rateData.rate, pairConfig.base, pairConfig.quote)}
              </span>
              <span className="fx-date-badge text-muted">
                (As of {rateData.date}) · {rateData.referenceProvider === 'ecb' ? 'ECB-derived cross' : 'Frankfurter blend'}
              </span>
              {effectiveFreshness?.freshness === 'DATED_WARNING' && (
                <span className="portfolio-badge badge-warning" title={effectiveFreshness?.warning}>
                  Dated Warning (36h+)
                </span>
              )}
              {effectiveFreshness?.freshness === 'EXPIRED' && (
                <span className="portfolio-badge badge-error" title={effectiveFreshness?.warning}>
                  Expired Rate (72h+)
                </span>
              )}
            </div>
          ) : isError ? (
            <div className="fx-rate-info">
              <span className="text-danger font-mono">{currentRateItem.error}</span>
            </div>
          ) : (
            <div className="fx-rate-info">
              <span className="text-muted">Select a pair to check its reference rate.</span>
            </div>
          )}

          <div className="fx-actions-row">
            <button
              type="button"
              className="portfolio-btn portfolio-btn-secondary btn-xs"
              onClick={handleFetchRate}
              disabled={isLoading}
            >
              {isLoading ? 'Checking…' : rateData ? 'Check Fresh Rate' : 'Check Reference Rate'}
            </button>
          </div>
        </div>

        <p className="fx-disclaimer-text">
          These reference rates are indicative. Providers set their own retail and remittance rates.
        </p>
      </div>

      <div className="fx-converter-footer">
        <button
          type="button"
          className="portfolio-btn portfolio-btn-outline"
          onClick={() => onOpenMacroDesk && onOpenMacroDesk('currency-macro')}
        >
          Open Currency &amp; Macro Desk →
        </button>
      </div>
    </div>
  );
}
