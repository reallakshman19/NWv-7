/** Source-first index reconciliation. No quote date or value is ever synthesized. */
const FIVE_MINUTES_MS = 5 * 60 * 1000;
// Existing producer's conservative source-quote hard ceiling, not a cache TTL.
const MAX_INDEX_QUOTE_AGE_MS = 5 * 24 * 60 * 60 * 1000;
const INDEX_ALIASES = new Map([
  ['^NSEI', 'NSE:NIFTY50'], ['NIFTY50', 'NSE:NIFTY50'], ['NIFTY', 'NSE:NIFTY50'],
  ['^BSESN', 'BSE:SENSEX'], ['SENSEX', 'BSE:SENSEX'],
  ['^NSEBANK', 'NSE:BANKNIFTY'], ['BANKNIFTY', 'NSE:BANKNIFTY'], ['NIFTYBANK', 'NSE:BANKNIFTY'],
  ['^CNXIT', 'NSE:NIFTYIT'], ['NIFTYIT', 'NSE:NIFTYIT'],
  ['^CNXAUTO', 'NSE:NIFTYAUTO'], ['NIFTYAUTO', 'NSE:NIFTYAUTO'],
  ['^CNXPHARMA', 'NSE:NIFTYPHARMA'], ['NIFTYPHARMA', 'NSE:NIFTYPHARMA'],
  ['^GSPC', 'US:SP500'], ['SP500', 'US:SP500'], ['S&P500', 'US:SP500'],
  ['^IXIC', 'US:NASDAQCOMPOSITE'], ['NASDAQ', 'US:NASDAQCOMPOSITE'], ['NASDAQCOMPOSITE', 'US:NASDAQCOMPOSITE'],
  ['^N225', 'JP:NIKKEI225'], ['NIKKEI225', 'JP:NIKKEI225'],
  ['^HSI', 'HK:HANGSENG'], ['HANGSENG', 'HK:HANGSENG'],
]);
const SECTOR_IDS = new Set(['NSE:BANKNIFTY', 'NSE:NIFTYIT', 'NSE:NIFTYAUTO', 'NSE:NIFTYPHARMA']);
const GLOBAL_PREFIXES = ['US:', 'JP:', 'HK:', 'GB:'];
const INSTANT_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i;

function normalizedIdentity(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9^&]/g, '');
}

export function canonicalIndexId(row) {
  if (!row || typeof row !== 'object') return null;
  const symbol = normalizedIdentity(row.symbol);
  const name = normalizedIdentity(row.name);
  const match = INDEX_ALIASES.get(symbol) || INDEX_ALIASES.get(name);
  if (match) return 'index:' + match;
  // Unknown names never acquire an exchange identity by guessing from their spelling.
  const namespace = normalizedIdentity(row.exchange || row.region) || 'UNKNOWN';
  const key = symbol || name;
  return key ? 'index:' + namespace + ':' + key : null;
}

export function indexRegion(id) {
  if (!id) return null;
  return GLOBAL_PREFIXES.some((prefix) => id.startsWith('index:' + prefix)) ? 'global' : 'india';
}

export function indexValue(row) {
  const value = row?.value;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function indexQuoteTime(row, nowMs = Date.now()) {
  const raw = row?.quoteAt ?? row?.timestamp;
  let ms = null;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 946684800000) ms = raw;
  if (typeof raw === 'string' && INSTANT_WITH_OFFSET.test(raw)) {
    const value = Date.parse(raw);
    if (Number.isFinite(value)) ms = value;
  }
  return ms && ms <= nowMs + FIVE_MINUTES_MS && ms >= nowMs - MAX_INDEX_QUOTE_AGE_MS ? ms : null;
}

function sourceKey(row) {
  const provider = String(row.sourceProvider || row.provider || '').trim().toLowerCase();
  const cadence = String(row.cadence || '').trim().toLowerCase();
  return { provider, cadence };
}

function comparable(old, incoming) {
  const a = sourceKey(old);
  const b = sourceKey(incoming);
  // Preserve legacy rows with missing metadata but reject explicitly incompatible providers/cadences.
  return !(a.provider && b.provider && a.provider !== b.provider) &&
    !(a.cadence && b.cadence && a.cadence !== b.cadence);
}

function usableIndex(row, nowMs) {
  if (String(row?.sourceMode || row?.source || '').toLowerCase() === 'seed') return null;
  const id = canonicalIndexId(row);
  const time = indexQuoteTime(row, nowMs);
  const value = indexValue(row);
  return id && time && value !== null ? { id, time, value, row } : null;
}

export function getQualifiedIndexRows(payload, nowMs = Date.now()) {
  const inputs = ['indices', 'globalIndices', 'sectorals'];
  const rows = [];
  for (const field of inputs) {
    if (Array.isArray(payload?.[field])) rows.push(...payload[field]);
  }
  return rows.map((row) => usableIndex(row, nowMs)).filter(Boolean);
}

/**
 * The winner is decided for EACH canonical index; a newer US quote cannot advance an Indian quote.
 * Missing rows stay retained; equal-clock value conflicts and incompatible providers cannot overwrite.
 * The retained row object (and its original quote timestamp) is never modified.
 */
export function mergeQualifiedIndices(previous, incoming, nowMs = Date.now()) {
  const byId = new Map();
  const summary = { added: 0, advanced: 0, unchanged: 0, older: 0, conflicts: 0, incompatible: 0, invalid: 0 };

  const accept = (entry, origin) => {
    const old = byId.get(entry.id);
    if (!old) {
      byId.set(entry.id, entry);
      if (origin === 'incoming') summary.added++;
      return;
    }
    if (!comparable(old.row, entry.row)) { summary.incompatible++; return; }
    if (entry.time < old.time) { summary.older++; return; }
    if (entry.time === old.time) {
      if (entry.value === old.value) summary.unchanged++;
      else summary.conflicts++;
      return;
    }
    byId.set(entry.id, entry);
    if (origin === 'incoming') summary.advanced++;
  };

  for (const entry of getQualifiedIndexRows(previous, nowMs)) accept(entry, 'previous');
  const rawIncoming = ['indices', 'globalIndices', 'sectorals'].flatMap((key) =>
    Array.isArray(incoming?.[key]) ? incoming[key] : []);
  for (const row of rawIncoming) {
    const entry = usableIndex(row, nowMs);
    if (entry) accept(entry, 'incoming');
    else summary.invalid++;
  }

  const entries = [...byId.values()];
  return {
    indices: entries.map((entry) => entry.row),
    globalIndices: entries.filter((entry) => indexRegion(entry.id) === 'global').map((entry) => entry.row),
    sectorals: entries.filter((entry) => SECTOR_IDS.has(entry.id.slice('index:'.length))).map((entry) => entry.row),
    summary,
    changed: summary.added + summary.advanced > 0,
  };
}
