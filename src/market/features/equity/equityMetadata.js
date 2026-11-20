/**
 * Curated metadata and official URL builders for the 16 tracked NSE shares.
 * Non-curated symbols receive truthful unverified status and no fabricated company details.
 */
import { equityQuoteUrl } from '../../../services/indiaMarketTools.js';

export const TRACKED_NSE_METADATA = Object.freeze({
  RELIANCE: {
    symbol: 'RELIANCE',
    name: 'Reliance Industries Limited',
    sector: 'Energy & Petrochemicals (Descriptive)',
    exchange: 'NSE',
  },
  TCS: {
    symbol: 'TCS',
    name: 'Tata Consultancy Services Limited',
    sector: 'Information Technology (Descriptive)',
    exchange: 'NSE',
  },
  HDFCBANK: {
    symbol: 'HDFCBANK',
    name: 'HDFC Bank Limited',
    sector: 'Banking & Financial Services (Descriptive)',
    exchange: 'NSE',
  },
  INFY: {
    symbol: 'INFY',
    name: 'Infosys Limited',
    sector: 'Information Technology (Descriptive)',
    exchange: 'NSE',
  },
  ICICIBANK: {
    symbol: 'ICICIBANK',
    name: 'ICICI Bank Limited',
    sector: 'Banking & Financial Services (Descriptive)',
    exchange: 'NSE',
  },
  SBIN: {
    symbol: 'SBIN',
    name: 'State Bank of India',
    sector: 'Public Sector Banking (Descriptive)',
    exchange: 'NSE',
  },
  ITC: {
    symbol: 'ITC',
    name: 'ITC Limited',
    sector: 'Consumer Goods & Cigarettes (Descriptive)',
    exchange: 'NSE',
  },
  BHARTIARTL: {
    symbol: 'BHARTIARTL',
    name: 'Bharti Airtel Limited',
    sector: 'Telecommunications (Descriptive)',
    exchange: 'NSE',
  },
  KOTAKBANK: {
    symbol: 'KOTAKBANK',
    name: 'Kotak Mahindra Bank Limited',
    sector: 'Banking & Financial Services (Descriptive)',
    exchange: 'NSE',
  },
  LT: {
    symbol: 'LT',
    name: 'Larsen & Toubro Limited',
    sector: 'Engineering & Construction (Descriptive)',
    exchange: 'NSE',
  },
  HINDUNILVR: {
    symbol: 'HINDUNILVR',
    name: 'Hindustan Unilever Limited',
    sector: 'Fast Moving Consumer Goods (Descriptive)',
    exchange: 'NSE',
  },
  AXISBANK: {
    symbol: 'AXISBANK',
    name: 'Axis Bank Limited',
    sector: 'Banking & Financial Services (Descriptive)',
    exchange: 'NSE',
  },
  BAJFINANCE: {
    symbol: 'BAJFINANCE',
    name: 'Bajaj Finance Limited',
    sector: 'Non-Banking Financial Services (Descriptive)',
    exchange: 'NSE',
  },
  MARUTI: {
    symbol: 'MARUTI',
    name: 'Maruti Suzuki India Limited',
    sector: 'Automobile Manufacturing (Descriptive)',
    exchange: 'NSE',
  },
  WIPRO: {
    symbol: 'WIPRO',
    name: 'Wipro Limited',
    sector: 'Information Technology (Descriptive)',
    exchange: 'NSE',
  },
  SUNPHARMA: {
    symbol: 'SUNPHARMA',
    name: 'Sun Pharmaceutical Industries Limited',
    sector: 'Pharmaceuticals & Healthcare (Descriptive)',
    exchange: 'NSE',
  },
});

export const TRACKED_SYMBOLS = Object.freeze(Object.keys(TRACKED_NSE_METADATA));

/**
 * Returns metadata for any symbol. Curated entries have verified company names;
 * custom user-entered symbols are explicitly marked unverified.
 */
export function getEquityMetadata(symbol) {
  if (typeof symbol !== 'string') return null;
  const cleanSymbol = symbol.trim().toUpperCase().replace(/\.NS$/, '');
  if (TRACKED_NSE_METADATA[cleanSymbol]) {
    return {
      ...TRACKED_NSE_METADATA[cleanSymbol],
      isCurated: true,
      canonicalKey: `NSE:${cleanSymbol}`,
    };
  }
  return {
    symbol: cleanSymbol,
    name: null,
    sector: 'Custom / Unclassified (Descriptive)',
    exchange: 'NSE',
    isCurated: false,
    canonicalKey: `NSE:${cleanSymbol}`,
  };
}

/**
 * Official NSE quote URL via verified helper.
 */
export function getNseQuoteUrl(symbol) {
  if (typeof symbol !== 'string') return null;
  const cleanSymbol = symbol.trim().toUpperCase().replace(/\.NS$/, '');
  return equityQuoteUrl(cleanSymbol);
}

/**
 * Official NSE corporate filings / announcements URL with encoded symbol.
 */
export function getNseAnnouncementsUrl(symbol) {
  if (typeof symbol !== 'string') return null;
  const cleanSymbol = symbol.trim().toUpperCase().replace(/\.NS$/, '');
  if (!/^[A-Z0-9&-]{1,30}$/.test(cleanSymbol)) return null;
  return `https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol=${encodeURIComponent(cleanSymbol)}`;
}
