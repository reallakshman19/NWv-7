/**
 * BSE Instrument Catalog & Coverage Registry (WP-02)
 *
 * Distinguishes verified BSE instruments from unverified candidates.
 * Performs strict catalog lookups rather than arbitrary URL synthesis.
 */

export const BSE_GROUPS = Object.freeze(['indices', 'equities']);

/**
 * Authoritative Curated Catalog for BSE Instruments on TradingView.
 * widgetVerified indicates verified rendering inside the embed-widget-market-quotes widget.
 * pageVerified indicates verified existence of an official TradingView instrument page.
 */
export const BSE_CATALOG = Object.freeze({
  // Verified BSE Indices
  'BSE:SENSEX': Object.freeze({
    key: 'BSE:SENSEX',
    symbol: 'SENSEX',
    name: 'S&P BSE SENSEX',
    group: 'indices',
    providerUrl: 'https://www.tradingview.com/symbols/BSE-SENSEX/',
    widgetVerified: true,
    pageVerified: true,
  }),
  'BSE:BSE500': Object.freeze({
    key: 'BSE:BSE500',
    symbol: 'BSE500',
    name: 'S&P BSE 500',
    group: 'indices',
    providerUrl: 'https://www.tradingview.com/symbols/BSE-BSE500/',
    widgetVerified: true,
    pageVerified: true,
  }),

  // Unqualified Index Candidates (Require separate widget rendering evidence)
  'BSE:BSE100': Object.freeze({
    key: 'BSE:BSE100',
    symbol: 'BSE100',
    name: 'S&P BSE 100',
    group: 'indices',
    providerUrl: 'https://www.tradingview.com/symbols/BSE-BSE100/',
    widgetVerified: false,
    pageVerified: true,
  }),
  'BSE:BSEMID': Object.freeze({
    key: 'BSE:BSEMID',
    symbol: 'BSEMID',
    name: 'S&P BSE MidCap',
    group: 'indices',
    providerUrl: 'https://www.tradingview.com/symbols/BSE-BSEMID/',
    widgetVerified: false,
    pageVerified: false,
  }),
  'BSE:BSESML': Object.freeze({
    key: 'BSE:BSESML',
    symbol: 'BSESML',
    name: 'S&P BSE SmallCap',
    group: 'indices',
    providerUrl: 'https://www.tradingview.com/symbols/BSE-BSESML/',
    widgetVerified: false,
    pageVerified: false,
  }),

  // Verified BSE Equities (Baseline BseMarketWidget.jsx verification)
  'BSE:RELIANCE': Object.freeze({
    key: 'BSE:RELIANCE',
    symbol: 'RELIANCE',
    name: 'Reliance Industries',
    group: 'equities',
    providerUrl: 'https://www.tradingview.com/symbols/BSE-RELIANCE/',
    widgetVerified: true,
    pageVerified: true,
  }),
  'BSE:TCS': Object.freeze({
    key: 'BSE:TCS',
    symbol: 'TCS',
    name: 'Tata Consultancy Services',
    group: 'equities',
    providerUrl: 'https://www.tradingview.com/symbols/BSE-TCS/',
    widgetVerified: true,
    pageVerified: true,
  }),
  'BSE:INFY': Object.freeze({
    key: 'BSE:INFY',
    symbol: 'INFY',
    name: 'Infosys Limited',
    group: 'equities',
    providerUrl: 'https://www.tradingview.com/symbols/BSE-INFY/',
    widgetVerified: true,
    pageVerified: true,
  }),

  // Unqualified Equity Candidates (Require separate widget rendering evidence)
  'BSE:HDFCBANK': Object.freeze({
    key: 'BSE:HDFCBANK',
    symbol: 'HDFCBANK',
    name: 'HDFC Bank',
    group: 'equities',
    providerUrl: 'https://www.tradingview.com/symbols/BSE-HDFCBANK/',
    widgetVerified: false,
    pageVerified: true,
  }),
  'BSE:ICICIBANK': Object.freeze({
    key: 'BSE:ICICIBANK',
    symbol: 'ICICIBANK',
    name: 'ICICI Bank',
    group: 'equities',
    providerUrl: 'https://www.tradingview.com/symbols/BSE-ICICIBANK/',
    widgetVerified: false,
    pageVerified: true,
  }),
  'BSE:SBIN': Object.freeze({
    key: 'BSE:SBIN',
    symbol: 'SBIN',
    name: 'State Bank of India',
    group: 'equities',
    providerUrl: 'https://www.tradingview.com/symbols/BSE-SBIN/',
    widgetVerified: false,
    pageVerified: true,
  }),
});

/**
 * Filtered sets: Only instruments with widgetVerified: true
 */
export const BSE_SUPPORTED_INDICES = Object.freeze(
  Object.values(BSE_CATALOG).filter(item => item.group === 'indices' && item.widgetVerified)
);

export const BSE_SUPPORTED_EQUITIES = Object.freeze(
  Object.values(BSE_CATALOG).filter(item => item.group === 'equities' && item.widgetVerified)
);

/**
 * Check if a symbol is supported and widget-verified in the BSE catalog.
 * @param {string} symbolKey - Formatted as 'BSE:SYMBOL' or 'SYMBOL'
 */
export function isSupportedBseSymbol(symbolKey) {
  if (typeof symbolKey !== 'string') return false;
  const canonical = symbolKey.startsWith('BSE:') ? symbolKey : `BSE:${symbolKey.trim().toUpperCase()}`;
  return Boolean(BSE_CATALOG[canonical]?.widgetVerified);
}

/**
 * Catalog lookup for TradingView URL.
 * Returns approved provider URL from catalog, or fallback search URL. Never fabricates ad-hoc chart URLs.
 * @param {string} symbolKey
 */
export function getBseTradingViewUrl(symbolKey) {
  if (typeof symbolKey !== 'string' || !symbolKey.trim()) {
    return 'https://www.tradingview.com/markets/asia-pacific/';
  }

  const trimmed = symbolKey.trim().toUpperCase();
  const canonical = trimmed.startsWith('BSE:') ? trimmed : `BSE:${trimmed}`;

  if (BSE_CATALOG[canonical]?.providerUrl) {
    return BSE_CATALOG[canonical].providerUrl;
  }

  // Safe fallback to TradingView search without synthesizing fake instrument URLs
  return `https://www.tradingview.com/search/?q=${encodeURIComponent(canonical)}`;
}

/**
 * Retrieve widget symbol configuration for a specified group.
 * Only includes widgetVerified: true instruments.
 * @param {'indices'|'equities'} group
 */
export function getWidgetSymbols(group = 'indices') {
  const normalizedGroup = group === 'equities' ? 'equities' : 'indices';
  const list = normalizedGroup === 'equities' ? BSE_SUPPORTED_EQUITIES : BSE_SUPPORTED_INDICES;

  return {
    title: normalizedGroup === 'equities' ? 'BSE equities' : 'BSE indices',
    group: normalizedGroup,
    symbols: list.map(item => ({
      name: item.key,
      displayName: item.name,
    })),
  };
}
