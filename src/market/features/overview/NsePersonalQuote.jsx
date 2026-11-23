import React, { useState } from 'react';

const SYMBOLS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN',
  'ITC', 'BHARTIARTL', 'KOTAKBANK', 'LT', 'HINDUNILVR',
  'AXISBANK', 'BAJFINANCE', 'MARUTI', 'WIPRO', 'SUNPHARMA',
];

const GATEWAY = import.meta.env?.VITE_NSE_PERSONAL_GATEWAY_URL || '';
const fmtValue = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const fmtDate = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
});

function endpointOf(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return new URL('/quote', url.origin).toString();
  } catch {
    return null;
  }
}

export function NsePersonalQuote() {
  const [symbol, setSymbol] = useState('RELIANCE');
  const [token, setToken] = useState('');
  const [state, setState] = useState({ loading: false, quote: null, error: '' });
  const endpoint = endpointOf(GATEWAY);
  const check = async () => {
    if (!endpoint || !token.trim()) return;
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
        if (response.status === 401 || response.status === 403) throw new Error('Private access denied. Check your owner token and the configured site origin.');
        throw new Error('NSE source unavailable or quote not qualified; try again later.');
      }
      const data = await response.json();
      if (data?.quote?.symbol !== symbol ||
          !Number.isFinite(data.quote.value) || data.quote.value <= 0 ||
          !Number.isFinite(Date.parse(data.quote.quoteAt))) {
        throw new Error('NSE returned an invalid or mismatched quote.');
      }
      setState({ loading: false, quote: data.quote, error: '' });
    } catch (err) {
      setState({ loading: false, quote: null, error: err?.message || 'NSE lookup failed.' });
    }
  };
  return (
    <section className="md3-nse-personal" aria-label="NSE personal market quote">
      <p className="md3-compact-caption">
        Official NSE CM Market MCP · delayed near-live equities · private owner access
      </p>
      {endpoint ? (
        <>
          <div className="md3-nse-form">
            <label>NSE stock
              <select value={symbol} disabled={state.loading} onChange={event => { setSymbol(event.target.value); setState({ loading: false, quote: null, error: '' }); }}>
                {SYMBOLS.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>Owner access token
              <input type="password" value={token}
                onChange={event => setToken(event.target.value)}
                autoComplete="off" placeholder="Private token (not saved)" />
            </label>
            <button type="button" className="md3-primary" onClick={check}
              disabled={state.loading || !token.trim()}>
              {state.loading ? 'Checking NSE…' : 'Check NSE quote'}
            </button>
          </div>
          {state.error && <p className="md3-quote-error" role="alert">{state.error}</p>}
          {state.quote && (
            <div className="md3-nse-result" role="status">
              <strong>{state.quote.symbol} · ₹{fmtValue.format(state.quote.value)}</strong>
              <span>{Number.isFinite(state.quote.changePercent)
                ? (state.quote.changePercent > 0 ? '+' : '') + state.quote.changePercent.toFixed(2) + '%'
                : 'Change unavailable'}</span>
              <small>Observed: {fmtDate.format(new Date(state.quote.quoteAt))} IST</small>
              <small>{state.quote.freshness === 'RECENT_PROVIDER_OBSERVATION'
                ? 'Recent NSE observation (delayed, not tick-live)'
                : 'Historical NSE observation — not a current price'}</small>
              <small>NSE CM Market Live MCP · Source and timestamp retained</small>
            </div>
          )}
        </>
      ) : (
        <p className="md3-muted">
          Owner-only NSE gateway is not configured. This public page does not redistribute exchange quotes.
        </p>
      )}
      <div className="md3-card-bottom">
        <a className="md3-provider-link" href="https://www.nseindia.in/market-data/live-equity-market"
          target="_blank" rel="noopener noreferrer">View NSE equity market at source</a>
      </div>
    </section>
  );
}

export default NsePersonalQuote;
