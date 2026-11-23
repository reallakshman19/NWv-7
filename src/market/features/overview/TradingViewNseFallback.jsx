import React, { useEffect, useRef, useState } from 'react';

/**
 * Independent third-party visual fallback. Quotes stay inside TradingView's
 * branded widget; NWv-7 never reads, caches, republishes or combines them with
 * NSE MCP numbers. TradingView labels free NSE data as delayed ~15 minutes.
 */
export function TradingViewNseFallback({ symbol }) {
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const hostRef = useRef(null);
  const approvedSymbol = /^[A-Z0-9]{1,20}$/.test(symbol || '') ? symbol : null;
  const providerUrl = approvedSymbol
    ? 'https://www.tradingview.com/symbols/NSE-' + approvedSymbol + '/'
    : 'https://www.tradingview.com/markets/stocks-india/';

  useEffect(() => {
    const host = hostRef.current;
    if (!enabled || !approvedSymbol || !host) return undefined;
    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    host.replaceChildren(widget);
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js';
    script.textContent = JSON.stringify({
      symbol: 'NSE:' + approvedSymbol,
      width: '100%',
      locale: 'en',
      colorTheme: 'dark',
      isTransparent: true,
    });
    script.onerror = () => setFailed(true);
    host.appendChild(script);
    return () => {
      script.onerror = null;
      host.replaceChildren();
    };
  }, [enabled, approvedSymbol]);

  return (
    <section className="md3-nse-tv-fallback" aria-label="TradingView NSE delayed provider fallback">
      <div className="md3-nse-fallback-head">
        <strong>Fallback 2 · TradingView NSE</strong>
        <span>Provider-hosted · NSE delayed about 15 min</span>
      </div>
      <p className="md3-compact-caption">
        This independent widget is supplied by TradingView. No widget price is
        extracted or stored by NWv-7. Loading it connects to TradingView.
      </p>
      {!enabled ? (
        <button type="button" className="md3-secondary"
          disabled={!approvedSymbol} onClick={() => { setFailed(false); setEnabled(true); }}>
          Open delayed provider widget
        </button>
      ) : (
        <>
          <button type="button" className="md3-secondary" onClick={() => setEnabled(false)}>
            Hide provider widget
          </button>
          <div ref={hostRef} className="md3-nse-tv-host tradingview-widget-container"
            aria-label={'TradingView view for NSE:' + approvedSymbol} />
          {failed && <p role="alert" className="md3-quote-error">
            Provider widget did not load. Open TradingView directly.
          </p>}
        </>
      )}
      <a className="md3-provider-link" href={providerUrl}
        target="_blank" rel="noopener noreferrer">
        Open {approvedSymbol || 'NSE market'} on TradingView
      </a>
    </section>
  );
}

export default TradingViewNseFallback;
