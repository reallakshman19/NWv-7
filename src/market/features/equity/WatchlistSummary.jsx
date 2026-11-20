/**
 * WatchlistSummary component (WP-03).
 * Compact overview widget designed to occupy the WP-01 'watchlist' slot.
 * Subscribes to the shared watchlistStore for instant same-tab synchronization.
 */
import React from 'react';
import { useWatchlist, defaultWatchlistStore } from './watchlistStore.js';
import { fromCanonicalKey } from './equityModel.js';
import { getNseQuoteUrl } from './equityMetadata.js';
import './equity.css';


export function WatchlistSummary({
  compact = false,
  onNavigate,
  store = defaultWatchlistStore,
  className = '',
}) {
  const { keys, isPersistent, removeKey, maxLimit } = useWatchlist(store);

  const handleManage = () => {
    if (typeof onNavigate === 'function') {
      onNavigate('equity');
    }
  };

  return (
    <section
      className={`market-watchlist-summary ${compact ? 'market-watchlist-summary--compact' : ''} ${className}`.trim()}
      aria-label="My Watchlist Summary"
    >
      <div className="market-watchlist-summary__header">
        <div className="market-watchlist-summary__title-row">
          <h3 className="market-watchlist-summary__title">My Watchlist</h3>
          <span className="market-watchlist-summary__count-badge" aria-label={`${keys.length} of ${maxLimit} saved`}>
            Saved: {keys.length}/{maxLimit}
          </span>
        </div>

        {!isPersistent && (
          <p className="market-watchlist-summary__session-warning" role="status">
            Session only (storage denied)
          </p>
        )}
      </div>

      {keys.length === 0 ? (
        <div className="market-watchlist-summary__empty">
          <p>Your watchlist is empty.</p>
          <p className="market-watchlist-summary__empty-hint">
            Track up to {maxLimit} shares with official exchange quote shortcuts.
          </p>
          <button
            type="button"
            className="market-equity-btn market-equity-btn--primary"
            onClick={handleManage}
          >
            Explore 16 Tracked Shares
          </button>
        </div>
      ) : (
        <ul className="market-watchlist-summary__list" aria-label="Saved Watchlist Items">
          {keys.map((key) => {
            const symbol = fromCanonicalKey(key) || key;
            const quoteUrl = getNseQuoteUrl(symbol);

            return (
              <li key={key} className="market-watchlist-summary__item">
                <div className="market-watchlist-summary__item-info">
                  <span className="market-watchlist-summary__symbol">{symbol}</span>
                  <span className="market-watchlist-summary__exchange">NSE</span>
                </div>

                <div className="market-watchlist-summary__item-price font-mono" style={{ margin: '0 8px', textAlign: 'right' }}>
                  <span style={{ color: '#94a3b8' }}>Quote unavailable</span>
                </div>

                <div className="market-watchlist-summary__item-actions">
                  {quoteUrl ? (
                    <a
                      href={quoteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="market-watchlist-summary__quote-link"
                      aria-label={`Official NSE quote for ${symbol} (opens in new tab)`}
                    >
                      NSE Quote <span aria-hidden="true">↗</span>
                    </a>
                  ) : null}

                  <button
                    type="button"
                    className="market-watchlist-summary__remove-btn"
                    onClick={() => removeKey(key)}
                    aria-label={`Remove ${symbol} from watchlist`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="market-watchlist-summary__footer">
        <button
          type="button"
          className="market-watchlist-summary__manage-btn"
          onClick={handleManage}
        >
          Manage Watchlist & Research ↗
        </button>
      </div>
    </section>
  );
}
