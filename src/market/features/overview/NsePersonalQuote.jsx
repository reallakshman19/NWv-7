import React, { useState } from 'react';
import { TradingViewNseFallback } from './TradingViewNseFallback.jsx';

const SYMBOLS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN',
  'ITC', 'BHARTIARTL', 'KOTAKBANK', 'LT', 'HINDUNILVR',
  'AXISBANK', 'BAJFINANCE', 'MARUTI', 'WIPRO', 'SUNPHARMA',
];

const fmtValue = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const fmtDate = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
});
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function endpointOf(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return new URL('/quote', url.origin).toString();
  } catch {
    return null;
  }
}

/** Only render qualified, explicitly identified source modes. */
export function validateNseReply(data, symbol) {
  const quote = data?.quote;
  if (!quote || quote.symbol !== symbol || !Number.isFinite(quote.value) || quote.value <= 0) return null;
  if (quote.sourceTier === 'NSE_EOD_FALLBACK' && quote.priceType === 'END_OF_DAY_CLOSE') {
    if (typeof quote.priceDate !== 'string' || !DATE_ONLY.test(quote.priceDate) ||
        !Number.isFinite(Date.parse(quote.priceDate + 'T00:00:00Z')) ||
        new Date(quote.priceDate + 'T00:00:00Z').toISOString().slice(0, 10) !== quote.priceDate) return null;
    return quote;
  }
  if (quote.sourceTier === 'NSE_CM_PRIMARY' && quote.priceType === 'INTRADAY_OBSERVATION') {
    if (typeof quote.quoteAt !== 'string' || !Number.isFinite(Date.parse(quote.quoteAt))) return null;
    return quote;
  }
  return null;
}

export function NsePersonalQuote() {
  const [symbol, setSymbol] = useState('RELIANCE');
  const [token, setToken] = useState('');
  const [state, setState] = useState({ loading: false, quote: null, error: '' });
  const endpoint = endpointOf(import.meta.env?.VITE_NSE_PERSONAL_GATEWAY_URL || '');

  const check = async () => {
    if (!endpoint || !token.trim() || state.loading) return;
    setState({ loading: true, quote: null, error: '' });
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token.trim(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ symbol }),
        credentials: 'omit',
        cache: 'no-store',
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Private access denied. Check your owner token and the configured site origin.');
        }
        throw new Error('Both official NSE MCP sources were unavailable or returned unqualified data.');
      }
      const data = await response.json();
      const quote = validateNseReply(data, symbol);
      if (!quote) throw new Error('NSE returned an invalid or mismatched source observation.');
      setState({ loading: false, quote, error: '' });
    } catch (err) {
      setState({ loading: false, quote: null, error: err?.message || 'NSE lookup failed.' });
    }
  };

  const isEod = state.quote?.sourceTier === 'NSE_EOD_FALLBACK';
  const nseStockUrl = 'https://www.nseindia.in/get-quotes/equity?symbol=' + encodeURIComponent(symbol);
  return (
    <section className="md3-nse-personal" aria-label="NSE personal market quote">
      <p className="md3-compact-caption">
        Primary: NSE CM delayed equity observation · Fallback 1: official NSE Bhavcopy closing price
      </p>
      {endpoint ? (
        <>
          <div className="md3-nse-form">
            <label>NSE stock
              <select value={symbol} disabled={state.loading} onChange={event => {
                setSymbol(event.target.value);
                setState({ loading: false, quote: null, error: '' });
              }}>
                {SYMBOLS.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>Owner access token
              <input type="password" value={token} disabled={state.loading}
                onChange={event => setToken(event.target.value)}
                autoComplete="off" placeholder="Private token (not saved)" />
            </label>
            <button type="button" className="md3-primary" onClick={check}
              disabled={state.loading || !token.trim()}>
              {state.loading ? 'Checking NSE sources…' : 'Check official NSE sources'}
            </button>
          </div>
          {state.error && <p className="md3-quote-error" role="alert">{state.error}</p>}
          {state.quote && (
            <div className="md3-nse-result" role="status">
              <strong>{state.quote.symbol} · ₹{fmtValue.format(state.quote.value)}</strong>
              <span>{Number.isFinite(state.quote.changePercent)
                ? (state.quote.changePercent > 0 ? '+' : '') + state.quote.changePercent.toFixed(2) + '%'
                : 'Change unavailable'}</span>
              <small className="md3-nse-tier">
                {isEod ? 'Fallback 1 · NSE official end-of-day close' : 'Primary · NSE CM market observation'}
              </small>
              {isEod ? (
                <small>Trading date: {state.quote.priceDate} · NOT LIVE</small>
              ) : (
                <>
                  <small>Observed: {fmtDate.format(new Date(state.quote.quoteAt))} IST</small>
                  <small>{state.quote.freshness === 'RECENT_PROVIDER_OBSERVATION'
                    ? 'Recent NSE observation (delayed, not tick-live)'
                    : 'Historical NSE observation — not a current price'}</small>
                </>
              )}
              <small>{isEod ? 'NSE Bhavcopy MCP' : 'NSE CM Market Live MCP'} · Original source date retained</small>
            </div>
          )}
        </>
      ) : (
        <p className="md3-muted">
          Owner-only NSE gateway is not configured. Fallback 2 (TradingView) and original source links remain accessible.
        </p>
      )}
      <TradingViewNseFallback key={symbol} symbol={symbol} />
      <div className="md3-card-bottom">
        <a className="md3-provider-link" href={nseStockUrl}
          target="_blank" rel="noopener noreferrer">Open {symbol} on official NSE</a>
        <a className="md3-provider-link" href="https://www.nseindia.in/market-data/live-equity-market"
          target="_blank" rel="noopener noreferrer">View NSE equity market at source</a>
      </div>
    </section>
  );
}

export default NsePersonalQuote;
