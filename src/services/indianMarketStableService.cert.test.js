import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllMarketData, fetchIPOData, fetchMutualFunds, MARKET_SEED } from './indianMarketStableService.js';
import { getIdbCache, setIdbCache } from './indexedDbCache.js';
import { MARKET_CACHE_SCHEMA_VERSION, MARKET_SERVICE_CACHE_KEY } from './marketTrust.js';

// These cases certify the isolated legacy refresh machinery, not free-only mode.
vi.mock('./marketFreeOpenPolicy.js', async (importOriginal) => ({
  ...await importOriginal(), MARKET_FREE_OPEN_ONLY: false,
}));

vi.mock('./indexedDbCache.js', () => ({
  getIdbCache: vi.fn().mockResolvedValue(null),
  setIdbCache: vi.fn().mockResolvedValue(undefined),
}));

function mockJsonResponse(payload, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(payload),
  });
}

describe('Indian market stable sidecar feeds', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads official mutual fund NAV sidecar rows when the market snapshot is expired', async () => {
    vi.stubGlobal('fetch', vi.fn(() => mockJsonResponse({
      generatedAt: new Date().toISOString(),
      mutualFunds: [
        {
          schemeCode: '119550',
          name: 'Aditya Birla Sun Life Banking & PSU Debt Fund',
          category: 'Aditya Birla Sun Life Mutual Fund',
          nav: '394.7547',
          navDate: '26-May-2026',
        },
      ],
    })));

    const funds = await fetchMutualFunds();

    expect(funds).toHaveLength(1);
    expect(funds[0]).toMatchObject({
      code: '119550',
      name: 'Aditya Birla Sun Life Banking & PSU Debt Fund',
      nav: 394.7547,
      direction: 'neutral',
      sourceMode: 'official-daily',
    });
  });

  it('rejects stale mutual fund sidecar rows instead of reviving expired data', async () => {
    vi.stubGlobal('fetch', vi.fn(() => mockJsonResponse({
      generatedAt: '2026-01-01T00:00:00Z',
      mutualFunds: [
        { schemeCode: 'old', name: 'Old Fund', nav: 1 },
      ],
    })));

    await expect(fetchMutualFunds()).resolves.toEqual([]);
  });

  it('returns an empty IPO calendar when the snapshot has no calendar rows', async () => {
    vi.stubGlobal('fetch', vi.fn(() => mockJsonResponse({
      generatedAt: new Date().toISOString(),
      ipo: { upcoming: [], live: [], recent: [] },
    })));

    await expect(fetchIPOData()).resolves.toEqual({ upcoming: [], live: [], recent: [] });
  });

  it('keeps the dated India publication during overnight gaps and preserves empty boards', async () => {
    const publishedAt = Date.now() - 14 * 60 * 60 * 1000;
    const quoteAt = new Date(publishedAt - 60 * 60 * 1000).toISOString();
    const read = vi.fn(() => mockJsonResponse({
      schemaVersion: 'market-india-1',
      fetchedAt: publishedAt,
      indices: ['NIFTY 50', 'SENSEX', 'BANK NIFTY'].map(name => ({ name, value: '100', quoteAt })),
      commodities: [],
      currencies: [],
      sectorals: [{ name: 'BANK NIFTY', value: '100', quoteAt }],
      sourceHealth: { nfo: { status: 'failed', provider: 'AMFI' } },
    }));
    vi.stubGlobal('fetch', read);

    const data = await fetchAllMarketData();
    expect(read).toHaveBeenCalledTimes(1);
    expect(data).toMatchObject({
      sourceMode: 'snapshot',
      publicationSchema: 'market-india-1',
      fetchedAt: publishedAt,
      commodities: [],
      currencies: [],
      sectorals: [{ name: 'BANK NIFTY', value: '100', quoteAt }],
      sourceHealth: { nfo: { status: 'failed', provider: 'AMFI' } },
    });
    expect(data.indices[0].quoteAt).toBe(quoteAt);
  });
});

function datedMarketData(fetchedAt, quoteAt = fetchedAt) {
  return {
    schemaVersion: MARKET_CACHE_SCHEMA_VERSION,
    sourceMode: 'snapshot',
    fetchedAt,
    generatedAt: new Date(fetchedAt).toISOString(),
    indices: [{
      name: 'NIFTY 50',
      symbol: '^NSEI',
      value: '25227.95',
      quoteAt: new Date(quoteAt).toISOString(),
    }],
  };
}

