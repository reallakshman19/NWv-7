/**
 * NWv7 Market Desk R2.1 - WP-04 Portfolio Summary Card
 * Embeddable summary widget for Market Overview and mobile home cards.
 */

import React from 'react';
import { usePortfolioStore } from './portfolioStore.js';
import { replayPortfolio } from './portfolioAccounting.js';

export function PortfolioSummary({ onOpenPortfolio }) {
  const { state } = usePortfolioStore();
  const activePortfolio = state.portfolios.find(p => p.id === state.activePortfolioId) || state.portfolios[0];

  const replayed = replayPortfolio(
    activePortfolio?.transactions || [],
    activePortfolio?.manualPriceMarks || {}
  );

  const formatCurrency = (val) => {
    if (val === null || val === undefined) return 'Unavailable';
    return '₹' + Number(val).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <div className="portfolio-summary-card">
      <div className="portfolio-summary-header">
        <div className="portfolio-summary-title-wrap">
          <h3 className="portfolio-summary-title">Portfolio Desk</h3>
          <span className="portfolio-summary-subtitle">{activePortfolio?.name || 'Primary Portfolio'}</span>
        </div>
        <div className="portfolio-summary-badge-wrap">
          {replayed.hasInvalidLedger ? (
            <span className="portfolio-badge badge-error">Oversell Error</span>
          ) : replayed.valuationStatus === 'COMPLETE' ? (
            <span className="portfolio-badge badge-success">Valued</span>
          ) : replayed.valuationStatus === 'LIQUIDATED' ? (
            <span className="portfolio-badge badge-neutral">Liquidated</span>
          ) : (
            <span className="portfolio-badge badge-warning">Marks Missing</span>
          )}
        </div>
      </div>

      {replayed.hasInvalidLedger && (
        <div className="portfolio-summary-alert" role="alert">
          <span>Oversell detected in transaction ledger. Review transactions to restore accounting validity.</span>
        </div>
      )}

      <div className="portfolio-summary-metrics">
        <div className="portfolio-metric-col">
          <span className="portfolio-metric-label">Holdings</span>
          <span className="portfolio-metric-val">{replayed.activeHoldingsCount} Active</span>
        </div>

        <div className="portfolio-metric-col">
          <span className="portfolio-metric-label" title="Moving weighted-average remaining cost basis (analytical only)">
            Remaining Cost Basis
          </span>
          <span className="portfolio-metric-val">{formatCurrency(replayed.totalRemainingCostBasis)}</span>
        </div>

        <div className="portfolio-metric-col">
          <span className="portfolio-metric-label">Current Value</span>
          <span className={`portfolio-metric-val ${replayed.totalCurrentValue === null ? 'unavailable' : ''}`}>
            {formatCurrency(replayed.totalCurrentValue)}
          </span>
        </div>

        <div className="portfolio-metric-col">
          <span className="portfolio-metric-label">Realized P&L</span>
          <span className={`portfolio-metric-val ${replayed.totalRealizedPnL >= 0 ? 'profit' : 'loss'}`}>
            {replayed.totalRealizedPnL >= 0 ? '+' : ''}{formatCurrency(replayed.totalRealizedPnL)}
          </span>
        </div>
      </div>

      <div className="portfolio-summary-footer">
        <button
          type="button"
          className="portfolio-btn portfolio-btn-outline"
          onClick={() => onOpenPortfolio && onOpenPortfolio()}
        >
          Open Portfolio Desk &rarr;
        </button>
      </div>
    </div>
  );
}
