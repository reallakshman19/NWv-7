import React from 'react';
import { getMarketSessionState } from '../../../utils/marketSession.js';

/**
 * MarketSessionHeader
 *
 * Header component presenting the India session timetable (Asia/Kolkata),
 * free-mode publication disclaimer, and quick link to Data Health.
 * Reuses getMarketSessionState without falsely asserting real-time exchange validation.
 */
export function MarketSessionHeader({
  sessionState: sessionStateProp,
  sourceMode = 'free-open-only',
  onNavigate,
  onRefresh,
  refreshing = false,
  tradingHolidays = [],
  className = '',
}) {
  const session = sessionStateProp || getMarketSessionState({
    now: new Date(),
    quoteAt: null,
    tradingHolidays,
  });

  const getToneClass = (tone) => {
    switch (tone) {
      case 'success':
        return 'session-tone--success';
      case 'warning':
        return 'session-tone--warning';
      case 'muted':
      default:
        return 'session-tone--muted';
    }
  };

  return (
    <header className={`market-session-header ${className}`.trim()} aria-label="Market desk header">
      <div className="market-session-header__primary">
        <div className="market-session-header__branding">
          <h1 className="market-session-header__title">India Market Desk</h1>
          <p className="market-session-header__subtitle">
            Free data tools · EOD provider views · Local portfolio · Original data dates
          </p>
        </div>

        <div className="market-session-header__actions">
          {typeof onRefresh === 'function' && (
            <button
              type="button"
              className="market-session-header__btn market-session-header__refresh-btn"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Check available sources"
            >
              {refreshing ? 'Checking…' : 'Refresh tools'}
            </button>
          )}

          {typeof onNavigate === 'function' && (
            <button
              type="button"
              className="market-session-header__btn market-session-header__health-btn"
              onClick={() => onNavigate('health')}
              aria-label="View data health and source availability"
            >
              <span aria-hidden="true">📡 </span>Data Health
            </button>
          )}
        </div>
      </div>

      <div className="market-session-header__meta" role="status">
        <div className="market-session-header__status-badge">
          <span className="market-session-header__meta-label">Session:</span>
          <span className={`market-session-header__badge ${getToneClass(session?.tone)}`}>
            {session?.label || 'Indicative timetable'}
          </span>
          <span className="market-session-header__meta-note">
            (Indicative IST hours 09:15–15:30; holidays unverified)
          </span>
        </div>

        <div className="market-session-header__mode-badge">
          <span className="market-session-header__meta-label">Mode:</span>
          <span className="market-session-header__mode-text">
            {sourceMode === 'free-open-only'
              ? 'Free/open mode — no redistributed quotes'
              : 'Direct user requests only'}
          </span>
        </div>
      </div>
    </header>
  );
}

export default MarketSessionHeader;
