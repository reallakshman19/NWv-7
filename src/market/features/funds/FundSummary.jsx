/**
 * NWv7 Market Desk R2.1 - WP-05 Mutual Funds Summary Card
 * Embeddable overview widget for Market Overview (WP-01).
 *
 * NOTE: Strictly adheres to zero-boot network policy. Does NOT fetch on mount.
 */

import React, { useMemo } from 'react';
import { useFundStore } from './fundStore.js';
import { REAL_SERVER_SNAPSHOT } from '../overview/realServerSnapshot.js';

export function FundSummary({ onOpenFunds = null }) {
  const { state } = useFundStore();

  const savedCount = state.savedCodes.length;

  // Find top performer or first ready fund from in-memory / cached state
  const summaryDetails = useMemo(() => {
    if (savedCount === 0) return null;

    let bestFund = null;
    let checkedCount = 0;

    for (const code of state.savedCodes) {
      const navItem = state.navByCode[code]?.value || state.historyCache[code];
      if (navItem && navItem.latestNav || navItem?.nav) {
        checkedCount += 1;
        if (!bestFund) {
          bestFund = {
            code,
            name: navItem.schemeName || `Scheme ${code}`,
            nav: navItem.nav || navItem.latestNav,
            date: navItem.date || navItem.latestDate
          };
        }
      }
    }

    return { bestFund, checkedCount };
  }, [state.savedCodes, state.navByCode, state.historyCache, savedCount]);

  const topBenchmark = Array.isArray(REAL_SERVER_SNAPSHOT?.mutualFunds) && REAL_SERVER_SNAPSHOT.mutualFunds.length > 0
    ? REAL_SERVER_SNAPSHOT.mutualFunds[0]
    : null;

  return (
    <div className="fund-summary-card">
      <div className="fund-summary-header">
        <div className="fund-summary-title-wrap">
          <h3 className="fund-summary-title">Mutual Funds Desk</h3>
          <span className="fund-summary-subtitle">{savedCount} / 12 Tracked Schemes</span>
        </div>
        <div className="fund-summary-badge-wrap">
          {savedCount === 0 ? (
            <span className="portfolio-badge badge-neutral">No Funds</span>
          ) : summaryDetails?.checkedCount === savedCount ? (
            <span className="portfolio-badge badge-success">Cached / Ready</span>
          ) : (
            <span className="portfolio-badge badge-warning">On-Demand</span>
          )}
        </div>
      </div>

      <div className="fund-summary-content">
        {savedCount === 0 ? (
          <div>
            <p className="fund-summary-empty-text">
              Search and track up to 12 Indian mutual fund schemes with direct-source NAV analytics.
            </p>
            {topBenchmark && (
              <div style={{ marginTop: '8px', padding: '8px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Popular Benchmark:</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#34d399' }}>AMFI {topBenchmark.code}</span>
                </div>
                <div style={{ fontSize: '0.825rem', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {topBenchmark.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#38bdf8', marginTop: '2px' }}>
                  NAV: ₹{Number(topBenchmark.nav).toFixed(2)} {topBenchmark.date ? <span style={{ color: '#64748b' }}>({topBenchmark.date})</span> : ''}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="fund-summary-metrics">
            <div className="fund-summary-metric-col">
              <span className="fund-metric-label">Saved Schemes</span>
              <span className="fund-metric-val">{savedCount}</span>
            </div>
            {summaryDetails?.bestFund && (
              <div className="fund-summary-metric-col fund-featured">
                <span className="fund-metric-label">Featured Scheme</span>
                <span className="fund-featured-name" title={summaryDetails.bestFund.name}>
                  {summaryDetails.bestFund.name.slice(0, 28)}…
                </span>
                <span className="fund-featured-nav font-mono">
                  ₹{Number(summaryDetails.bestFund.nav).toFixed(2)} <small className="text-muted">({summaryDetails.bestFund.date})</small>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="fund-summary-footer">
        <button
          type="button"
          className="portfolio-btn portfolio-btn-outline"
          onClick={() => onOpenFunds && onOpenFunds()}
        >
          Open Funds Desk →
        </button>
      </div>
    </div>
  );
}