describe('manual market revalidation', () => {
  beforeEach(() => {
    getIdbCache.mockReset().mockResolvedValue(null);
    setIdbCache.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads a newer publication over a fresh local cache and preserves publication and quote times', async () => {
    const now = Date.now();
    const cached = datedMarketData(now - 120_000, now - 180_000);
    const published = { ...datedMarketData(now - 60_000, now - 90_000), schemaVersion: 'market-india-1' };
    getIdbCache.mockResolvedValue(cached);
    const read = vi.fn(() => mockJsonResponse(published));
    vi.stubGlobal('fetch', read);

    await expect(fetchAllMarketData()).resolves.toMatchObject({
      sourceMode: 'cache',
      fetchedAt: cached.fetchedAt,
    });
    expect(read).not.toHaveBeenCalled();

    const data = await fetchAllMarketData({ forceRefresh: true });
    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith(expect.stringContaining('market_snapshot.json'), {
      cache: 'no-cache',
      signal: expect.any(AbortSignal),
    });
    expect(data).toMatchObject({
      sourceMode: 'snapshot',
      fetchedAt: published.fetchedAt,
      indices: published.indices,
    });
    expect(setIdbCache).toHaveBeenCalledWith(MARKET_SERVICE_CACHE_KEY, data);
  });

  it('permits the legacy quote diagnostic only with explicit opt-in and real provider timestamps', async () => {
    const now = Date.now();
    const previous = datedMarketData(now - 120_000, now - 180_000);
    const latestSeconds = Math.floor((now - 30_000) / 1000);
    const read = vi.fn((url) => {
      if (url.endsWith('market_snapshot.json')) return mockJsonResponse(previous);
      if (url.includes('chart/%5ENSEI?')) return mockJsonResponse({
        chart: { result: [{ meta: { regularMarketPrice: 25300, regularMarketTime: latestSeconds } }] },
      });
      return mockJsonResponse({
        chart: { result: [{ meta: { regularMarketPrice: 99999 } }] },
        quoteResponse: { result: [{ regularMarketPrice: 99999 }] },
      });
    });
    vi.stubGlobal('fetch', read);

    const data = await fetchAllMarketData({ forceRefresh: true, previousData: previous, allowLegacyLive: true });

    expect(data).toMatchObject({
      sourceMode: 'live',
      fetchedAt: latestSeconds * 1000,
      generatedAt: new Date(latestSeconds * 1000).toISOString(),
      indices: [{
        symbol: '^NSEI',
        timestamp: latestSeconds * 1000,
        quoteAt: new Date(latestSeconds * 1000).toISOString(),
      }],
      movers: { gainers: [], losers: [] },
      commodities: [],
      currencies: [],
      sectorals: [],
      sourceHealth: {
        indices: { status: 'live' },
        commodities: { status: 'empty' },
      },
    });
    expect(data.indices).toHaveLength(1);
  });

  it('keeps the newest usable stale quote and filters seeded prices from historic caches', async () => {
    const now = Date.now();
    const previous = datedMarketData(now - 2 * 3_600_000, now - 3 * 3_600_000);
    const seed = { name: 'Sample', value: '99', price: '99', sourceMode: 'seed' };
    previous.indices.push(seed);
    previous.globalIndices = [seed];
    previous.movers = { gainers: [seed], losers: [seed] };
    previous.sectorals = [seed];
    previous.commodities = [{ name: 'Sample', value: '99', source: 'seed' }];
    previous.currencies = [{ name: 'Sample', value: '99', source: 'SEED' }];
    getIdbCache.mockResolvedValue(datedMarketData(now - 4 * 3_600_000));
    vi.stubGlobal('fetch', vi.fn(() => mockJsonResponse(null, false)));

    expect(await fetchAllMarketData({ forceRefresh: true, previousData: previous })).toMatchObject({
      sourceMode: 'stale-cache',
      fetchedAt: previous.fetchedAt,
      generatedAt: previous.generatedAt,
      indices: previous.indices.slice(0, 1),
      movers: { gainers: [], losers: [] },
      globalIndices: [],
      sectorals: [],
      commodities: [],
      currencies: [],
      errors: { feed: expect.stringContaining('Market publication unavailable') },
    });
    expect(setIdbCache).not.toHaveBeenCalled();
  });

  it('does not surface seeded or untimed prices after all providers fail', async () => {
    const now = Date.now();
    const cached = datedMarketData(now);
    getIdbCache.mockResolvedValue({ ...cached, sourceMode: 'seed' });
    vi.stubGlobal('fetch', vi.fn((url) => mockJsonResponse(
      url.endsWith('market_snapshot.json') ? { indices: cached.indices } : null,
    )));

    const data = await fetchAllMarketData({ forceRefresh: true });

    expect(data).toMatchObject({
      sourceMode: 'failed',
      indices: [],
      commodities: [],
      currencies: [],
      errors: { feed: expect.stringContaining('unavailable') },
    });
    expect(data.fetchedAt).toBeUndefined();
    expect(data.generatedAt).toBeUndefined();
    expect(MARKET_SEED.indices).toEqual([]);
    expect(MARKET_SEED.commodities).toEqual([]);
    expect(setIdbCache).not.toHaveBeenCalled();
  });

  it.each(['newer global quote', 'newer publication with partial coverage', 'mixed India quote ages'])(
    'reconciles %s by instrument without losing eligible India observations', async scenario => {
      const now = Date.now();
      const previous = datedMarketData(now - 120_000, now - 180_000);
      previous.indices.push({ name: 'SENSEX', symbol: '^BSESN', value: '82000', quoteAt: previous.indices[0].quoteAt });
      const candidate = { ...datedMarketData(now - 30_000, now - 180_000), schemaVersion: 'market-india-1' };
      if (scenario === 'newer global quote') {
        candidate.indices[0].quoteAt = new Date(now - 3600_000).toISOString();
        candidate.indices.push({ name: 'S&P 500', symbol: '^GSPC', value: '6000', quoteAt: new Date(now - 1000).toISOString() });
      }
      if (scenario === 'mixed India quote ages') {
        candidate.indices[0] = { ...candidate.indices[0], value: '25300', quoteAt: new Date(now - 1000).toISOString() };
        candidate.indices.push({ ...previous.indices[1], value: '81000', quoteAt: new Date(now - 3600_000).toISOString() });
      }
      vi.stubGlobal('fetch', vi.fn(url => mockJsonResponse(url.endsWith('market_snapshot.json') ? candidate : null)));

      const data = await fetchAllMarketData({ forceRefresh: true, previousData: previous });
      expect(data.sourceMode).toBe('snapshot');
      expect(data.fetchedAt).toBe(candidate.fetchedAt); // Publication clock; not a quote timestamp.
      const sensex = data.indices.find(row => row.symbol === '^BSESN');
      expect(sensex).toEqual(previous.indices[1]);
      if (scenario === 'newer global quote') {
        expect(data.indices).toHaveLength(3);
        expect(data.globalIndices.map(row => row.symbol)).toEqual(['^GSPC']);
        expect(data.indices.find(row => row.symbol === '^NSEI')).toEqual(previous.indices[0]);
      } else {
        expect(data.indices).toHaveLength(2);
        expect(data.indices.find(row => row.symbol === '^NSEI')).toEqual(
          scenario === 'mixed India quote ages' ? candidate.indices[0] : previous.indices[0]
        );
      }
      expect(setIdbCache).toHaveBeenCalledTimes(1);
    },
  );

  it.each([0, 60_000])('retains omitted SENSEX when a partial live quote advances by %s ms', async advanceMs => {
    const now = Math.floor(Date.now() / 1000) * 1000;
    const previous = datedMarketData(now - 120_000, now - 180_000);
    previous.indices.push({ name: 'SENSEX', symbol: '^BSESN', value: '82000', quoteAt: previous.indices[0].quoteAt });
    vi.stubGlobal('fetch', vi.fn(url => {
      if (url.endsWith('market_snapshot.json')) return mockJsonResponse(previous);
      if (url.includes('chart/%5ENSEI?')) return mockJsonResponse({ chart: { result: [{ meta: {
        regularMarketPrice: 25300, regularMarketTime: (now - 180_000 + advanceMs) / 1000,
      } }] } });
      return mockJsonResponse(null, false);
    }));
    const data = await fetchAllMarketData({ forceRefresh: true, previousData: previous, allowLegacyLive: true });
    expect(data.indices).toHaveLength(2);
    expect(data.indices.find(row => row.symbol === '^BSESN')).toEqual(previous.indices[1]);
    if (advanceMs === 0) {
      expect(data.sourceMode).toBe('stale-cache');
      expect(data.indices.find(row => row.symbol === '^NSEI')).toEqual(previous.indices[0]);
      expect(setIdbCache).not.toHaveBeenCalled();
    } else {
      expect(data.sourceMode).toBe('live');
      expect(data.indices.find(row => row.symbol === '^NSEI')).toMatchObject({
        symbol: '^NSEI', value: expect.any(String),
        quoteAt: new Date(now - 180_000 + advanceMs).toISOString(),
      });
      expect(setIdbCache).toHaveBeenCalledTimes(1);
    }
  });

  it('applies the same 24-hour expiry to in-memory data as persisted cache data', async () => {
    const previous = datedMarketData(Date.now() - 25 * 3600_000);
    vi.stubGlobal('fetch', vi.fn(() => mockJsonResponse(null, false)));
    const data = await fetchAllMarketData({ forceRefresh: true, previousData: previous });
    expect(data).toMatchObject({ sourceMode: 'failed', indices: [] });
    expect(data.fetchedAt).toBeUndefined();
    expect(setIdbCache).not.toHaveBeenCalled();
  });

  it('aborts hanging transports at the bundle deadline without starting more requests', async () => {
    vi.useFakeTimers();
    const signals = [];
    vi.stubGlobal('fetch', vi.fn((url, { signal }) => {
      if (url.includes('snapshot.json')) return mockJsonResponse(null, false);
      signals.push(signal);
      return new Promise(() => {});
    }));

    const request = fetchAllMarketData({ forceRefresh: true, allowLegacyLive: true });
    await vi.advanceTimersByTimeAsync(12_000);

    await expect(request).resolves.toMatchObject({ sourceMode: 'failed' });
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    const requestCount = signals.length;
    await vi.advanceTimersByTimeAsync(40_000);
    expect(signals).toHaveLength(requestCount);
  });
});

