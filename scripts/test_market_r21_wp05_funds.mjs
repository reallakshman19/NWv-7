/**
 * Node-native test suite for WP-05 (Mutual Funds Desk & Analytics)
 * Run: node --test scripts/test_market_r21_wp05_funds.mjs
 */

import assert from 'node:assert/strict';
import { marketIsolationInput } from './market_r21_path_guard.mjs';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import {
  normalizeDateToIso,
  calendarDayDiff,
  subtractCalendarPeriod,
  sanitizeAndSortNavHistory,
  calculateTrailingReturns,
  calculateMaxDrawdown,
  calculateAnnualizedVolatility,
  alignComparativeHistory,
  DAYS_PER_YEAR
} from '../src/market/features/funds/fundMath.js';

import {
  fundClient,
  MFAPI_SOURCE_ID
} from '../src/market/features/funds/fundClient.js';

import {
  computeFundSip,
  referenceCalcSip
} from '../src/market/features/funds/fundSipAdapter.js';

import {
  SAVED_FUNDS_STORAGE_KEY,
  FUND_HISTORY_STORAGE_KEY,
  sanitizeCsvCell,
  desanitizeCsvCell,
  getIstDayKey
} from '../src/market/features/funds/fundStore.js';

test('WP05-S01 Strict Scheme Identity: Mismatched meta.scheme_code rejected fail-closed', async () => {
  // Test mock fetch returning a mismatched scheme code (requested 125497, received 125498)
  const mockFetchMismatch = async () => ({
    ok: true,
    status: 200,
    headers: new Map(),
    json: async () => ({
      status: 'SUCCESS',
      meta: {
        scheme_code: 125498, // MISMATCH!
        scheme_name: 'Different Scheme Name',
        scheme_category: 'Equity Scheme'
      },
      data: [{ date: '18-11-2026', nav: '123.45' }]
    })
  });

  await assert.rejects(
    fundClient.fetchLatestNav('125497', { fetchImpl: mockFetchMismatch }),
    /SCHEME_CODE_MISMATCH/
  );

  await assert.rejects(
    fundClient.fetchFundHistory('125497', { fetchImpl: mockFetchMismatch }),
    /SCHEME_CODE_MISMATCH/
  );

  // Success case: matching scheme code
  const mockFetchMatch = async () => ({
    ok: true,
    status: 200,
    headers: new Map(),
    json: async () => ({
      status: 'SUCCESS',
      meta: {
        scheme_code: 125497,
        scheme_name: 'HDFC Top 100 Fund - Direct Plan - Growth Option',
        scheme_category: 'Equity Scheme - Large Cap Fund',
        fund_house: 'HDFC Mutual Fund'
      },
      data: [{ date: '18-11-2026', nav: '1045.23' }]
    })
  });

  const res = await fundClient.fetchLatestNav('125497', { fetchImpl: mockFetchMatch });
  assert.equal(res.schemeCode, '125497');
  assert.equal(res.schemeName, 'HDFC Top 100 Fund - Direct Plan - Growth Option');
  assert.equal(res.plan, 'Direct');
  assert.equal(res.option, 'Growth');
  assert.equal(res.nav, 1045.23);
  assert.equal(res.date, '2026-11-18');
  assert.equal(res.receipt?.sourceId, MFAPI_SOURCE_ID);
  assert.equal(res.receipt?.state, 'READY');
});

