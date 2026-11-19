/** Qualified, source-dated NSE tracked-share observations. Not an exchange-wide feed. */
import equityUniverse from '../config/marketEquityUniverse.json' with { type: 'json' };
import { indexQuoteTime } from './marketQuotePolicy.js';

export const TRACKED_EQUITY_SYMBOLS = Object.freeze([...equityUniverse.symbols]);
const SYMBOLS = new Set(TRACKED_EQUITY_SYMBOLS);
const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;

export function canonicalEquitySymbol(value) {
  if (typeof value !== 'string') return null;
  const symbol = value.trim().toUpperCase().replace(/\.NS$/, '');
  return /^(?:[A-Z0-9&-]{1,20})$/.test(symbol) ? symbol : null;
}

export function canonicalTrackedEquityId(value) {
  const symbol = canonicalEquitySymbol(value);
  return symbol && SYMBOLS.has(symbol) ? 'equity:NSE:' + symbol : null;
}

function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function normalizedProvider(row) {
  return String(row.sourceProvider || row.provider || row.source || '').trim().toLowerCase();
}

function acceptableQuote(row, nowMs) {
  if (!row || typeof row !== 'object' ||
      [row.sourceMode, row.source].some(value => String(value || '').toLowerCase() === 'seed')) return null;
  const symbol = canonicalEquitySymbol(row.symbol);
  const id = canonicalTrackedEquityId(symbol);
  if (!id || (row.id && row.id !== id) || (row.exchange && row.exchange !== 'NSE')) return null;
  const value = numeric(row.value ?? row.price);
  const time = indexQuoteTime(row, nowMs);
  if (!(value > 0) || !time || time < nowMs - FIVE_DAYS) return null;
  if (row.currency && !['INR', '₹'].includes(row.currency)) return null;
  const provider = normalizedProvider(row);
  if (!provider || row.sourceAuthority !== 'third-party') return null;
  return {
    id, symbol, time, value, provider, cadence: String(row.cadence || 'daily').trim().toLowerCase(),
    row: { ...row, id, symbol, exchange: 'NSE', region: 'IN', currency: 'INR',
      value, price: value, unit: 'currency', sourceAuthority: 'third-party',
      quoteAt: typeof row.quoteAt === 'string' ? row.quoteAt : new Date(time).toISOString() },
  };
}

export function qualifyTrackedEquities(rows, nowMs = Date.now()) {
  if (!Array.isArray(rows)) return [];
  const accepted = new Map();
  for (const row of rows) {
    const entry = acceptableQuote(row, nowMs);
    if (!entry) continue;
    const old = accepted.get(entry.id);
    if (!old || old.time < entry.time) accepted.set(entry.id, entry);
    // Equal-clock conflict retains the first observed value.
  }
  return [...accepted.values()].map(item => item.row);
}

function compatible(a, b) {
  return a.provider === b.provider && a.cadence === b.cadence;
}

export function mergeQualifiedEquities(previous, incoming, nowMs = Date.now()) {
  const results = new Map();
  const summary = { added: 0, advanced: 0, unchanged: 0, older: 0, conflicts: 0, incompatible: 0, invalid: 0 };
  const record = (entry, isIncoming) => {
    const old = results.get(entry.id);
    if (!old) {
      results.set(entry.id, entry);
      if (isIncoming) summary.added++;
      return;
    }
    if (!compatible(old, entry)) { summary.incompatible++; return; }
    if (entry.time < old.time) { summary.older++; return; }
    if (entry.time === old.time) {
      if (entry.value === old.value) summary.unchanged++;
      else summary.conflicts++;
      return;
    }
    results.set(entry.id, entry);
    if (isIncoming) summary.advanced++;
  };
  for (const row of previous?.equities || []) {
    const entry = acceptableQuote(row, nowMs);
    if (entry) record(entry, false);
  }
  for (const row of incoming?.equities || []) {
    const entry = acceptableQuote(row, nowMs);
    if (entry) record(entry, true);
    else summary.invalid++;
  }
  const equities = [...results.values()].map(entry => entry.row);
  return { equities, summary, changed: summary.added + summary.advanced > 0,
    coverage: { universeSize: TRACKED_EQUITY_SYMBOLS.length, quotedCount: equities.length,
      unavailableSymbols: TRACKED_EQUITY_SYMBOLS.filter(symbol => !results.has('equity:NSE:' + symbol)) } };
}

function istDay(instantMs) {
  return new Date(instantMs + 330 * 60 * 1000).toISOString().slice(0, 10);
}

export function deriveTrackedMovers(equities, nowMs = Date.now()) {
  const rows = qualifyTrackedEquities(equities, nowMs);
  const newest = rows.reduce((current, row) => Math.max(current, Date.parse(row.quoteAt)), 0);
  const sessionDate = newest ? istDay(newest) : null;
  const sameSession = rows.filter(row => istDay(Date.parse(row.quoteAt)) === sessionDate);
  const withChanges = sameSession.map(row => ({ row, change: numeric(row.changePercent) }))
    .filter(({ change }) => change !== null);
  return {
    gainers: withChanges.filter(({ change }) => change > 0).sort((a, b) => b.change - a.change).slice(0, 5).map(item => item.row),
    losers: withChanges.filter(({ change }) => change < 0).sort((a, b) => a.change - b.change).slice(0, 5).map(item => item.row),
    scope: 'tracked-universe', sessionDate,
  };
}
