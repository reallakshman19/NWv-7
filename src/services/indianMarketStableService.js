import { MARKET_FREE_OPEN_ONLY, freeOpenMarketPayload } from './marketFreeOpenPolicy.js';
import { getIdbCache, setIdbCache } from './indexedDbCache.js';
import { mergeQualifiedIndices } from './marketQuotePolicy.js';
import { TRACKED_EQUITY_SYMBOLS, mergeQualifiedEquities, qualifyTrackedEquities, deriveTrackedMovers } from './marketEquityPolicy.js';
import {
  MARKET_CACHE_SCHEMA_VERSION,
  MARKET_SERVICE_CACHE_KEY,
  MARKET_SERVICE_CACHE_TTL_MS,
  MARKET_STALE_CACHE_MAX_AGE_MS,
  MARKET_SNAPSHOT_FRESH_MS,
  MARKET_EXPIRED_DISPLAY_MAX_AGE_MS,
  getMarketPayloadAgeMs,
  isMarketPayloadFresh,
  normalizeSourceHealth,
  parseMarketTimestamp,
  shouldRejectMarketPayload
} from './marketTrust.js';

const CACHE_KEY = MARKET_SERVICE_CACHE_KEY;
const CACHE_TTL = MARKET_SERVICE_CACHE_TTL_MS;
const STALE_CACHE_MAX_AGE = MARKET_STALE_CACHE_MAX_AGE_MS;
const SNAPSHOT_FRESH_MS = MARKET_SNAPSHOT_FRESH_MS;
const INDIA_PUBLICATION_SCHEMA = 'market-india-1';
const MUTUAL_FUND_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MARKET_SIDECAR_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const LIVE_MARKET_BUNDLE_TIMEOUT_MS = 12 * 1000;
const YAHOO_CHART_BASES = [
  'https://query1.finance.yahoo.com/v8/finance/chart/',
  'https://query2.finance.yahoo.com/v8/finance/chart/',
];
const YAHOO_QUOTE_BASES = [
  'https://query1.finance.yahoo.com/v7/finance/quote',
  'https://query2.finance.yahoo.com/v7/finance/quote',
];

const PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

const CORE_INDICES = [
  { key: 'nifty50', name: 'NIFTY 50', symbol: '^NSEI' },
  { key: 'sensex', name: 'SENSEX', symbol: '^BSESN' },
  { key: 'bankNifty', name: 'BANK NIFTY', symbol: '^NSEBANK' },
  { key: 'niftyIT', name: 'NIFTY IT', symbol: '^CNXIT' },
  { key: 'niftyAuto', name: 'NIFTY AUTO', symbol: '^CNXAUTO' },
  { key: 'niftyPharma', name: 'NIFTY PHARMA', symbol: '^CNXPHARMA' },
  { key: 'sp500', name: 'S&P 500', symbol: '^GSPC' },
  { key: 'nasdaq', name: 'NASDAQ', symbol: '^IXIC' },
  { key: 'nikkei', name: 'NIKKEI 225', symbol: '^N225' },
  { key: 'hangSeng', name: 'HANG SENG', symbol: '^HSI' },
];

// Legacy developer fallback uses the same bounded universe as the publisher.
const TOP_STOCKS = TRACKED_EQUITY_SYMBOLS.map((symbol) => `${symbol}.NS`);

// The ticker also uses this when no market data is available.
export const MARKET_SEED = {
  indices: [],
  globalIndices: [],
  equities: [],
  movers: { gainers: [], losers: [] },
  sectorals: [],
  commodities: [],
  currencies: [],
  mutualFunds: [],
  ipo: { upcoming: [], live: [], recent: [] },
  nfo: [],
  stockCategories: { highs: [], lows: [], all: [] },
  fiidii: { fii: {}, dii: {}, date: '' },
  sourceHealth: {},
  errors: {},
};

function publicDataUrl(path) {
  const base = (import.meta.env?.BASE_URL || './').replace(/\/?$/, '/');
  return `${base}${String(path).replace(/^\//, '')}`;
}

function getPayloadTimestamp(data) {
  const ts = parseMarketTimestamp(data);
  return ts && ts <= Date.now() + 5 * 60 * 1000 ? ts : null;
}

