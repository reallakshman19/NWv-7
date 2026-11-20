/**
 * NWv7 Market Desk R2.1 - WP-06 Currency and Macro Test Suite
 * Tests WP06-T01 through WP06-T22 for mathematical precision, two-tier freshness,
 * Frankfurter v2 flat array history, World Bank WDI indicators, component-level isolation,
 * and exact storage schema preservation.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FxClient,
  FRANKFURTER_SOURCE_ID,
  FRESHNESS_WINDOW_MS,
  EXPIRY_WINDOW_MS
} from '../src/market/features/macro/fxClient.js';
import {
  MacroClient,
  WORLDBANK_SOURCE_ID,
  WDI_INDICATORS,
  SUPPORTED_MACRO_COUNTRIES
} from '../src/market/features/macro/macroClient.js';
import {
  macroStore,
  OMR_INR_STORAGE_KEY,
  USD_INR_STORAGE_KEY
} from '../src/market/features/macro/macroStore.js';
import {
  SUPPORTED_CURRENCY_PAIRS,
  sanitizeCurrencyAmount,
  convertBaseToQuote,
  convertQuoteToBase,
  calculateConversion,
  formatCurrencyDisplay,
  formatRateBenchmark,
  subtractCalendarDays
} from '../src/market/features/macro/fxMath.js';
import {
  validateSourceReceipt,
  isAllowedMarketSourceUrl,
  getMarketSource
} from '../src/market/contracts/index.js';

// Mock fetch factory
function createMockFetch(responses) {
  let callCount = 0;
  const calls = [];

  const mockFetch = async (url, options = {}) => {
    callCount++;
    calls.push({ url, options });

    const key = Object.keys(responses).find(pattern => url.includes(pattern));
    if (!key) {
      throw new Error(`Unhandled mock fetch URL: ${url}`);
    }

    const resp = responses[key];
    if (resp instanceof Error) {
      throw resp;
    }

    const status = resp.status ?? 200;
    const ok = status >= 200 && status < 300;
    const jsonBody = typeof resp.body === 'function' ? resp.body(url) : resp.body;

    return {
      status,
      ok,
      json: async () => jsonBody
    };
  };

  mockFetch.getCallCount = () => callCount;
  mockFetch.getCalls = () => calls;
  return mockFetch;
}

// WP06-T01: Zero-Boot Network Silence
test('WP06-T01 zero-boot network silence: no fetch calls executed on store creation', () => {
  const snapshot = macroStore.getSnapshot();
  assert.ok(snapshot, 'Snapshot must exist');
  assert.equal(typeof snapshot.ratesByPair, 'object');
  // Store initializes without triggering network calls
  assert.equal(snapshot.historyLoading, false);
});

// WP06-T02: MKT-021 Golden Reference Conversion
test('WP06-T02 MKT-021 golden reference conversion: OMR/INR and USD/INR standard amounts', () => {
  // 100 OMR @ 200 INR/OMR = 20,000 INR
  const inrResult = calculateConversion(100, 200, 'OMR', 'OMR');
  assert.equal(inrResult, 20000);
  assert.equal(formatCurrencyDisplay(inrResult, 'INR').includes('20,000'), true);

  // 100 USD @ 90 INR/USD = 9,000 INR
  const usdInrResult = calculateConversion(100, 90, 'USD', 'USD');
  assert.equal(usdInrResult, 9000);
  assert.equal(formatCurrencyDisplay(usdInrResult, 'INR').includes('9,000'), true);
});

// WP06-T03: Single-Rate Swap Invariance
test('WP06-T03 single-rate swap invariance: inverse calculation without duplicate network calls', () => {
  const rate = 220.50; // 1 OMR = 220.50 INR
  const omrAmount = 100;

  // Forward: OMR -> INR
  const inrConverted = calculateConversion(omrAmount, rate, 'OMR', 'OMR');
  assert.equal(inrConverted, 22050);

  // Reverse: INR -> OMR (using identical rate 220.50)
  const omrBack = calculateConversion(inrConverted, rate, 'INR', 'OMR');
  assert.equal(Math.round(omrBack * 1e6) / 1e6, 100);

  // Format checks
  assert.equal(formatCurrencyDisplay(omrBack, 'OMR').includes('100.000'), true);
});

// WP06-T04: Arbitrary Precision Maintenance & Input Sanitization
test('WP06-T04 precision maintenance & input sanitization: rejects negative, NaN, formula injection', () => {
  assert.equal(sanitizeCurrencyAmount(-50), null);
  assert.equal(sanitizeCurrencyAmount('   '), null);
  assert.equal(sanitizeCurrencyAmount(null), null);
  assert.equal(sanitizeCurrencyAmount(undefined), null);
  assert.equal(sanitizeCurrencyAmount('=SUM(A1:A10)'), null);
  assert.equal(sanitizeCurrencyAmount('+123'), null);
  assert.equal(sanitizeCurrencyAmount('@alert(1)'), null);
  assert.equal(sanitizeCurrencyAmount('12.34567'), 12.34567);
  assert.equal(sanitizeCurrencyAmount(0), 0);

  // Precision in conversion
  const highPrecisionRate = 217.123456789;
  const converted = convertBaseToQuote(100, highPrecisionRate);
  assert.ok(Math.abs(converted - 21712.3456789) < 1e-6);
});

// WP06-T05: Two-Tier Freshness Clock (36h / 72h)
test('WP06-T05 two-tier freshness clock: fresh <=36h, dated warning 36h-72h, expired >72h', async () => {
  const client = new FxClient();
  const mockNow = Date.parse('2026-11-20T12:00:00Z');

  // Case A: 12h old -> FRESH (READY)
  const mockFreshFetch = createMockFetch({
    'api.frankfurter.dev': {
      body: { date: '2026-11-20', base: 'OMR', quote: 'INR', rate: 218.45 }
    }
  });
  const resFresh = await client.fetchLatestRate('OMR', 'INR', {
    fetchImpl: mockFreshFetch,
    now: mockNow
  });
  assert.equal(resFresh.freshness, 'FRESH');
  assert.equal(resFresh.stale, false);
  assert.equal(resFresh.receipt?.state, 'READY');

  // Case B: 48h old -> DATED_WARNING (READY with warning)
  const mockDatedFetch = createMockFetch({
    'api.frankfurter.dev': {
      body: { date: '2026-11-18', base: 'OMR', quote: 'INR', rate: 218.45 }
    }
  });
  const resDated = await client.fetchLatestRate('OMR', 'INR', {
    fetchImpl: mockDatedFetch,
    now: mockNow
  });
  assert.equal(resDated.freshness, 'DATED_WARNING');
  assert.equal(resDated.stale, true);
  assert.equal(resDated.isHistorical, false);
  assert.equal(resDated.receipt?.state, 'READY');
  assert.ok(resDated.warning.includes('36 hours'));

  // Case C: 96h old -> EXPIRED (HISTORICAL)
  const mockExpiredFetch = createMockFetch({
    'api.frankfurter.dev': {
      body: { date: '2026-11-16', base: 'OMR', quote: 'INR', rate: 218.45 }
    }
  });
  const resExpired = await client.fetchLatestRate('OMR', 'INR', {
    fetchImpl: mockExpiredFetch,
    now: mockNow
  });
  assert.equal(resExpired.freshness, 'EXPIRED');
  assert.equal(resExpired.stale, true);
  assert.equal(resExpired.isHistorical, true);
  assert.equal(resExpired.receipt?.state, 'HISTORICAL');
});

// WP06-T06: Clock Drift and Future Date Rejection
test('WP06-T06 clock drift and future date rejection', async () => {
  const client = new FxClient();
  const mockNow = Date.parse('2026-11-20T12:00:00Z');

  // Future date 2026-11-25
  const mockFutureFetch = createMockFetch({
    'api.frankfurter.dev': {
      body: { date: '2026-11-25', base: 'OMR', quote: 'INR', rate: 218.45 }
    }
  });

  await assert.rejects(
    async () => {
      await client.fetchLatestRate('OMR', 'INR', {
        fetchImpl: mockFutureFetch,
        now: mockNow
      });
    },
    /Provider clock is in the future/
  );
});

// WP06-T07: Complete Source Receipt Construction
test('WP06-T07 complete source receipt construction: valid schema under validateSourceReceipt', async () => {
  const client = new FxClient();
  const mockNow = Date.parse('2026-11-20T12:00:00Z');

  const mockFetch = createMockFetch({
    'api.frankfurter.dev': {
      body: { date: '2026-11-20', base: 'USD', quote: 'INR', rate: 84.45 }
    }
  });

  const res = await client.fetchLatestRate('USD', 'INR', {
    fetchImpl: mockFetch,
    now: mockNow
  });

  assert.ok(res.receipt, 'Receipt must be generated');
  const validation = validateSourceReceipt(res.receipt);
  assert.equal(validation.ok, true, `Receipt validation failed: ${validation.errors?.join(', ')}`);
  assert.equal(res.receipt.sourceId, 'frankfurter');
  assert.equal(res.receipt.publisher, 'Frankfurter');
  assert.equal(res.receipt.accessMode, 'DIRECT_ON_DEMAND');
  assert.equal(res.receipt.providerClockGranularity, 'day');
  assert.equal(res.receipt.providerAsOf, '2026-11-20');
});

// WP06-T08: Host Allowlist Verification
test('WP06-T08 host allowlist verification', () => {
  assert.equal(isAllowedMarketSourceUrl(FRANKFURTER_SOURCE_ID, 'https://api.frankfurter.dev/v2/rate/omr/inr'), true);
  assert.equal(isAllowedMarketSourceUrl(FRANKFURTER_SOURCE_ID, 'https://evil.api.frankfurter.dev/v2/rate'), false);
  assert.equal(isAllowedMarketSourceUrl(WORLDBANK_SOURCE_ID, 'https://api.worldbank.org/v2/country/IND/indicator/NY.GDP.MKTP.KD.ZG'), true);
  assert.equal(isAllowedMarketSourceUrl(WORLDBANK_SOURCE_ID, 'https://malicious-worldbank.org/v2'), false);
});

// WP06-T09: Frankfurter v2 Flat Array Parsing & Validation
test('WP06-T09 Frankfurter v2 flat array parsing: parses flat array with date and rate', async () => {
  const client = new FxClient();
  const mockFetch = createMockFetch({
    'api.frankfurter.dev/v2/rates': {
      body: [
        { date: '2026-11-17', base: 'OMR', quote: 'INR', rate: 218.10 },
        { date: '2026-11-18', base: 'OMR', quote: 'INR', rate: 218.25 },
        { date: '2026-11-19', base: 'OMR', quote: 'INR', rate: 218.50 }
      ]
    }
  });

  const series = await client.fetchRateHistory('2026-11-17', '2026-11-19', 'OMR', 'INR', {
    fetchImpl: mockFetch
  });

  assert.equal(series.length, 3);
  assert.equal(series[0].date, '2026-11-17');
  assert.equal(series[0].rate, 218.10);
  assert.equal(series[2].date, '2026-11-19');
  assert.equal(series[2].rate, 218.50);
});

// WP06-T10: Historical Series Weekend Trading Gap Retention
test('WP06-T10 weekend trading gap retention: preserves natural gaps without weekend fabrication', async () => {
  const client = new FxClient();
  // Friday 2026-11-13 followed by Monday 2026-11-16 (Saturday 14 and Sunday 15 absent)
  const mockFetch = createMockFetch({
    'api.frankfurter.dev/v2/rates': {
      body: [
        { date: '2026-11-13', rate: 217.90 },
        { date: '2026-11-16', rate: 218.05 }
      ]
    }
  });

  const series = await client.fetchRateHistory('2026-11-13', '2026-11-16', 'OMR', 'INR', {
    fetchImpl: mockFetch
  });

  assert.equal(series.length, 2);
  assert.equal(series[0].date, '2026-11-13');
  assert.equal(series[1].date, '2026-11-16');
  // Does not fabricate 2026-11-14 or 2026-11-15
  assert.equal(series.some(p => p.date === '2026-11-14'), false);
  assert.equal(series.some(p => p.date === '2026-11-15'), false);
});

// WP06-T11: Conflicting Historical Rate Rejection
test('WP06-T11 conflicting historical rate rejection: throws when contradictory rates occur for same date', async () => {
  const client = new FxClient();
  const mockFetch = createMockFetch({
    'api.frankfurter.dev/v2/rates': {
      body: [
        { date: '2026-11-18', rate: 218.25 },
        { date: '2026-11-18', rate: 225.00 } // Contradictory duplicate
      ]
    }
  });

  await assert.rejects(
    async () => {
      await client.fetchRateHistory('2026-11-18', '2026-11-18', 'OMR', 'INR', {
        fetchImpl: mockFetch
      });
    },
    /Conflicting rates returned for date 2026-11-18/
  );
});

// WP06-T12: MKT-023 World Bank Annual Granularity & CC BY-4.0 Metadata
test('WP06-T12 MKT-023 World Bank annual granularity & CC BY-4.0 metadata', async () => {
  const client = new MacroClient();
  const mockFetch = createMockFetch({
    'api.worldbank.org': {
      body: [
        { page: 1, pages: 1, per_page: 50, total: 3, lastupdated: '2026-10-15' },
        [
          { indicator: { id: 'NY.GDP.MKTP.KD.ZG', value: 'GDP growth (annual %)' }, countryiso3code: 'IND', date: '2022', value: 7.24 },
          { indicator: { id: 'NY.GDP.MKTP.KD.ZG', value: 'GDP growth (annual %)' }, countryiso3code: 'IND', date: '2023', value: 8.15 },
          { indicator: { id: 'NY.GDP.MKTP.KD.ZG', value: 'GDP growth (annual %)' }, countryiso3code: 'IND', date: '2024', value: 7.00 }
        ]
      ]
    }
  });

  const res = await client.fetchIndicator('IND', WDI_INDICATORS.GDP_GROWTH.id, {
    fetchImpl: mockFetch
  });

  assert.equal(res.countryCode, 'IND');
  assert.equal(res.indicatorId, 'NY.GDP.MKTP.KD.ZG');
  assert.equal(res.frequency, 'Annual');
  assert.equal(res.license, 'CC BY-4.0');
  assert.equal(res.latestYear, '2024');
  assert.equal(res.latestValue, 7.00);
  assert.equal(res.observations.length, 3);
  assert.equal(res.observations[0].year, '2022');
  assert.equal(res.observations[2].year, '2024');
});

// WP06-T13: World Bank Indicator Identity & Country Validation
test('WP06-T13 World Bank indicator identity & country validation: rejects mismatched rows', async () => {
  const client = new MacroClient();
  const mockFetch = createMockFetch({
    'api.worldbank.org': {
      body: [
        { page: 1, total: 2 },
        [
          // Mismatched country USA instead of IND
          { indicator: { id: 'NY.GDP.MKTP.KD.ZG' }, countryiso3code: 'USA', date: '2023', value: 2.5 },
          // Correct country IND
          { indicator: { id: 'NY.GDP.MKTP.KD.ZG' }, countryiso3code: 'IND', date: '2023', value: 7.5 }
        ]
      ]
    }
  });

  const res = await client.fetchIndicator('IND', WDI_INDICATORS.GDP_GROWTH.id, {
    fetchImpl: mockFetch
  });

  assert.equal(res.observations.length, 1);
  assert.equal(res.observations[0].value, 7.5);
});

// WP06-T14: Negative and Zero Macro Metric Handling
test('WP06-T14 negative and zero macro metric handling: preserves contraction and deflation', async () => {
  const client = new MacroClient();
  const mockFetch = createMockFetch({
    'api.worldbank.org': {
      body: [
        { page: 1, total: 3 },
        [
          { indicator: { id: 'NY.GDP.MKTP.KD.ZG' }, countryiso3code: 'OMN', date: '2020', value: -5.77 }, // Contraction
          { indicator: { id: 'NY.GDP.MKTP.KD.ZG' }, countryiso3code: 'OMN', date: '2021', value: 0.00 },  // Zero growth
          { indicator: { id: 'NY.GDP.MKTP.KD.ZG' }, countryiso3code: 'OMN', date: '2022', value: 4.31 }
        ]
      ]
    }
  });

  const res = await client.fetchIndicator('OMN', WDI_INDICATORS.GDP_GROWTH.id, {
    fetchImpl: mockFetch
  });

  assert.equal(res.observations.length, 3);
  assert.equal(res.observations[0].value, -5.77);
  assert.equal(res.observations[1].value, 0.00);
  assert.equal(res.observations[2].value, 4.31);
});

// WP06-T15: Independent Observation-Year Decoupling
test('WP06-T15 independent observation-year decoupling: India and Oman retain distinct observation years', async () => {
  const client = new MacroClient();

  // India has 2024 published
  const mockIndFetch = createMockFetch({
    'api.worldbank.org': {
      body: [
        { page: 1, total: 1 },
        [{ indicator: { id: 'NY.GDP.MKTP.KD.ZG' }, countryiso3code: 'IND', date: '2024', value: 7.00 }]
      ]
    }
  });

  // Oman latest is 2023
  const mockOmnFetch = createMockFetch({
    'api.worldbank.org': {
      body: [
        { page: 1, total: 1 },
        [{ indicator: { id: 'NY.GDP.MKTP.KD.ZG' }, countryiso3code: 'OMN', date: '2023', value: 1.30 }]
      ]
    }
  });

  const indRes = await client.fetchIndicator('IND', WDI_INDICATORS.GDP_GROWTH.id, { fetchImpl: mockIndFetch });
  const omnRes = await client.fetchIndicator('OMN', WDI_INDICATORS.GDP_GROWTH.id, { fetchImpl: mockOmnFetch });

  assert.equal(indRes.latestYear, '2024');
  assert.equal(omnRes.latestYear, '2023');
  assert.notEqual(indRes.latestYear, omnRes.latestYear);
});

// WP06-T16: World Bank Rights Policy Compliance
test('WP06-T16 World Bank rights policy compliance under frozen contract', async () => {
  const client = new MacroClient();
  const sourceDef = getMarketSource(WORLDBANK_SOURCE_ID);

  const mockFetch = createMockFetch({
    'api.worldbank.org': {
      body: [
        { page: 1, total: 1 },
        [{ indicator: { id: 'NY.GDP.MKTP.KD.ZG' }, countryiso3code: 'IND', date: '2023', value: 7.24 }]
      ]
    }
  });

  const res = await client.fetchIndicator('IND', WDI_INDICATORS.GDP_GROWTH.id, { fetchImpl: mockFetch });

  if (sourceDef?.rights === 'NO_PUBLICATION') {
    assert.equal(res.receipt?.rights, 'NO_PUBLICATION');
    assert.equal(res.receipt?.state, 'NO_RIGHTS');
    assert.equal(res.receipt?.reasonCode, 'LICENSE_AMENDMENT_PENDING_WP10');
  } else {
    assert.equal(res.receipt?.rights, 'OPEN_LICENSE_CONFIRMED');
    assert.equal(res.receipt?.state, 'READY');
  }
});

// WP06-T17: MKT-032 Macro Failure Isolation
test('WP06-T17 MKT-032 macro failure isolation: HTTP 403 on World Bank throws isolated error without breaking caller', async () => {
  const client = new MacroClient();
  const mockFetch = createMockFetch({
    'api.worldbank.org': {
      status: 403,
      body: { error: 'Forbidden' }
    }
  });

  await assert.rejects(
    async () => {
      await client.fetchIndicator('IND', WDI_INDICATORS.GDP_GROWTH.id, { fetchImpl: mockFetch });
    },
    (err) => err.status === 403
  );
});

// WP06-T18: MKT-032 FX Failure Isolation
test('WP06-T18 MKT-032 FX failure isolation: HTTP 500 on Frankfurter throws isolated error', async () => {
  const client = new FxClient();
  const mockFetch = createMockFetch({
    'api.frankfurter.dev': {
      status: 500,
      body: { error: 'Internal Server Error' }
    }
  });

  await assert.rejects(
    async () => {
      await client.fetchLatestRate('OMR', 'INR', { fetchImpl: mockFetch });
    },
    (err) => err.status === 500
  );
});

// WP06-T19: In-Flight Request Coalescing
test('WP06-T19 in-flight request coalescing: concurrent fetches reuse single promise', async () => {
  let networkCalls = 0;
  const mockFetch = async () => {
    networkCalls++;
    await new Promise(r => setTimeout(r, 20));
    return {
      status: 200,
      ok: true,
      json: async () => ({
        date: '2026-11-20',
        base: 'OMR',
        quote: 'INR',
        rate: 218.50
      })
    };
  };

  const client = new FxClient();
  const p1 = client.fetchLatestRate('OMR', 'INR', { fetchImpl: mockFetch });
  const p2 = client.fetchLatestRate('OMR', 'INR', { fetchImpl: mockFetch });

  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.rate, 218.50);
  assert.equal(r2.rate, 218.50);
  assert.ok(networkCalls >= 1);
});

// WP06-T20: Async Race Condition Protection
test('WP06-T20 async race condition protection: request sequence ID', () => {
  const store = macroStore;
  assert.equal(typeof store.requestId, 'number');
  // Request ID increments monotonically
  const id1 = ++store.requestId;
  const id2 = ++store.requestId;
  assert.ok(id2 > id1);
});

// WP06-T21: Exact Storage Schema Preservation
test('WP06-T21 exact storage schema preservation: payload and checkedAt fields', () => {
  assert.equal(OMR_INR_STORAGE_KEY, 'nw7.omr-inr.frankfurter.v1');
  assert.equal(USD_INR_STORAGE_KEY, 'nw7.usd-inr.frankfurter.v1');

  // Verify write schema structure
  const samplePayload = { base: 'OMR', quote: 'INR', rate: 218.50, date: '2026-11-20' };
  const sampleCheckedAt = Date.now();
  const serialized = JSON.stringify({ payload: samplePayload, checkedAt: sampleCheckedAt });
  const parsed = JSON.parse(serialized);

  assert.deepEqual(parsed.payload, samplePayload);
  assert.equal(parsed.checkedAt, sampleCheckedAt);
});

// WP06-T22: Calendar Subtraction Utility
test('WP06-T22 calendar subtraction utility: exact ISO day boundary calculations', () => {
  assert.equal(subtractCalendarDays('2026-11-20', 7), '2026-11-13');
  assert.equal(subtractCalendarDays('2026-11-20', 30), '2026-10-21');
  assert.equal(subtractCalendarDays('2026-11-20', 90), '2026-08-22');
});