describe('no implicit browser proxy waterfall', () => {
  it('does not query any Yahoo or public proxy when the publication fails', async () => {
    const fetcher = vi.fn(() => mockJsonResponse(null, false));
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchAllMarketData({ forceRefresh: true });
    expect(result.sourceMode).toBe('failed');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain('market_snapshot.json');
  });
});


describe('independent IPO source receipt reconciliation', () => {
  beforeEach(() => {
    getIdbCache.mockReset().mockResolvedValue(null);
    setIdbCache.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  const prior = (now) => ({
    ...datedMarketData(now-120_000, now-180_000),
    ipo: { live: [{name:'Previous Issue',openDate:'2026-11-19',closeDate:'2026-11-25'}],upcoming:[],recent:[] },
    sourceHealth: {ipo:{status:'snapshot',provider:'BSE'}},
    ipoLastCheckedAt:new Date(now-120_000).toISOString()
  });

  it('newer market publication with no IPO receipt cannot inherit previous success', async () => {
    const now=Date.now();
    const incoming={...datedMarketData(now-60_000, now-80_000),schemaVersion:'market-india-1',
      ipo: {live:[],upcoming:[],recent:[]},sourceHealth:{}};
    vi.stubGlobal('fetch',vi.fn(() => mockJsonResponse(incoming)));
    const next=await fetchAllMarketData({forceRefresh:true,previousData:prior(now)});
    expect(next.sourceHealth.ipo.status).toBe('unknown');
    expect(next.ipoLastCheckedAt).toBeNull();
    expect(next.ipo.live).toHaveLength(0);
  });

  it('fresh failed IPO source overrides prior success without claiming zero current issues', async () => {
    const now=Date.now();
    const incoming={...datedMarketData(now-60_000, now-80_000),schemaVersion:'market-india-1',
      ipo: {live:[],upcoming:[],recent:[]},
      sourceHealth:{ipo:{status:'failed',provider:'BSE'}},
      ipoLastCheckedAt:new Date(now-60_000).toISOString()};
    vi.stubGlobal('fetch',vi.fn(() => mockJsonResponse(incoming)));
    const next=await fetchAllMarketData({forceRefresh:true,previousData:prior(now)});
    expect(next.sourceHealth.ipo.status).toBe('failed');
    expect(next.ipoLastCheckedAt).toBe(incoming.ipoLastCheckedAt);
    expect(next.ipo.live).toHaveLength(0);
  });
});