test('WP05-S02 Trailing Returns: 7-day lookback window algorithm selection', () => {
  // Scenario:
  // End observation: 2026-11-20, NAV 110.00
  // Target 1Y start date: 2025-11-20
  // Candidates:
  // - 2025-11-25: NAV 104 -> REJECTED (after target date)
  // - 2025-11-19: NAV 100 -> ACCEPTED (1 day before target date, within 7-day window)
  // - 2025-11-10: NAV 98  -> REJECTED (outside 7-day window)
  const observations = [
    { date: '2025-11-10', nav: 98.00 },
    { date: '2025-11-19', nav: 100.00 },
    { date: '2025-11-25', nav: 104.00 },
    { date: '2026-11-20', nav: 110.00 }
  ];

  const trailing = calculateTrailingReturns(observations);
  assert.equal(trailing['1Y'].available, true);
  assert.equal(trailing['1Y'].startDate, '2025-11-19');
  assert.equal(trailing['1Y'].endDate, '2026-11-20');
  assert.equal(trailing['1Y'].startNav, 100.00);
  assert.equal(trailing['1Y'].endNav, 110.00);
  assert.equal(trailing['1Y'].returnPercent, 10.00);
  assert.equal(trailing['1Y'].isCagr, false);

  // Negative case: observation is 10 days before target date (> 7 days) -> Unavailable!
  const sparseObs = [
    { date: '2025-11-10', nav: 98.00 },
    { date: '2026-11-20', nav: 110.00 }
  ];
  const trailingSparse = calculateTrailingReturns(sparseObs);
  assert.equal(trailingSparse['1Y'].available, false);
  assert.equal(trailingSparse['1Y'].returnPercent, null);
  assert.equal(trailingSparse['1Y'].reason, 'INSUFFICIENT_WINDOW_COVERAGE');
});

test('WP05-S03 Calendar Math: Month-end and leap-year subtraction handling', () => {
  // 1 month before March 31 on leap year 2024 -> 2024-02-29
  assert.equal(subtractCalendarPeriod('2024-03-31', { months: 1 }), '2024-02-29');

  // 1 month before March 31 on non-leap year 2026 -> 2026-02-28
  assert.equal(subtractCalendarPeriod('2026-03-31', { months: 1 }), '2026-02-28');

  // 1 year before 2024-02-29 (leap year to non-leap) -> 2023-02-28
  assert.equal(subtractCalendarPeriod('2024-02-29', { years: 1 }), '2023-02-28');

  // Calendar day diff across 1 year
  assert.equal(calendarDayDiff('2027-01-01', '2026-01-01'), 365);
  assert.equal(calendarDayDiff('2025-01-01', '2024-01-01'), 366); // Leap year 2024
});

test('WP05-S04 CAGR Precision: Standard 365.25 annualization convention', () => {
  assert.equal(DAYS_PER_YEAR, 365.25);

  // Fixture: Exactly 365 calendar days with 10% gain (100 -> 110)
  // (1.1)^(365.25 / 365) - 1 ≈ 10.00718%
  const obs = [
    { date: '2023-01-01', nav: 100.00 },
    { date: '2026-01-01', nav: 133.10 } // 3 years (1096 days) at 10% compounding = 1.1^3 = 1.331
  ];

  const res = calculateTrailingReturns(obs);
  assert.equal(res['3Y'].available, true);
  assert.equal(res['3Y'].isCagr, true);
  // (1.331)^(365.25 / 1096) - 1 = (1.1)^(3 * 365.25 / 1096) - 1 ≈ 10.00718%
  assert.ok(Math.abs(res['3Y'].returnPercent - 10.01) < 0.05);
});

