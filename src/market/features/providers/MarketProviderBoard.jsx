import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BSE_GROUPS,
  getWidgetSymbols,
  getBseTradingViewUrl,
} from './bseCoverage.js';
import { canAttemptHeadlineEmbed, HEADLINE_INDEX_WIDGET_URL } from '../indices/headlineIndexResolution.js';
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
  providerSymbol = null,
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

  const activeGroup = providerSymbol ? 'equities' : BSE_GROUPS.includes(internalGroup) ? internalGroup : 'indices';
  const groupConfig = useMemo(() => {
    const config = getWidgetSymbols(activeGroup);
    if (providerSymbol) {
      return { ...config, symbols: config.symbols.filter(item => item.name === providerSymbol) };
    }
    return activeGroup === 'indices'
      ? { ...config, symbols:config.symbols.filter(item => canAttemptHeadlineEmbed(item.name)) }
      : config;
  }, [activeGroup, providerSymbol]);

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
    if (!userConsented || !hostRef.current || groupConfig.symbols.length === 0) {
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

    // Provider script executes only inside an opaque-origin sandboxed iframe.
    // In particular, NEVER append the TradingView script to the host document.
    const config = JSON.stringify({
      title: groupConfig.title,
      width: '100%',
      height: '100%',
      locale: 'en',
      showSymbolLogo: true,
      symbolsGroups: [{ name: groupConfig.title, symbols: groupConfig.symbols }],
      colorTheme: 'dark',
    }).replace(/</g, '\\u003c');
    const frameHtml =
      '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#0f172a;">' +
      '<div class="tradingview-widget-container" style="height:100vh;width:100%">' +
      '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>' +
      '<script src="' + HEADLINE_INDEX_WIDGET_URL + '" type="text/javascript">' +
      config + '</script></div></body></html>';
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-popups');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('title', groupConfig.title + ' — provider-controlled reference display');
    frame.setAttribute('srcdoc', frameHtml);
    frame.style.height = '100%';
    frame.style.width = '100%';
    frame.style.border = '0';

    frame.onload = () => {
      if (currentAttempt !== attemptId.current) return;
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      // Iframe load does not prove the third-party chart rendered.
      setLifecycleState('EMBED_UNCONFIRMED');
    };
    frame.onerror = () => {
      if (currentAttempt !== attemptId.current) return;
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      setLifecycleState('SCRIPT_ERROR');
    };
    container.appendChild(frame);

    return () => {
      frame.onload = null;
      frame.onerror = null;
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      container.replaceChildren();
      attemptId.current += 1;
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

  const loadLabel = providerSymbol ? `Load ${providerSymbol} price` : `Load ${groupConfig.title} prices`;
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
            Provider-hosted closing prices, not live NSE quotes. Check the date shown by TradingView.
          </p>
        </div>

        <div className="market-provider-board__controls">
          {!providerSymbol && <button
            type="button"
            className="market-provider-board__btn market-provider-board__switch-btn"
            onClick={() => handleGroupToggle(otherGroup)}
            aria-label={`Switch to ${otherGroupLabel}`}
          >
            Switch to {otherGroupLabel}
          </button>}
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
            and shares your IP address with the provider. The iframe uses a no-referrer policy.
          </p>
          <div className="market-provider-board__consent-actions">
            <button
              type="button"
              disabled={groupConfig.symbols.length === 0}
              className="market-provider-board__load-btn"
              onClick={handleConsent}
            >
              {loadLabel}
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
        {groupConfig.symbols.length === 0 && userConsented && (
          <p role="alert">No approved instruments are available for this provider display.</p>
        )}
        {lifecycleState === 'LOADING_SCRIPT' && (
          <p className="market-provider-board__status" role="status">
            Connecting to TradingView embed service…
          </p>
        )}

        {lifecycleState === 'EMBED_UNCONFIRMED' && (
          <div className="market-provider-board__recovery">
            <p className="market-provider-board__status market-provider-board__status--loaded" role="status">
              Provider frame loaded; quote rendering is unverified. If prices are blank, retry or open a provider link below.
            </p>
            <button type="button" className="market-provider-board__btn" onClick={handleRetry}>Reload provider display</button>
          </div>
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
          style={{ height: providerSymbol ? '260px' : '380px', minHeight: providerSymbol ? '260px' : '380px', width: '100%' }}
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
