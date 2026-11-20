import React, { useEffect, useMemo, useRef, useState } from 'react';

// TradingView's free-widget coverage lists BSE quotes as end-of-day. These are
// explicit BSE instruments, not guesses based on a user's NSE watchlist.
const GROUPS = {
  indices: {
    title: 'BSE indices',
    symbols: [
      { name: 'BSE:SENSEX', displayName: 'S&P BSE Sensex' },
      { name: 'BSE:BSE500', displayName: 'S&P BSE 500' },
    ],
  },
  equities: {
    title: 'BSE equities',
    symbols: [
      { name: 'BSE:RELIANCE', displayName: 'Reliance Industries' },
      { name: 'BSE:TCS', displayName: 'Tata Consultancy Services' },
      { name: 'BSE:INFY', displayName: 'Infosys' },
    ],
  },
};

/** Optional third-party display; no market data is imported into app state. */
export default function BseMarketWidget({ kind = 'indices' }) {
  const group = GROUPS[kind] || GROUPS.indices;
  const [enabled, setEnabled] = useState(false);
  const [failedAttempt, setFailedAttempt] = useState(null);
  const attempt = useMemo(() => ({ enabled, group }), [enabled, group]);
  const host = useRef(null);

  useEffect(() => {
    if (!enabled || !host.current) return undefined;
    const container = host.current;
    const placeholder = document.createElement('div');
    placeholder.className = 'tradingview-widget-container__widget';
    placeholder.style.height = '100%';
    container.appendChild(placeholder);
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js';
    script.async = true;
    script.type = 'text/javascript';
    script.textContent = JSON.stringify({
      title: group.title,
      width: '100%',
      height: '100%',
      locale: 'en',
      showSymbolLogo: true,
      symbolsGroups: [{ name: group.title, symbols: group.symbols }],
      colorTheme: 'dark',
    });
    script.onerror = () => setFailedAttempt(attempt);
    container.appendChild(script);
    return () => {
      script.onerror = null;
      // The provider replaces its placeholder with an iframe. Remove it too
      // when the user hides the display or changes workspace.
      container.replaceChildren();
    };
  }, [enabled, group, attempt]);

  return <section aria-label={`${group.title} from TradingView`}>
    <p>BSE end-of-day reference data from TradingView; not live NSE quotes. Check the date shown by the provider.</p>
    <p>Loading this optional display connects to TradingView and shares your IP address and the page address with it.</p>
    <button type="button" onClick={() => setEnabled(value => !value)}>
      {enabled ? 'Hide TradingView prices' : `Load ${group.title} prices`}
    </button>
    {enabled && <>
      {failedAttempt === attempt && <p role="status">The TradingView display could not load. Open a source below instead.</p>}
      <div className="tradingview-widget-container" ref={host} style={{ height: '360px', width: '100%' }} />
      <div className="tradingview-widget-copyright">
        <a href="https://www.tradingview.com/markets/" target="_blank" rel="noopener noreferrer nofollow">Market summary</a> by TradingView
      </div>
    </>}
    <p>If prices do not appear, open the provider pages:</p>
    <ul>
      {group.symbols.map(symbol => <li key={symbol.name}>
        <a href={`https://www.tradingview.com/symbols/${symbol.name.replace(':', '-')}/`} target="_blank" rel="noopener noreferrer">{symbol.displayName} on TradingView ↗</a>
      </li>)}
    </ul>
  </section>;
}
