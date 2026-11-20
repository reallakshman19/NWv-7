import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BSE_GROUPS,
  getWidgetSymbols,
  getBseTradingViewUrl,
} from './bseCoverage.js';
import './providers.css';

const TIMEOUT_MS = 8000;

/**
 * MarketProviderBoard (WP-02)
 *
 * Implements the opt-in BSE end-of-day TradingView embed board.
 * Adheres strictly to the lifecycle state machine:
 * IDLE -> LOADING_SCRIPT -> (EMBED_UNCONFIRMED | SCRIPT_ERROR | TIMEOUT) -> CLEANUP
 *
 * Guaranteed invariants:
 * 1. Zero third-party network calls before explicit user click.
 * 2. Complete DOM cleanup with no orphaned scripts or duplicate containers.
 * 3. Never reports third-party embed as verified native quote data.
 */
export function MarketProviderBoard({
  group = 'indices',
  compact = false,
  onGroupChange,
  onNavigate,
  className = '',
}) {
  const [internalGroup, setInternalGroup] = useState(
    BSE_GROUPS.includes(group) ? group : 'indices'
  );
  const [prevGroupProp, setPrevGroupProp] = useState(group);

  // Mandatory user consent gate: defaults to false (P0-01: no programmatic bypass)
  const [userConsented, setUserConsented] = useState(false);
  const [lifecycleState, setLifecycleState] = useState('IDLE'); // 'IDLE' | 'LOADING_SCRIPT' | 'EMBED_UNCONFIRMED' | 'SCRIPT_ERROR' | 'TIMEOUT'
  const [retryCount, setRetryCount] = useState(0);

  // Synchronously adjust internal group when prop changes during render
  if (prevGroupProp !== group) {
    setPrevGroupProp(group);
    if (BSE_GROUPS.includes(group)) {
      setInternalGroup(group);
      if (userConsented) {
        setLifecycleState('LOADING_SCRIPT');
      }
    }
  }

  const activeGroup = BSE_GROUPS.includes(internalGroup) ? internalGroup : 'indices';
  const groupConfig = useMemo(() => getWidgetSymbols(activeGroup), [activeGroup]);

  const hostRef = useRef(null);
  const attemptId = useRef(0);
  const timeoutTimerRef = useRef(null);

  // Group change handler
  const handleGroupToggle = (targetGroup) => {
    setInternalGroup(targetGroup);
    if (userConsented) {
      setLifecycleState('LOADING_SCRIPT');
    }
    if (typeof onGroupChange === 'function') {
      onGroupChange(targetGroup);
    }
  };

  // Lifecycle management effect
  useEffect(() => {
    if (!userConsented || !hostRef.current) {
      return undefined;
    }

    const currentAttempt = ++attemptId.current;
    const container = hostRef.current;

    // Purge any preexisting DOM elements in the container
    container.replaceChildren();

    // Setup 8s initialization timeout (WP02-T04)
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
    }
    timeoutTimerRef.current = setTimeout(() => {
      if (currentAttempt === attemptId.current) {
        setLifecycleState('TIMEOUT');
      }
    }, TIMEOUT_MS);

    // 1. Create widget placeholder
    const placeholder = document.createElement('div');
    placeholder.className = 'tradingview-widget-container__widget';
    placeholder.style.height = '100%';
    placeholder.style.width = '100%';
    container.appendChild(placeholder);

    // 2. Create single TradingView embed script
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js';
    script.async = true;
    script.type = 'text/javascript';
    script.textContent = JSON.stringify({
      title: groupConfig.title,
      width: '100%',
      height: '100%',
      locale: 'en',
      showSymbolLogo: true,
      symbolsGroups: [
        {
          name: groupConfig.title,
          symbols: groupConfig.symbols,
        },
      ],
      colorTheme: 'dark',
    });

    script.onload = () => {
      if (currentAttempt !== attemptId.current) return;
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      // P0-03: Transition to EMBED_UNCONFIRMED; do not claim verified quote visibility
      setLifecycleState('EMBED_UNCONFIRMED');
    };

    script.onerror = () => {
      if (currentAttempt !== attemptId.current) return;
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      setLifecycleState('SCRIPT_ERROR');
    };

    container.appendChild(script);

    // Cleanup on unmount, toggle, or group switch (WP02-T06)
    return () => {
      script.onload = null;
      script.onerror = null;
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      container.replaceChildren();
    };
  }, [userConsented, groupConfig, retryCount]);

  const handleConsent = () => {
    setUserConsented(true);
    setLifecycleState('LOADING_SCRIPT');
  };

  const handleHide = () => {
    setUserConsented(false);
    setLifecycleState('IDLE');
    if (hostRef.current) {
      hostRef.current.replaceChildren();
    }
  };

  const handleRetry = () => {
    setLifecycleState('LOADING_SCRIPT');
    setRetryCount(c => c + 1);
  };

  const otherGroup = activeGroup === 'indices' ? 'equities' : 'indices';
  const otherGroupLabel = activeGroup === 'indices' ? 'BSE Equities' : 'BSE Indices';

  return (
    <div
      className={`market-provider-board ${compact ? 'market-provider-board--compact' : ''} ${className}`.trim()}
      aria-label={`${groupConfig.title} from TradingView`}
    >
      <div className="market-provider-board__header">
        <div className="market-provider-board__branding">
          <h3 className="market-provider-board__title">
            BSE end-of-day reference — TradingView
          </h3>
          <p className="market-provider-board__subtitle">
            Provider renders its own numbers inside a third-party iframe; no quote extraction or app storage.
          </p>
        </div>

        <div className="market-provider-board__controls">
          <button
            type="button"
            className="market-provider-board__btn market-provider-board__switch-btn"
            onClick={() => handleGroupToggle(otherGroup)}
            aria-label={`Switch to ${otherGroupLabel}`}
          >
            Switch to {otherGroupLabel}
          </button>
          {userConsented && (
            <button
              type="button"
              className="market-provider-board__btn market-provider-board__hide-btn"
              onClick={handleHide}
            >
              Hide TradingView Board
            </button>
          )}
        </div>
      </div>

      {/* IDLE / CONSENT REQUIRED STATE (WP02-T01) */}
      {!userConsented && (
        <div className="market-provider-board__consent-box" role="region" aria-label="Provider consent">
          <p className="market-provider-board__disclosure">
            <strong>Privacy Notice:</strong> Loading this optional display connects directly to TradingView CDN
            and shares your IP address and the current page URL with the provider.
          </p>
          <div className="market-provider-board__consent-actions">
            <button
              type="button"
              className="market-provider-board__load-btn"
              onClick={handleConsent}
            >
              Load {groupConfig.title} prices
            </button>
            {typeof onNavigate === 'function' && (
              <button
                type="button"
                className="market-provider-board__btn"
                onClick={() => onNavigate('indices')}
              >
                Open Indices Workspace
              </button>
            )}
          </div>
        </div>
      )}

      {/* ACTIVE EMBED & LIFECYCLE FEEDBACK CONTAINER */}
      <div
        className={`market-provider-board__body ${!userConsented ? 'is-hidden' : ''}`.trim()}
      >
        {/* Status notices */}
        {lifecycleState === 'LOADING_SCRIPT' && (
          <p className="market-provider-board__status" role="status">
            Connecting to TradingView embed service…
          </p>
        )}

        {lifecycleState === 'EMBED_UNCONFIRMED' && (
          <p className="market-provider-board__status market-provider-board__status--loaded" role="status">
            BSE end-of-day display loaded. Provider owns quote clocks and updates.
          </p>
        )}

        {lifecycleState === 'SCRIPT_ERROR' && (
          <div className="market-provider-board__error-alert" role="alert">
            <p>The TradingView display could not load (network error or blocked script).</p>
            <button
              type="button"
              className="market-provider-board__retry-btn"
              onClick={handleRetry}
            >
              Retry connection
            </button>
          </div>
        )}

        {lifecycleState === 'TIMEOUT' && (
          <div className="market-provider-board__error-alert" role="alert">
            <p>Could not confirm provider loading (timed out after 8s). Open official sources below.</p>
            <button
              type="button"
              className="market-provider-board__retry-btn"
              onClick={handleRetry}
            >
              Retry connection
            </button>
          </div>
        )}

        {/* TradingView Widget Host Container */}
        <div
          ref={hostRef}
          className="tradingview-widget-container"
          style={{ height: '380px', width: '100%' }}
        />

        {/* Required Provider Attribution (WP02-T10) */}
        <div className="tradingview-widget-copyright">
          <a
            href="https://www.tradingview.com/markets/"
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            Market summary
          </a>{' '}
          by TradingView
        </div>
      </div>

      {/* Curated Fallback Links from Catalog (WP02-T09) */}
      <div className="market-provider-board__catalog-links">
        <p className="market-provider-board__links-caption">
          If prices do not render, open verified provider pages directly:
        </p>
        <ul className="market-provider-board__links-list">
          {groupConfig.symbols.map((symbol) => (
            <li key={symbol.name}>
              <a
                href={getBseTradingViewUrl(symbol.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="market-provider-board__link"
              >
                {symbol.displayName} on TradingView ↗
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default MarketProviderBoard;
