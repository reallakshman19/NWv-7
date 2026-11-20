/**
 * NWv7 Market Desk R2.1 - WP-06 FX Mathematical Engine
 * Pure precision mathematics for currency conversion, inversion, swap,
 * and presentation formatting without intermediate rounding drift.
 */

export const SUPPORTED_CURRENCY_PAIRS = Object.freeze([
  { id: 'OMR/INR', base: 'OMR', quote: 'INR', label: 'OMR / INR', defaultAmount: 100 },
  { id: 'USD/INR', base: 'USD', quote: 'INR', label: 'USD / INR', defaultAmount: 100 }
]);

const FORMULA_START_REGEX = /^[=+@\t\r|-]/;

/**
 * Validates and parses user amount input.
 * Rejects negative numbers, non-numeric values, Infinity, and formula injection strings.
 * Returns null for blank/empty/whitespace or invalid inputs (never false 0).
 *
 * @param {string|number} input 
 * @returns {number|null}
 */
export function sanitizeCurrencyAmount(input) {
  if (input === null || input === undefined) return null;
  const str = String(input).trim();
  if (!str) return null;

  if (FORMULA_START_REGEX.test(str)) {
    return null;
  }

  // Reject exponential notation if malformed or containing dangerous chars
  if (!/^-?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(str)) {
    return null;
  }

  const num = Number(str);
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }

  return num;
}

/**
 * Performs unrounded forward conversion from base to quote.
 * result = amount * rate
 *
 * @param {number} amount 
 * @param {number} rate 
 * @returns {number|null}
 */
export function convertBaseToQuote(amount, rate) {
  const cleanAmount = sanitizeCurrencyAmount(amount);
  const cleanRate = Number(rate);
  if (cleanAmount === null || !Number.isFinite(cleanRate) || cleanRate <= 0) {
    return null;
  }
  return cleanAmount * cleanRate;
}

/**
 * Performs unrounded reverse conversion from quote to base.
 * result = amount / rate
 *
 * @param {number} amount 
 * @param {number} rate 
 * @returns {number|null}
 */
export function convertQuoteToBase(amount, rate) {
  const cleanAmount = sanitizeCurrencyAmount(amount);
  const cleanRate = Number(rate);
  if (cleanAmount === null || !Number.isFinite(cleanRate) || cleanRate <= 0) {
    return null;
  }
  return cleanAmount / cleanRate;
}

/**
 * Executes a reversible currency conversion between two currencies using the
 * exact same qualified reference rate, without initiating duplicate network calls (MKT-021).
 *
 * @param {number} amount 
 * @param {number} rate 
 * @param {string} fromCurrency 
 * @param {string} baseCurrency 
 * @returns {number|null}
 */
export function calculateConversion(amount, rate, fromCurrency, baseCurrency) {
  if (fromCurrency === baseCurrency) {
    return convertBaseToQuote(amount, rate);
  }
  return convertQuoteToBase(amount, rate);
}

/**
 * Formats a currency amount with standard regional decimal rules:
 * - OMR: 3 decimal places (1,000 baisa)
 * - INR: 2 decimal places (en-IN)
 * - USD: 2 decimal places (en-US)
 *
 * @param {number} amount 
 * @param {string} currencyCode 
 * @returns {string}
 */
export function formatCurrencyDisplay(amount, currencyCode) {
  if (!Number.isFinite(amount)) return '—';

  const code = String(currencyCode).toUpperCase();
  try {
    if (code === 'OMR') {
      return new Intl.NumberFormat('en-OM', {
        style: 'currency',
        currency: 'OMR',
        minimumFractionDigits: 3,
        maximumFractionDigits: 3
      }).format(amount);
    }
    if (code === 'INR') {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    }
    if (code === 'USD') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    }
  } catch {
    // Fallback if locale unsupported
  }

  const decimals = code === 'OMR' ? 3 : 2;
  return `${code} ${amount.toFixed(decimals)}`;
}

/**
 * Formats exchange rate benchmark string.
 * @param {number} rate 
 * @param {string} base 
 * @param {string} quote 
 * @returns {string}
 */
export function formatRateBenchmark(rate, base, quote) {
  if (!Number.isFinite(rate) || rate <= 0) return 'Rate unavailable';
  const decimals = quote === 'OMR' ? 4 : 2;
  return `1 ${base} = ${rate.toFixed(decimals)} ${quote}`;
}

/**
 * Subtracts calendar days from an ISO date string (YYYY-MM-DD).
 * @param {string} isoDate 
 * @param {number} days 
 * @returns {string}
 */
export function subtractCalendarDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