test('WP05-S05 4,000-Point History Truncation and Available-Period CAGR', async () => {
  // Generate 4,500 daily observations
  const largeSeries = [];
  const startMs = Date.UTC(2010, 0, 1);
  for (let i = 0; i < 4500; i++) {
    const d = new Date(startMs + i * 86400000).toISOString().slice(0, 10);
    largeSeries.push({ date: d, nav: String(10 + i * 0.05) });
  }

  const expectedLatestDate = largeSeries[largeSeries.length - 1].date;

  const mockFetchHistory = async () => ({
    ok: true,
    status: 200,
    headers: new Map(),
    json: async () => ({
      status: 'SUCCESS',
      meta: {
        scheme_code: 119551,
        scheme_name: 'Test Large Scheme',
        scheme_category: 'Equity'
      },
      data: [...largeSeries].reverse() // MFapi returns latest first
    })
  });

  const res = await fundClient.fetchFundHistory('119551', { fetchImpl: mockFetchHistory });
  assert.equal(res.truncated, true);
  assert.equal(res.fullHistoryVerified, false);
  assert.equal(res.cachedObservationCount, 4000);
  assert.equal(res.totalReturnedObservations, 4500);

  // Verifies newest 4,000 observations are retained (latest date preserved)
  assert.equal(res.lastCachedDate, expectedLatestDate);
  assert.equal(res.observations[res.observations.length - 1].date, expectedLatestDate);

  // Available-period CAGR
  const trailing = calculateTrailingReturns(res.observations);
  assert.equal(trailing['ALL'].available, true);
  assert.equal(trailing['ALL'].isAvailablePeriodOnly, true);
  assert.equal(trailing['ALL'].endDate, expectedLatestDate);
});

test('WP05-S06 Maximum Drawdown & Annualized Volatility with Gap Filtering', () => {
  // Drawdown scenario:
  // 100 -> 120 (Peak) -> 90 (Trough, -25% DD) -> 110
  const obs = [
    { date: '2026-01-01', nav: 100 },
    { date: '2026-01-05', nav: 120 },
    { date: '2026-01-10', nav: 90 },
    { date: '2026-01-15', nav: 110 }
  ];

  const mdd = calculateMaxDrawdown(obs);
  assert.equal(mdd.mddPercent, -25);
  assert.equal(mdd.peakDate, '2026-01-05');
  assert.equal(mdd.peakNav, 120);
  assert.equal(mdd.troughDate, '2026-01-10');
  assert.equal(mdd.troughNav, 90);

  // Volatility scenario: 25 observations with a 10-day gap
  const volSeries = [];
  const baseMs = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 25; i++) {
    // Inject a 10-day gap at index 12
    const offsetDays = i < 12 ? i : i + 10;
    const d = new Date(baseMs + offsetDays * 86400000).toISOString().slice(0, 10);
    // Oscillating NAV
    const nav = 100 + (i % 2 === 0 ? 1 : -1) * 0.5;
    volSeries.push({ date: d, nav });
  }

  const vol = calculateAnnualizedVolatility(volSeries);
  assert.equal(vol.available, true);
  assert.ok(vol.volatilityPercent > 0);
  // The 10-day gap was filtered out from the sample
  assert.equal(vol.sampleCount, 23); // 24 total pairs minus 1 filtered gap = 23
});

test('WP05-S07 Multi-Fund Common-Date Alignment and Base-100 Rebase', () => {
  const schemeA = [
    { date: '2026-01-01', nav: 50 },
    { date: '2026-01-02', nav: 55 }, // +10%
    { date: '2026-01-03', nav: 60 }  // +20%
  ];
  const schemeB = [
    { date: '2026-01-01', nav: 200 },
    { date: '2026-01-02', nav: 210 }, // +5%
    { date: '2026-01-03', nav: 220 }  // +10%
  ];

  const aligned = alignComparativeHistory({ '101': schemeA, '102': schemeB }, '2026-01-01');
  assert.deepEqual(aligned.alignedDates, ['2026-01-01', '2026-01-02', '2026-01-03']);

  // Base-100 rebase:
  // Scheme A (base 50): 100, 110, 120
  assert.equal(aligned.seriesByScheme['101'][0].normalized, 100);
  assert.equal(aligned.seriesByScheme['101'][1].normalized, 110);
  assert.equal(aligned.seriesByScheme['101'][2].normalized, 120);

  // Scheme B (base 200): 100, 105, 110
  assert.equal(aligned.seriesByScheme['102'][0].normalized, 100);
  assert.equal(aligned.seriesByScheme['102'][1].normalized, 105);
  assert.equal(aligned.seriesByScheme['102'][2].normalized, 110);
});