function getPayloadAgeMs(data) {
  return getMarketPayloadAgeMs(data);
}

async function fetchPublicJson(path, signal) {
  return fetchJsonWithTimeout(publicDataUrl(path), 8000, signal);
}

function isSidecarFresh(payload, maxAgeMs) {
  const ageMs = getPayloadAgeMs(payload);
  return Number.isFinite(ageMs) && ageMs <= maxAgeMs;
}

function normalizeMutualFundRows(rows = []) {
  return rows
    .filter((fund) => fund?.name && fund?.nav != null)
    .map((fund) => ({
      ...fund,
      code: fund.code || fund.schemeCode,
      nav: Number.isFinite(Number(fund.nav)) ? Number(fund.nav) : fund.nav,
      direction: fund.direction || 'neutral',
      sourceMode: fund.sourceMode || 'official-daily',
    }));
}

function hasIPOCalendarRows(ipo = {}) {
  return ['upcoming', 'live', 'recent'].some((key) => Array.isArray(ipo?.[key]) && ipo[key].length > 0);
}

function hasFIIDIIRows(data = {}) {
  return Boolean(
    data?.date ||
    Object.keys(data?.fii || {}).length > 0 ||
    Object.keys(data?.dii || {}).length > 0
  );
}

function quoteRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row && ![row.sourceMode, row.source].some(
    (source) => String(source).toLowerCase() === 'seed'
  ));
}

export function sanitizeMarketPayload(data, sourceMode = data?.sourceMode, extra = {}) {
  if (!data || String(data.sourceMode).toLowerCase() === 'seed') return null;

  const timestamp = getPayloadTimestamp(data);
  if (!timestamp) return null;

  return {
    ...MARKET_SEED,
    ...data,
    indices: quoteRows(data.indices),
    globalIndices: quoteRows(data.globalIndices),
    equities: qualifyTrackedEquities(data.equities),
    movers: {
      ...data.movers,
      gainers: quoteRows(data.movers?.gainers),
      losers: quoteRows(data.movers?.losers),
    },
    sectorals: quoteRows(data.sectorals),
    commodities: quoteRows(data.commodities),
    currencies: quoteRows(data.currencies),
    schemaVersion: MARKET_CACHE_SCHEMA_VERSION,
    fetchedAt: timestamp,
    generatedAt: data.generatedAt || data.generated_at || new Date(timestamp).toISOString(),
    sourceMode,
    sourceHealth: normalizeSourceHealth({
      ...data.sourceHealth,
      ...extra.sourceHealth,
    }, sourceMode),
    errors: { ...data.errors, ...extra.errors },
  };
}

