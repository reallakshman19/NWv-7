/**
 * Provider-hosted quotes for the public Markets Overview.
 * Maps fixed FX, gold and supported BSE instruments to TradingView views.
 */
import React from 'react';
import { fromCanonicalKey } from '../equity/equityModel.js';
import { getWidgetSymbols } from '../providers/bseCoverage.js';
import { canAttemptHeadlineEmbed } from '../indices/headlineIndexResolution.js';
import { createTradingViewFrameUrl, TRADINGVIEW_FRAME_SANDBOX } from '../providers/tradingViewFrame.js';

const WIDGET_SCRIPT_URL = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js';
const FX_AND_GOLD = [
  { s: 'FX_IDC:USDINR', d: 'USD/INR' },
  { s: 'FX_IDC:EURINR', d: 'EUR/INR' },
  { s: 'FX_IDC:GBPINR', d: 'GBP/INR' },
  { s: 'OANDA:XAUUSD', d: 'XAU/USD' },
];
const BSE_INDICES = getWidgetSymbols('indices').symbols
  .filter(({ name }) => canAttemptHeadlineEmbed(name))
  .map(({ name, displayName }) => ({ s: name, d: displayName }));
// Separate BSE listings verified in the Market Overview widget.
const BSE_STOCKS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'ITC', 'BHARTIARTL',
  'KOTAKBANK', 'LT', 'HINDUNILVR', 'AXISBANK', 'BAJFINANCE', 'MARUTI', 'WIPRO', 'SUNPHARMA',
].map(symbol => ({ s: 'BSE:' + symbol, d: symbol }));

/**
 * @param {{ title: string, symbols: { s: string, d: string }[], sourceUrl: string }} props
 * @returns {React.JSX.Element} An attributed, isolated view of the requested provider symbols.
 */
function QuoteWidget({ title, symbols, sourceUrl }) {
  const height = symbols.length * 60 + 12;
  const src = createTradingViewFrameUrl(WIDGET_SCRIPT_URL, {
    width: '100%',
    height,
    locale: 'en',
    colorTheme: 'dark',
    showChart: false,
    showTabs: false,
    showSymbolLogo: false,
    tabs: [{ title, symbols }],
  });

  return (
    <div className="md3-quote-widget">
      <iframe
        title={title + ' from TradingView'}
        src={src}
        sandbox={TRADINGVIEW_FRAME_SANDBOX}
        referrerPolicy="no-referrer"
        style={{ height }}
      />
      <a className="md3-quote-source" href={sourceUrl} target="_blank" rel="noopener noreferrer">
        {title} on TradingView ↗
      </a>
    </div>
  );
}

export function BseIndexCloses() {
  return (
    <div className="md3-quote-panel">
      <h3 className="md3-quote-heading">BSE index closing prices</h3>
      <QuoteWidget title="BSE index closing prices" symbols={BSE_INDICES}
        sourceUrl="https://www.tradingview.com/markets/india/" />
    </div>
  );
}

export function CurrencyAndGoldQuotes() {
  return (
    <div className="md3-quote-panel">
      <p className="md3-compact-caption">FX in INR · Global spot gold in USD per troy ounce</p>
      <QuoteWidget title="Currency and spot gold quotes" symbols={FX_AND_GOLD}
        sourceUrl="https://www.tradingview.com/markets/currencies/" />
      <a className="md3-quote-source" href="https://ibjarates.com/" target="_blank" rel="noopener noreferrer">
        India Gold 999 reference · ₹ per 10 g ↗
      </a>
    </div>
  );
}

/** @param {{ title: string, symbols: { s: string, d: string }[], caption: string | null }} props */
function BseStockQuotePanel({ title, symbols, caption }) {
  if (symbols.length === 0) return null;

  return (
    <div className="md3-quote-panel">
      <h3 className="md3-quote-heading">{title}</h3>
      {caption && <p className="md3-compact-caption">{caption}</p>}
      <QuoteWidget title={title} symbols={symbols}
        sourceUrl="https://www.tradingview.com/markets/stocks-india/" />
    </div>
  );
}

/**
 * Shows BSE closes for saved NSE companies, or examples for an empty watchlist.
 * @param {{ savedKeys: string[] }} props
 */
export function BseStockCloses({ savedKeys }) {
  const savedSymbols = new Set(savedKeys.map(key => fromCanonicalKey(key) || key));
  const symbols = savedSymbols.size
    ? BSE_STOCKS.filter(({ d }) => savedSymbols.has(d))
    : BSE_STOCKS.slice(0, 3);
  const caption = savedSymbols.size ? 'BSE listings of your saved companies' : 'Selected tracked companies';
  return <BseStockQuotePanel title="BSE stock closing prices" symbols={symbols} caption={caption} />;
}

/**
 * Shows the supported BSE listings for the active sector's tracked companies.
 * A sector without supported listings has no embed.
 * @param {{ stocks: { symbol: string }[] }} props
 */
export function BseSectorStockCloses({ stocks }) {
  const trackedSymbols = new Set(stocks.map(({ symbol }) => symbol));
  const symbols = BSE_STOCKS.filter(({ d }) => trackedSymbols.has(d));
  return <BseStockQuotePanel title="BSE sector stock closing prices" symbols={symbols} caption={null} />;
}