test('WP05-S08 WP-08 SIP Math Adapter Boundary', () => {
  // Monthly 5000 for 10 years at 12% annual return
  // Number of months = 120
  // Invested = 5000 * 120 = 600,000
  // Future value at 1% per month = 5000 * ((1.01^120 - 1) / 0.01) ≈ 1,150,193.45
  const sip = computeFundSip(5000, 10, 12);
  assert.equal(sip.ok, true);
  assert.equal(sip.invested, 600000);
  assert.equal(sip.months, 120);
  assert.ok(Math.abs(sip.futureValue - 1150193.45) < 1.0);
  assert.ok(Math.abs(sip.estimatedGain - 550193.45) < 1.0);

  // Zero return scenario
  const zeroReturnSip = computeFundSip(5000, 10, 0);
  assert.equal(zeroReturnSip.futureValue, 600000);
  assert.equal(zeroReturnSip.estimatedGain, 0);
});

test('WP05-S09 Formula Injection Protection & DDE Sanitization', () => {
  const dangerous = ['=cmd|', '+123', '-456', '@SUM(A1)', '\tcalc', '\rcmd', '|test'];
  for (const val of dangerous) {
    const sanitized = sanitizeCsvCell(val);
    assert.ok(sanitized.startsWith('"\'') || sanitized.startsWith("'"), `Expected escape prefix for ${val}`);
    const roundTrip = desanitizeCsvCell(sanitized);
    assert.equal(roundTrip, val.trim());
  }

  assert.equal(sanitizeCsvCell('119551'), '119551');
  assert.equal(sanitizeCsvCell('HDFC Top 100'), 'HDFC Top 100');
});

test('WP05-S10 Static Export Audit and Path Isolation', () => {
  const indexContent = fs.readFileSync(
    path.resolve('src/market/features/funds/index.js'),
    'utf-8'
  );

  assert.ok(indexContent.includes('FundsPanel'));
  assert.ok(indexContent.includes('FundSummary'));
  assert.ok(indexContent.includes('FundNavChart'));
  assert.ok(indexContent.includes('FundCompareModal'));
  assert.ok(indexContent.includes('FundSipModal'));
  assert.ok(indexContent.includes('fundStore'));
  assert.ok(indexContent.includes('fundClient'));
  assert.ok(indexContent.includes('calculateTrailingReturns'));
  assert.ok(indexContent.includes('computeFundSip'));

  assert.equal(SAVED_FUNDS_STORAGE_KEY, 'nw7.market-saved-funds.v1');
  assert.equal(FUND_HISTORY_STORAGE_KEY, 'nw7.market-fund-history.v1');

  // Verify path isolation against base commit 2510cac78e4ec177efaaedfb8de2ac3504415813
  const changedFiles = execSync('git diff --name-only $(git merge-base HEAD origin/main) HEAD', {
    encoding: 'utf-8'
  }).split('\n').map(s => s.trim()).filter(Boolean);

  // The shared trigger includes policy-only Market service changes as well
  // as src/market runtime paths; unrelated Newspaper PRs remain out of scope.
  for (const file of marketIsolationInput(changedFiles)) {
    const isAllowed =
      file.startsWith('src/market/') ||
      file.startsWith('src/pages/') ||
      file.startsWith('src/services/marketWorkspaceRoute.js') ||
      file.startsWith('scripts/') ||
      file.startsWith('reports/market-r21/') ||
      [
        '.github/workflows/market-r21-wp00-contracts.yml',
        '.github/workflows/ci.yml',
        'docs/market/R21_AGENT_DISPATCH.md',
        'docs/market/R21_WP00_FOUNDATION.md'
      ].includes(file);
    assert.ok(
      isAllowed,
      `Violation of path isolation! Unauthorized modification of shared file: ${file}`
    );
  }
});
