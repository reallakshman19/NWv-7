import { safeGetJson, safeSetJson } from '../data/safeStorage.js';
import { boundedMarketJson } from './marketJsonRequest.js';

export const INDIA_MARKET_SOURCES = {
  indices: 'https://www.nseindia.com/market-data/live-market-indices',
  equity: 'https://www.nseindia.com/get-quotes/equity',
  ipo: 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo',
  ipoBse: 'https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx',
  issueDocuments: 'https://www.nseindia.com/companies-listing/corporate-public-issue-advertisements',
  nfo: 'https://www.amfiindia.com/new-fund-offer',
  nav: 'https://www.amfiindia.com/net-asset-value/nav-download',
  fx: 'https://frankfurter.dev/',
  funds: 'https://www.mfapi.in',
};
const DAY = 86400000;
const FX_CACHE = 'nw7.omr-inr.frankfurter.v1';
let fxPending = null;

async function getJson(url, fetchImpl = fetch, { signal } = {}) {
  return boundedMarketJson(url, { fetchImpl, signal, timeoutMs: 8000, maxBytes: 2 * 1024 * 1024 });
}

export function normalizeOmrRate(data, now = Date.now()) {
  // Frankfurter v2: free MIT-licensed API code. Reference rate ownership
  // remains with original central bank(s); use direct browser conversion only.
  const rate = Number(data?.rate);
  const date = data?.date;
  const asOf = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? Date.parse(date + 'T00:00:00Z') : NaN;
  if (data?.base !== 'OMR' || data?.quote !== 'INR' ||
      !Number.isFinite(rate) || rate <= 0 ||
      !Number.isFinite(asOf) || new Date(asOf).toISOString().slice(0, 10) !== date ||
      asOf > now + 300000 || now - asOf > 3 * DAY) {
    throw new Error('No recent, valid OMR/INR reference rate is available');
  }
  return { rate, asOf, rateDate:date, stale: now - asOf > 36 * 3600000 };
}

export async function loadOmrRate({ now = Date.now(), fetchImpl = fetch, read = safeGetJson, write = safeSetJson } = {}) {
  const cache = read(FX_CACHE);
  if (cache?.payload && now >= cache.checkedAt && now - cache.checkedAt < DAY) {
    try { return normalizeOmrRate(cache.payload, now); } catch { /* Re-fetch invalid cache. */ }
  }
  // Deduplicate React StrictMode/remount calls; only the browser requests the open API.
  if (fxPending) return fxPending;
  fxPending = (async () => {
    try {
      const payload = await getJson('https://api.frankfurter.dev/v2/rate/omr/inr', fetchImpl);
      const result = normalizeOmrRate(payload, now);
      write(FX_CACHE, { payload, checkedAt: now });
      return result;
    } catch (error) {
      if (cache?.payload) {
        const retained = normalizeOmrRate(cache.payload, now);
        return { ...retained, stale: true, warning: 'Rate refresh failed; retained reference rate' };
      }
      throw error;
    } finally {
      fxPending = null;
    }
  })();
  return fxPending;
}

export function convertOmrInr(amount, rate, direction = 'OMR') {
  if (amount === '' || amount == null || !Number.isFinite(Number(amount)) || Number(amount) < 0 ||
      !Number.isFinite(Number(rate)) || Number(rate) <= 0) return null;
  return direction === 'OMR' ? Number(amount) * Number(rate) : Number(amount) / Number(rate);
}

export function equityQuoteUrl(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase().replace(/\.NS$/, '');
  return /^[A-Z0-9&-]{1,30}$/.test(normalized)
    ? `${INDIA_MARKET_SOURCES.equity}?symbol=${encodeURIComponent(normalized)}` : null;
}

export async function searchIndianFunds(query, { fetchImpl = fetch, signal } = {}) {
  const cleaned = String(query || '').trim().slice(0, 120);
  if (cleaned.length < 3) throw new Error('Enter at least three characters');
  const rows = await getJson(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(cleaned)}`, fetchImpl, { signal });
  if (!Array.isArray(rows)) throw new Error('Fund search is unavailable');
  return rows.filter(row => /^\d+$/.test(String(row?.schemeCode)) && row?.schemeName).slice(0, 20);
}

export function parseIndiaDate(value) {
  const text = String(value || '');
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  const dmy = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!iso && !dmy) return null;
  const [year, month, day] = iso ? iso.slice(1).map(Number) : [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])];
  const stamp = Date.UTC(year, month - 1, day);
  const check = new Date(stamp);
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
    ? stamp - 19800000 : null;
}

export async function loadFundNav(code, { fetchImpl = fetch, now = Date.now(), signal } = {}) {
  if (!/^\d{3,8}$/.test(String(code))) throw new Error('Invalid fund scheme code');
  const payload = await getJson(`https://api.mfapi.in/mf/${code}/latest`, fetchImpl, { signal });
  const row = payload?.data?.[0];
  const asOf = parseIndiaDate(row?.date);
  const nav = Number(row?.nav);
  if (payload?.status !== 'SUCCESS' || !payload?.meta?.scheme_name || !Number.isFinite(nav) || nav <= 0 ||
      asOf == null || asOf > now) throw new Error('No valid published NAV for this scheme');
  return { code: String(code), name: payload.meta.scheme_name, category: payload.meta.scheme_category, nav, date: row.date, stale: now - asOf > 7 * DAY };
}

export function calculateSip(monthly, years, annualPercent) {
  const payment = Number(monthly), term = Number(years), annual = Number(annualPercent);
  if (![payment, term, annual].every(Number.isFinite) || payment <= 0 || term <= 0 || term > 50 || annual < 0 || annual > 50) return null;
  const months = Math.round(term * 12);
  const rate = annual / 1200;
  const invested = payment * months;
  // End-of-month contributions. This is a user-entered scenario, never a forecast.
  const value = rate === 0 ? invested : payment * (Math.pow(1 + rate, months) - 1) / rate;
  return { invested, value, gain: value - invested };
}

export function currentNfoRows(rows = [], now = Date.now()) {
  const today = Math.floor((now + 19800000) / DAY) * DAY - 19800000;
  return (Array.isArray(rows) ? rows : []).flatMap(row => {
    const open = parseIndiaDate(row?.openDate || row?.startDate);
    const close = parseIndiaDate(row?.closeDate || row?.endDate);
    if (!row?.name || open == null || open > today + 90 * DAY) return [];
    if (close == null && row.status === 'announced' && row.source === 'AMFI' && open >= today - 21 * DAY) {
      return [{ ...row, offerState: 'Announced · verify availability' }];
    }
    if (close == null || close < today || close < open) return [];
    return [{ ...row, offerState: open > today ? 'Upcoming' : 'Open' }];
  });
}
