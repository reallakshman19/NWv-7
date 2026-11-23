/**
 * On-demand, browser-local quote override for the Market landing page.
 *
 * No app backend, publishing workflow, cross-origin proxy, browser storage,
 * or repeated polling is used here. Source terms still apply to direct access.
 * A successful fetch is not evidence of redistribution rights.
 */
const PULSE_SYMBOLS = Object.freeze([
  { symbol: '^NSEI', name: 'NIFTY 50' },
  { symbol: '^BSESN', name: 'SENSEX' },
  { symbol: '^NSEBANK', name: 'BANK NIFTY' },
  { symbol: '^BSE500', name: 'BSE 500' },
]);

const MAX_QUOTE_AGE_MS = 5 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function qualifiedQuote(meta, instrument, now) {
  const value = Number(meta?.regularMarketPrice);
  const observedAt = Number(meta?.regularMarketTime) * 1000;
  const previousClose = Number(meta?.chartPreviousClose ?? meta?.previousClose);
  if (!Number.isFinite(value) || value <= 0 ||
      !Number.isFinite(observedAt) || observedAt <= 0 ||
      observedAt > now + MAX_FUTURE_SKEW_MS ||
      now - observedAt > MAX_QUOTE_AGE_MS) return null;
  const changePercent = Number.isFinite(previousClose) && previousClose > 0
    ? (value - previousClose) / previousClose * 100 : null;
  return {
    name: instrument.name,
    symbol: instrument.symbol,
    value,
    changePercent,
    quoteAt: new Date(observedAt).toISOString(),
    sourceProvider: 'Yahoo Finance (browser-direct)',
    sourceMode: 'personal-browser-lookup',
  };
}

/**
 * Fetch only after an explicit click. The browser may refuse cross-origin
 * requests; callers must keep source links available as a graceful fallback.
 */
export async function fetchPersonalMarketPulse({
  fetchImpl = fetch,
  signal,
  now = Date.now(),
} = {}) {
  const responses = await Promise.allSettled(PULSE_SYMBOLS.map(async (instrument) => {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
      encodeURIComponent(instrument.symbol) + '?interval=1d&range=5d';
    const response = await fetchImpl(url, {
      signal, cache: 'no-store', credentials: 'omit', mode: 'cors',
    });
    if (!response?.ok) return null;
    const payload = await response.json();
    return qualifiedQuote(payload?.chart?.result?.[0]?.meta, instrument, now);
  }));
  const indices = responses.filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value);
  if (!indices.length) {
    throw new Error('Direct browser quote lookup was blocked or returned no current observations. Use the original provider links.');
  }
  return indices;
}
