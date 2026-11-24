import React, { useEffect, useRef, useState } from 'react';

/**
 * Official TradingView hosted Market Overview widget for Indian indices.
 * The widget owns its figures, source timing and attribution. This component
 * never reads its iframe, copies prices or writes a public price snapshot.
 *
 * Proven symbol IDs: TradingView's NSE:NIFTY and NSE:BANKNIFTY index
 * documentation, and TradingView's own index-widget example for BSE symbols.
 */
const WIDGET_SCRIPT = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js';
const WIDGET_SYMBOLS = Object.freeze([
  { s: 'NSE:NIFTY', d: 'NIFTY 50' },
  { s: 'BSE:SENSEX', d: 'SENSEX' },
  { s: 'NSE:BANKNIFTY', d: 'NIFTY Bank' },
  { s: 'BSE:BSE500', d: 'BSE 500' },
]);

const SOURCE_LINKS = Object.freeze([
  { name: 'NIFTY 50', href: 'https://www.nseindia.in/market-data/live-market-indices' },
  { name: 'SENSEX', href: 'https://www.bseindices.com/indices-details/code/16' },
  { name: 'NIFTY Bank', href: 'https://www.nseindia.in/market-data/live-market-indices' },
  { name: 'BSE 500', href: 'https://www.bseindices.com/indices-details/code/17/' },
]);

function makeWidgetConfig() {
  return {
    title: 'India indices',
    tabs: [{ title: 'India', symbols: WIDGET_SYMBOLS.map(({ s, d }) => ({ s, d })) }],
    width: '100%',
    height: '100%',
    showChart: false,
    showFloatingTooltip: false,
    showSymbolLogo: false,
    locale: 'en',
    colorTheme: 'dark',
    isTransparent: true,
  };
}

/** A failed or blocked widget must leave fully usable original source links. */
export function MarketIndexProviderBoard() {
  const hostRef = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [providerState, setProviderState] = useState('connecting');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = WIDGET_SCRIPT;
    script.textContent = JSON.stringify(makeWidgetConfig());
    script.onload = () => setProviderState('script-loaded');
    script.onerror = () => setProviderState('blocked');
    host.replaceChildren(widget, script);
    return () => {
      script.onload = null;
      script.onerror = null;
      host.replaceChildren();
    };
  }, [attempt]);

  const refresh = () => {
    setProviderState('connecting');
    setAttempt(value => value + 1);
  };
  return (
    <div className="md3-index-hosted" data-market-index-board="provider">
      <div className="md3-index-hosted__head">
        <div>
          <strong>India index board</strong>
          <small>TradingView hosted quotes · provider-defined delay</small>
        </div>
        <button type="button" className="md3-index-reload" onClick={refresh}
          aria-label="Reload index provider board">↻ <span>Reload</span></button>
      </div>
      <div className="md3-index-hosted__frame tradingview-widget-container" ref={hostRef}
        aria-label="TradingView India indices hosted board"/>
      <div className="md3-index-hosted__status" role="status">
        {providerState === 'connecting'
          ? 'Connecting to the provider…'
          : providerState === 'blocked'
            ? 'Provider embed blocked. Use the original source links below.'
            : 'Provider widget loaded. Check its displayed values and trading dates.'}
      </div>
      <div className="md3-index-hosted__sources" aria-label="Original index sources">
        {SOURCE_LINKS.map(link => (
          <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer">
            {link.name}<span aria-hidden="true"> ↗</span>
          </a>
        ))}
      </div>
      <p className="md3-index-hosted__disclaimer">
        The provider controls the displayed prices and delay. NWv-7 does not copy,
        cache or represent them as real-time exchange quotes.
      </p>
      <a className="md3-index-hosted__credit"
        href="https://www.tradingview.com/markets/indices/"
        target="_blank" rel="noopener nofollow noreferrer">Market data widget by TradingView</a>
    </div>
  );
}

export default MarketIndexProviderBoard;
