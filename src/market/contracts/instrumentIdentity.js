/**
 * Market R2.1 canonical identities. Symbols are not market observations.
 * Legacy unqualified watchlist entries are interpreted as NSE only when
 * explicitly supplied through the legacy NSE migration helper.
 */
const EXCHANGES = Object.freeze(['NSE','BSE']);
const SYMBOL = /^[A-Z0-9][A-Z0-9&-]{0,19}$/;
const FUND_CODE = /^\d{3,8}$/;
export function canonicalInstrumentKey(exchange, symbol) {
  if (typeof exchange !== 'string' || typeof symbol !== 'string') return null;
  const ex = exchange.trim().toUpperCase();
  const sym = symbol.trim().toUpperCase();
  return EXCHANGES.includes(ex) && SYMBOL.test(sym) ? ex+':'+sym : null;
}
export function parseInstrumentKey(value) {
  if (typeof value !== 'string' || value !== value.trim()) return null;
  const parts = value.split(':');
  if (parts.length !== 2) return null;
  const key = canonicalInstrumentKey(parts[0],parts[1]);
  if (!key) return null;
  const [exchange,symbol] = key.split(':');
  return Object.freeze({key,exchange,symbol});
}
export function canonicalNseLegacySymbol(value) {
  if (typeof value !== 'string') return null;
  const symbol = value.trim().toUpperCase().replace(/\.NS$/,'');
  if (!SYMBOL.test(symbol)) return null;
  return 'NSE:'+symbol;
}
export function canonicalFundCode(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const code = String(value);
  return FUND_CODE.test(code) ? code : null;
}
export const MAX_SAVED_EQUITIES = 12;
export const MAX_SAVED_FUNDS = 12;
export function planLegacyNseWatchlist(raw, limit = MAX_SAVED_EQUITIES) {
  if (!Array.isArray(raw)) return {keys:[],rejected:[],changed:false};
  const keys = [], rejected = [], seen = new Set();
  for (const source of raw) {
    const key = canonicalNseLegacySymbol(source);
    if (!key) { rejected.push(source); continue; }
    if (seen.has(key)) continue;
    if (keys.length === limit) { rejected.push(source); continue; }
    seen.add(key);keys.push(key);
  }
  return {keys,rejected,changed:JSON.stringify(raw)!==JSON.stringify(keys)};
}
export function planLegacySavedFunds(raw, limit = MAX_SAVED_FUNDS) {
  if (!Array.isArray(raw)) return {codes:[],rejected:[]};
  const codes=[],rejected=[],seen=new Set();
  for (const source of raw) {
    const code=canonicalFundCode(source);
    if (!code || codes.length===limit) {rejected.push(source);continue;}
    if (!seen.has(code)) {seen.add(code);codes.push(code);}
  }
  return {codes,rejected};
}