async function fetchJsonWithTimeout(url, timeoutMs, signal) {
  if (signal?.aborted) return null;

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timer;
  try {
    const cancelled = new Promise((resolve) => {
      controller.signal.addEventListener('abort', () => resolve(null), { once: true });
      timer = setTimeout(abort, timeoutMs);
    });
    const request = (async () => {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-cache' });
      return response.ok ? response.json() : null;
    })();
    return await Promise.race([request, cancelled]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function fetchJsonDirectOrProxy(url, timeoutMs = 8000, signal) {
  const candidates = [url, ...PROXIES.map((proxy) => proxy(url))];

  for (const candidate of candidates) {
    if (signal?.aborted) return null;
    const data = await fetchJsonWithTimeout(candidate, timeoutMs, signal);
    if (data) return { data, transport: candidate === url ? 'direct' : 'proxy' };
  }

  return null;
}

function yahooQuoteTimestamp(regularMarketTime) {
  const timestamp = Number(regularMarketTime) * 1000;
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= Date.now() + 5 * 60 * 1000
    ? timestamp
    : null;
}

function parseYahooChart(payload, provider = 'yahoo-chart') {
  const data = payload?.data || payload;
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  const price = Number(meta?.regularMarketPrice);
  const timestamp = yahooQuoteTimestamp(meta?.regularMarketTime);
  if (!Number.isFinite(price) || price <= 0 || !timestamp) return null;
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose ?? price);
  const change = price - prev;
  const changePercent = prev ? (change / prev) * 100 : 0;
  const quote = result?.indicators?.quote?.[0] || {};
  const series = (result?.timestamp || []).map((ts, i) => {
    const close = quote.close?.[i];
    if (close == null) return null;
    return {
      timestamp: ts * 1000,
      close: Number(close),
      open: Number(quote.open?.[i] ?? close),
      high: Number(quote.high?.[i] ?? close),
      low: Number(quote.low?.[i] ?? close),
    };
  }).filter(Boolean);
  return { price, change, changePercent, timestamp, series, provider: `${provider}-${payload?.transport || 'direct'}` };
}

function parseYahooQuote(payload, provider = 'yahoo-quote') {
  const item = payload?.data?.quoteResponse?.result?.[0] || payload?.quoteResponse?.result?.[0] || payload;
  const price = Number(item?.regularMarketPrice);
  const timestamp = yahooQuoteTimestamp(item?.regularMarketTime);
  if (!Number.isFinite(price) || price <= 0 || !timestamp) return null;
  const change = Number(item.regularMarketChange ?? 0);
  const changePercent = Number(item.regularMarketChangePercent ?? 0);
  return {
    price,
    change,
    changePercent,
    timestamp,
    series: [],
    provider: `${provider}-${payload?.transport || 'direct'}`,
  };
}

function providerLabelFromBase(base, type) {
  const mirror = base.includes('query2') ? 'query2' : 'query1';
  return `yahoo-${type}-${mirror}`;
}

async function fetchYahooChartQuote(symbol, opts = {}) {
  const range = opts.range || '5d';
  const interval = opts.interval || '1d';

  for (const base of YAHOO_CHART_BASES) {
    const url = `${base}${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const payload = await fetchJsonDirectOrProxy(url, 8000, opts.signal);
    const parsed = payload ? parseYahooChart(payload, providerLabelFromBase(base, 'chart')) : null;
    if (parsed) return parsed;
  }

  return null;
}

async function fetchYahooQuoteApi(symbol, signal) {
  for (const base of YAHOO_QUOTE_BASES) {
    const url = `${base}?symbols=${encodeURIComponent(symbol)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketTime`;
    const payload = await fetchJsonDirectOrProxy(url, 8000, signal);
    const parsed = payload ? parseYahooQuote(payload, providerLabelFromBase(base, 'quote')) : null;
    if (parsed) return parsed;
  }

  return null;
}

async function fetchBestYahooQuote(symbol, opts = {}) {
  return await fetchYahooChartQuote(symbol, opts) || await fetchYahooQuoteApi(symbol, opts.signal);
}

function formatIndex({ name, symbol }, priceData) {
  const series = priceData.series || [];
  return {
    name,
    symbol,
    value: priceData.price.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
    change: priceData.change.toFixed(2),
    changePercent: priceData.changePercent.toFixed(2),
    direction: priceData.change >= 0 ? 'up' : 'down',
    currency: name.includes('NIFTY') || name === 'SENSEX' ? '₹' : '',
    timestamp: priceData.timestamp,
    quoteAt: new Date(priceData.timestamp).toISOString(),
    history: series.map((p) => p.close),
    series,
    dayOpen: series[0]?.open ?? priceData.price,
    dayHigh: series.length ? Math.max(...series.map((p) => p.high || p.close)) : priceData.price,
    dayLow: series.length ? Math.min(...series.map((p) => p.low || p.close)) : priceData.price,
    sourceProvider: priceData.provider,
  };
}

function normalizeSnapshot(snapshot) {
  const normalized = sanitizeMarketPayload(snapshot, 'snapshot');
  if (shouldRejectMarketPayload(normalized, { allowSeed: false }).reject) return null;

  const publicationSchema = snapshot.schemaVersion;
  const maxAgeMs = publicationSchema === INDIA_PUBLICATION_SCHEMA
    ? MARKET_EXPIRED_DISPLAY_MAX_AGE_MS : SNAPSHOT_FRESH_MS;
  const fresh = isMarketPayloadFresh(normalized, maxAgeMs);

  return {
    ...normalized,
    sourceMode: fresh ? 'snapshot' : 'stale-snapshot',
    publicationSchema,
    sourceHealth: {
      ...normalized.sourceHealth,
      snapshot: {
        status: fresh ? 'snapshot' : 'stale',
        mode: fresh ? 'snapshot' : 'stale-snapshot',
        provider: 'market_snapshot.json',
        freshnessMs: getPayloadAgeMs(normalized),
        message: fresh ? 'Current daily snapshot' : 'Stale daily snapshot',
      },
    },
  };
}

export async function fetchStaticSnapshot() {
  return normalizeSnapshot(await fetchPublicJson('data/market_snapshot.json'));
}

async function readMarketCache({ allowStale = false } = {}) {
  try {
    const cached = await getIdbCache(CACHE_KEY);
    if (cached?.schemaVersion !== MARKET_CACHE_SCHEMA_VERSION) return null;

    const data = sanitizeMarketPayload(cached);
    const reject = shouldRejectMarketPayload(data, {
      maxAgeMs: allowStale ? STALE_CACHE_MAX_AGE : CACHE_TTL,
      allowSeed: false,
    });
    return reject.reject ? null : data;
  } catch {
    return null;
  }
}

export async function fetchIndices(signal) {
  const results = await Promise.allSettled(CORE_INDICES.map(async (index) => {
    const quote = await fetchBestYahooQuote(index.symbol, { range: '5d', interval: '1d', signal });
    return quote ? formatIndex(index, quote) : null;
  }));
  return results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
}

export async function fetchSectoralIndices() {
  const indices = await fetchIndices();
  return indices.filter((index) => ['BANK NIFTY', 'NIFTY IT', 'NIFTY AUTO', 'NIFTY PHARMA'].includes(index.name));
}

function getSectoralIndicesFrom(indices = []) {
  const sectorNames = new Set(['BANK NIFTY', 'NIFTY IT', 'NIFTY AUTO', 'NIFTY PHARMA']);
  const sectorals = indices.filter((index) => sectorNames.has(index.name));
  return sectorals;
}

async function fetchStockQuote(symbol, signal) {
  const quote = await fetchBestYahooQuote(symbol, { range: '5d', interval: '1d', signal });
  if (!quote) return null;
  return {
    symbol: symbol.replace('.NS', '').replace('.BO', ''),
    price: quote.price.toFixed(2),
    change: quote.change.toFixed(2),
    changePercent: quote.changePercent.toFixed(2),
    direction: quote.change >= 0 ? 'up' : 'down',
    timestamp: quote.timestamp,
    quoteAt: new Date(quote.timestamp).toISOString(),
    sourceProvider: quote.provider,
  };
}

export async function fetchTopMovers(signal) {
  const quotes = await Promise.allSettled(TOP_STOCKS.map((symbol) => fetchStockQuote(symbol, signal)));
  const valid = quotes.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
  if (!valid.length) return MARKET_SEED.movers;
  return {
    gainers: valid.filter((q) => Number(q.changePercent) > 0).sort((a, b) => Number(b.changePercent) - Number(a.changePercent)).slice(0, 5),
    losers: valid.filter((q) => Number(q.changePercent) < 0).sort((a, b) => Number(a.changePercent) - Number(b.changePercent)).slice(0, 5),
    source: 'yahoo-query1-query2-parallel-watchlist',
  };
}

export async function fetchCommodities(signal) {
  const symbols = [
    { symbol: 'GC=F', name: 'Gold', unit: '$/oz' },
    { symbol: 'SI=F', name: 'Silver', unit: '$/oz' },
    { symbol: 'CL=F', name: 'Crude Oil', unit: '$/bbl' },
  ];
  const results = await Promise.allSettled(symbols.map(async (item) => {
    const quote = await fetchBestYahooQuote(item.symbol, { range: '5d', interval: '1d', signal });
    if (!quote) return null;
    return {
      name: item.name,
      unit: item.unit,
      value: `$${quote.price.toFixed(2)}`,
      changePercent: quote.changePercent.toFixed(2),
      direction: quote.change >= 0 ? 'up' : 'down',
      source: quote.provider,
      timestamp: quote.timestamp,
      quoteAt: new Date(quote.timestamp).toISOString(),
    };
  }));
  const valid = results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
  return valid;
}

export async function fetchCurrencyRates(signal) {
  const symbols = [
    { symbol: 'USDINR=X', name: 'USD/INR' },
    { symbol: 'EURINR=X', name: 'EUR/INR' },
    { symbol: 'GBPINR=X', name: 'GBP/INR' },
  ];
  const results = await Promise.allSettled(symbols.map(async (item) => {
    const quote = await fetchBestYahooQuote(item.symbol, { range: '5d', interval: '1d', signal });
    if (!quote) return null;
    return {
      name: item.name,
      value: `₹${quote.price.toFixed(2)}`,
      changePercent: quote.changePercent.toFixed(2),
      direction: quote.change >= 0 ? 'up' : 'down',
      source: quote.provider,
      timestamp: quote.timestamp,
      quoteAt: new Date(quote.timestamp).toISOString(),
    };
  }));
  const valid = results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
  return valid;
}

export async function fetchMutualFunds(signal) {
  try {
    const snapshot = await fetchPublicJson('data/mutual_fund_snapshot.json', signal);
    if (!snapshot || !isSidecarFresh(snapshot, MUTUAL_FUND_SNAPSHOT_MAX_AGE_MS)) return [];
    return normalizeMutualFundRows(snapshot.mutualFunds).slice(0, 50);
  } catch {
    return [];
  }
}

function getSnapshotSidecars(snapshot) {
  if (!isSidecarFresh(snapshot, MARKET_SIDECAR_MAX_AGE_MS) ||
      String(snapshot.sourceMode).toLowerCase() === 'seed') return MARKET_SEED;

  return {
    ipo: hasIPOCalendarRows(snapshot.ipo) ? snapshot.ipo : MARKET_SEED.ipo,
    nfo: Array.isArray(snapshot.nfo) ? snapshot.nfo : MARKET_SEED.nfo,
    fiidii: hasFIIDIIRows(snapshot.fiidii) ? snapshot.fiidii : MARKET_SEED.fiidii,
  };
}

export async function fetchIPOData() {
  return getSnapshotSidecars(await fetchPublicJson('data/market_snapshot.json')).ipo;
}

export async function fetchNFOData() {
  return getSnapshotSidecars(await fetchPublicJson('data/market_snapshot.json')).nfo;
}

export async function fetchStockCategories() { return MARKET_SEED.stockCategories; }

export async function fetchFIIDII() {
  return getSnapshotSidecars(await fetchPublicJson('data/market_snapshot.json')).fiidii;
}

async function fetchLiveMarketBundle(snapshot) {
  const controller = new AbortController();
  const { signal } = controller;
  const timer = setTimeout(() => controller.abort(), LIVE_MARKET_BUNDLE_TIMEOUT_MS);
  try {
    const [indices, movers, commodities, currencies, mutualFunds] = await Promise.all([
      fetchIndices(signal),
      fetchTopMovers(signal),
      fetchCommodities(signal),
      fetchCurrencyRates(signal),
      fetchMutualFunds(signal),
    ]);
    const { ipo, nfo, fiidii } = getSnapshotSidecars(snapshot);
    const sectorals = getSectoralIndicesFrom(indices);
    const fetchedAt = indices.length ? Math.max(...indices.map((index) => index.timestamp)) : null;

    return {
      indices,
      movers,
      sectorals,
      commodities,
      currencies,
      mutualFunds,
      ipo,
      nfo,
      fiidii,
      fetchedAt,
      sourceHealth: {
        indices: indices.length ? 'live-query-fallback' : 'failed',
        movers: movers.source ? 'live-query-fallback' : 'empty',
        sectorals: sectorals.length ? 'derived-from-indices' : 'empty',
        commodities: commodities.length ? 'live-query-fallback' : 'empty',
        currencies: currencies.length ? 'live-query-fallback' : 'empty',
        mutualFunds: mutualFunds.length ? 'official-daily-sidecar' : 'empty',
        ipo: hasIPOCalendarRows(ipo) ? 'snapshot-sidecar' : 'empty',
        nfo: nfo.length ? 'snapshot-sidecar' : 'empty',
        fiidii: hasFIIDIIRows(fiidii) ? 'snapshot-sidecar' : 'empty',
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

// Reconcile independent quote observations. A publication clock is not a quote clock.
function reconcilePayloads(previous, incoming) {
  const merged = mergeQualifiedIndices(previous, incoming);
  const equityMerge = mergeQualifiedEquities(previous, incoming);
  if (!merged.indices.length && !equityMerge.equities.length) return null;
  const previousTime = parseMarketTimestamp(previous) || 0;
  const incomingTime = parseMarketTimestamp(incoming) || 0;
  const publicationAdvanced = incomingTime > previousTime;
  const current = !previous || publicationAdvanced ? incoming : previous;
  const retain = previous || {};
  const updated = incoming || {};
  const sourceHealth = normalizeSourceHealth({
    ...retain.sourceHealth,
    ...updated.sourceHealth,
  }, current.sourceMode);
  // IPO evidence must belong to the selected publication, not a prior quote
  // cache. A newer index publication without an IPO receipt proves nothing
  // about whether there are zero issues or the source was unavailable.
  const selectedIpoHealth = current?.sourceHealth?.ipo;
  sourceHealth.ipo = selectedIpoHealth
    ? normalizeSourceHealth({ ipo: selectedIpoHealth }, current.sourceMode).ipo
    : { status: 'unknown', provider: 'IPO source', mode: current.sourceMode,
        message: 'No IPO source receipt for the selected publication.' };
  // Empty or failed independent sidecars cannot clear valid retained data.
  const arrayFrom = (key) => (Array.isArray(updated[key]) && updated[key].length ? updated[key] : (retain[key] || []));
  // Only qualified same-session observations can generate tracked-share movers.
  const movers = equityMerge.equities.length
    ? deriveTrackedMovers(equityMerge.equities)
    : ((updated.movers?.gainers?.length || updated.movers?.losers?.length)
      ? updated.movers : (retain.movers || MARKET_SEED.movers));
  const payload = {
    ...retain,
    ...updated,
    indices: merged.indices,
    globalIndices: merged.globalIndices,
    sectorals: merged.sectorals,
    equities: equityMerge.equities,
    equityCoverage: (Array.isArray(updated.equities) || Array.isArray(retain.equities))
      ? {
        ...equityMerge.coverage,
        // Displayable includes eligible retained shares; source acquired is only this publication.
        sourceAcquiredCount: Array.isArray(updated.equities) ? qualifyTrackedEquities(updated.equities).length : null,
        retainedCount: equityMerge.equities.filter((row) => !qualifyTrackedEquities(updated.equities)
          .some((fresh) => fresh.id === row.id && fresh.value === row.value && fresh.quoteAt === row.quoteAt)).length,
      } : null,
    equityMerge: equityMerge.summary,
    movers,
    commodities: arrayFrom('commodities'),
    currencies: arrayFrom('currencies'),
    mutualFunds: arrayFrom('mutualFunds'),
    ipo: current?.ipo || MARKET_SEED.ipo,
    ipoLastCheckedAt: current?.ipoLastCheckedAt || null,
    sourceMode: current.sourceMode,
    fetchedAt: parseMarketTimestamp(current),
    generatedAt: current.generatedAt || current.generated_at || null,
    sourceHealth,
    errors: { ...retain.errors, ...updated.errors },
    quoteMerge: merged.summary,
  };
  return { payload, changed: merged.changed || equityMerge.changed, publicationAdvanced };
}

function eligibleMarketData(data) {
  return !shouldRejectMarketPayload(data, { maxAgeMs: STALE_CACHE_MAX_AGE, allowSeed: false }).reject
    ? sanitizeMarketPayload(data) : null;
}

async function storeMarketData(data) {
  try {
    await setIdbCache(CACHE_KEY, data);
  } catch {
    // A storage error must not undo a successful revalidation.
  }
  return data;
}

export async function fetchAllMarketData({ forceRefresh = false, previousData = null, allowLegacyLive = false } = {}) {
  // Do not rehydrate legacy quotes or request the old snapshot in free-only mode.
  if (MARKET_FREE_OPEN_ONLY) return freeOpenMarketPayload();
  if (!forceRefresh) {
    const freshCache = await readMarketCache();
    if (freshCache) return sanitizeMarketPayload(freshCache, 'cache', { sourceHealth: { cache: 'cache' } });
  }

  const [rawSnapshot, staleCache] = await Promise.all([
    fetchPublicJson('data/market_snapshot.json'),
    readMarketCache({ allowStale: true }),
  ]);
  const snapshot = normalizeSnapshot(rawSnapshot);
  const previous = eligibleMarketData(previousData);
  const eligibleStored = eligibleMarketData(staleCache);
  // Merge two retained datasets by instrument, not by their maximum index time.
  const baseline = previous && eligibleStored
    ? (parseMarketTimestamp(previous) >= parseMarketTimestamp(eligibleStored)
      ? reconcilePayloads(eligibleStored, previous)?.payload
      : reconcilePayloads(previous, eligibleStored)?.payload)
    : (previous || eligibleStored);

  const verifiedSnapshot = snapshot ? reconcilePayloads(baseline, snapshot) : null;
  if (snapshot?.sourceMode === 'snapshot' && verifiedSnapshot &&
      (!baseline || verifiedSnapshot.publicationAdvanced || verifiedSnapshot.changed)) {
    return storeMarketData({ ...verifiedSnapshot.payload, sourceMode: 'snapshot' });
  }

  const fallback = verifiedSnapshot?.payload || baseline;
  if (!forceRefresh && baseline && !verifiedSnapshot?.changed) {
    return sanitizeMarketPayload(fallback, 'stale-cache', {
      sourceHealth: { cache: 'stale-cache' },
      errors: { feed: 'Showing previously collected market data.' },
    });
  }

  // Public browser proxy cascades are not a qualified production data contract.
  // Diagnostic access requires an explicit opt-in and cannot run in a production build.
  if (!allowLegacyLive || import.meta.env?.PROD === true) {
    if (snapshot && verifiedSnapshot) {
      return sanitizeMarketPayload(verifiedSnapshot.payload, snapshot.sourceMode, {
        sourceHealth: { snapshot: snapshot.sourceHealth?.snapshot || { status: snapshot.sourceMode } },
      });
    }
    if (fallback) return sanitizeMarketPayload(fallback, 'stale-cache', {
      sourceHealth: { cache: 'stale-cache' },
      errors: { feed: 'Market publication unavailable. Showing eligible previously collected quotes.' },
    });
    return { ...MARKET_SEED, sourceMode: 'failed',
      sourceHealth: normalizeSourceHealth({ indices: 'failed', equities: 'failed' }, 'failed'),
      errors: { feed: 'Market quotes are currently unavailable.' } };
  }

  const live = await fetchLiveMarketBundle(rawSnapshot);
  const normalized = sanitizeMarketPayload(live, 'live');
  const liveReconciliation = normalized ? reconcilePayloads(fallback, normalized) : null;
  if (liveReconciliation && (!fallback || liveReconciliation.changed)) {
    return storeMarketData({ ...liveReconciliation.payload, sourceMode: 'live' });
  }

  if (fallback) {
    const mode = fallback === verifiedSnapshot?.payload && !baseline ? 'stale-snapshot' : 'stale-cache';
    return sanitizeMarketPayload(fallback, mode, {
      sourceHealth: { [mode === 'stale-snapshot' ? 'snapshot' : 'cache']: mode },
      errors: { feed: 'Market refresh failed. Showing the last available market data.' },
    });
  }

  return {
    ...MARKET_SEED,
    mutualFunds: live.mutualFunds,
    ipo: live.ipo,
    nfo: live.nfo,
    fiidii: live.fiidii,
    sourceMode: 'failed',
    sourceHealth: normalizeSourceHealth({
      ...live.sourceHealth,
      indices: 'failed',
      movers: 'empty',
      sectorals: 'empty',
      commodities: 'empty',
      currencies: 'empty',
    }, 'failed'),
    errors: { feed: 'Market quotes are currently unavailable.' },
  };
}
