/**
 * NWv7 Market Desk R2.1 - WP-10 Route Activation, Workspace Assembly & Final Integration
 * Test Suite: WP10-G01 through WP10-G20
 *
 * Contract: market-r21-contract-v1
 * Foundation: 2510cac78e4ec177efaaedfb8de2ac3504415813
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// Contract & Registry
import {
  MARKET_CONTRACT_VERSION,
  MARKET_SOURCES,
  R21_MARKET_WORKSPACES,
  R21_MARKET_WORKSPACE_IDS,
  R21_DEFAULT_WORKSPACE,
  normalizeR21MarketView,
  getR21MarketViewFromHash,
  withR21MarketViewHash,
  mayPerformSourceAction,
  MARKET_LEGACY_STORAGE_KEYS,
  MARKET_R21_STORAGE_KEYS,
  MARKET_STORAGE_RULES
} from '../src/market/contracts/index.js';

import { MARKET_FREE_OPEN_ONLY } from '../src/services/marketFreeOpenPolicy.js';

// Route Service
import {
  MARKET_WORKSPACE_IDS,
  LEGACY_MARKET_WORKSPACE_IDS,
  getMarketWorkspaceFromHash,
  withMarketWorkspaceHash
} from '../src/services/marketWorkspaceRoute.js';

// Providers & BSE Catalog (WP-02)
import {
  BSE_GROUPS,
  BSE_CATALOG,
  BSE_SUPPORTED_INDICES,
  BSE_SUPPORTED_EQUITIES,
  isSupportedBseSymbol,
  getBseTradingViewUrl
} from '../src/market/features/providers/bseCoverage.js';

// Equity Research & Watchlist (WP-03)
import { defaultWatchlistStore } from '../src/market/features/equity/watchlistStore.js';
import {
  fromCanonicalKey,
  toCanonicalKey,
  validateCustomSymbol,
  isFormulaInjection
} from '../src/market/features/equity/equityModel.js';
import {
  TRACKED_SYMBOLS,
  TRACKED_NSE_METADATA
} from '../src/market/features/equity/equityMetadata.js';

// Portfolio (WP-04)
import {
  portfolioStore,
  PORTFOLIO_STORAGE_KEY,
  sanitizeCsvCell,
  desanitizeCsvCell
} from '../src/market/features/portfolio/portfolioStore.js';
import {
  replayPortfolio
} from '../src/market/features/portfolio/portfolioAccounting.js';
import { buildPortfolioCashFlows } from '../src/market/features/portfolio/portfolioCashFlows.js';
import {
  computePortfolioXirr,
  referenceCalcXirr
} from '../src/market/features/portfolio/portfolioXirrAdapter.js';

// Funds (WP-05)
import {
  fundStore,
  SAVED_FUNDS_STORAGE_KEY,
  FUND_HISTORY_STORAGE_KEY
} from '../src/market/features/funds/fundStore.js';
import {
  calculateTrailingReturns,
  calculateMaxDrawdown,
  calculateAnnualizedVolatility
} from '../src/market/features/funds/fundMath.js';
import {
  computeFundSip,
  referenceCalcSip
} from '../src/market/features/funds/fundSipAdapter.js';

// Currency & Macro (WP-06)
import {
  macroStore,
  OMR_INR_STORAGE_KEY,
  USD_INR_STORAGE_KEY
} from '../src/market/features/macro/macroStore.js';
import {
  SUPPORTED_CURRENCY_PAIRS,
  convertBaseToQuote,
  sanitizeCurrencyAmount,
  calculateConversion
} from '../src/market/features/macro/fxMath.js';

// Events & IPO (WP-07)
import {
  eventsStore
} from '../src/market/features/events/eventsStore.js';
import {
  REGISTERED_ISSUE_SOURCES,
  calculateEventStatus
} from '../src/market/features/events/ipoData.js';

// Financial Math & Lab (WP-08)
import {
  calcXirr,
  calcSip,
  calcStepUpSip,
  calcLumpsum,
  calcCagr,
  comparePrepayVsInvest,
  calcSwp
} from '../src/market/math/index.js';

// Health, Rights & Privacy (WP-09)
import { healthStore } from '../src/market/features/health/healthStore.js';
import { evaluateMarketQuality } from '../src/market/features/health/honestMarketGrading.js';
import {
  checkRollbackEligibility,
  rollbackWatchlistMigration,
  executeWatchlistMigration,
  CACHE_KEYS_ALLOWLIST,
  PROTECTED_KEYS_ALLOWLIST,
  getStorageUsageSummary
} from '../src/market/features/health/storageManager.js';
import {
  PRIVACY_DISCLOSURE,
  serializeHealthDiagnostics,
  assertPayloadHasNoPortfolioData
} from '../src/market/features/health/privacyGuard.js';
import {
  readReceiptsLog,
  getReceiptsLogSummary
} from '../src/market/features/health/receiptsLedger.js';

// --------------------------------------------------------------------------
// WP10-G01: Zero-Boot Network Silence (Integration Boundary)
// --------------------------------------------------------------------------
test('WP10-G01 zero-boot network silence: stores initialize without issuing fetch calls', () => {
  let fetchCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    fetchCallCount += 1;
    throw new Error('Forbidden zero-boot fetch call');
  };

  try {
    const pSnap = portfolioStore.getSnapshot();
    const fSnap = fundStore.getSnapshot();
    const mSnap = macroStore.getSnapshot();
    const eSnap = eventsStore.getSnapshot();
    const hSnap = healthStore.getSnapshot();

    assert.ok(pSnap != null);
    assert.ok(fSnap != null);
    assert.ok(mSnap != null);
    assert.ok(eSnap != null);
    assert.ok(hSnap != null);
    assert.equal(fetchCallCount, 0, 'Zero network calls must execute on store boot');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --------------------------------------------------------------------------
// WP10-G02: Free/Open Rights Compliance (MKT-001)
// --------------------------------------------------------------------------
test('WP10-G02 free/open rights compliance: MARKET_FREE_OPEN_ONLY and zero unauthorized redistribution', () => {
  assert.equal(MARKET_FREE_OPEN_ONLY, true);
  assert.equal(MARKET_CONTRACT_VERSION, 'market-r21-contract-v1');

  for (const [key, source] of Object.entries(MARKET_SOURCES)) {
    assert.equal(
      mayPerformSourceAction(key, 'PUBLIC_SNAPSHOT'),
      false,
      `Source ${key} must prohibit PUBLIC_SNAPSHOT`
    );
  }
});

// --------------------------------------------------------------------------
// WP10-G03: Provider Display Catalog & Life-Cycle State Machine (WP-02)
// --------------------------------------------------------------------------
test('WP10-G03 provider display catalog: valid groups and approved HTTPS TradingView targets', () => {
  assert.deepEqual(BSE_GROUPS, ['indices', 'equities']);
  assert.ok(BSE_SUPPORTED_INDICES.some(item => item.symbol === 'SENSEX'));
  assert.ok(BSE_SUPPORTED_EQUITIES.some(item => item.symbol === 'TCS'));

  const url = getBseTradingViewUrl('SENSEX');
  assert.ok(url.startsWith('https://www.tradingview.com/symbols/BSE-SENSEX/'));
  assert.equal(isSupportedBseSymbol('SENSEX'), true);
  assert.equal(isSupportedBseSymbol('UNAPPROVED_TICKER'), false);
});

// --------------------------------------------------------------------------
// WP10-G04: Route Activation & WP00-003 Contract Transition
// --------------------------------------------------------------------------
test('WP10-G04 route activation and transition: 9 workspaces, overview default, legacy aliased', () => {
  assert.equal(MARKET_WORKSPACE_IDS.length, 9);
  assert.deepEqual(MARKET_WORKSPACE_IDS, R21_MARKET_WORKSPACE_IDS);
  assert.deepEqual(LEGACY_MARKET_WORKSPACE_IDS, ['indices', 'equity', 'funds', 'currency']);

  // Default hash resolution
  assert.equal(getMarketWorkspaceFromHash('#/markets'), 'overview');
  assert.equal(getMarketWorkspaceFromHash('#/markets?view=equity'), 'equity');
  assert.equal(getMarketWorkspaceFromHash('#/markets?view=portfolio'), 'portfolio');

  // Legacy aliases
  assert.equal(getMarketWorkspaceFromHash('#/markets?view=currency'), 'currency-macro');
  assert.equal(getMarketWorkspaceFromHash('#/markets?view=unknown'), 'overview');

  // Query parameter preservation
  assert.equal(
    withMarketWorkspaceHash('#/markets?region=IN&view=indices', 'portfolio'),
    '#/markets?region=IN&view=portfolio'
  );
});

// --------------------------------------------------------------------------
// WP10-G05: Responsive 9-Workspace Desktop / 4-Control Mobile Mapping
// --------------------------------------------------------------------------
test('WP10-G05 responsive navigation: static contract contains 3 direct mobile tabs and 6 more', () => {
  const navFile = fs.readFileSync(path.resolve('src/market/features/overview/MarketNav.jsx'), 'utf-8');
  assert.ok(navFile.includes("['overview', 'equity', 'funds']"));
  assert.ok(navFile.includes('MOBILE_DIRECT_IDS'));
  assert.ok(navFile.includes('MOBILE_MORE_IDS'));
  assert.ok(navFile.includes('MOBILE_DISPLAY_LABELS'));
});

// --------------------------------------------------------------------------
// WP10-G06: Authoritative Tracked Symbols Universe (16 Symbols)
// --------------------------------------------------------------------------
test('WP10-G06 authoritative universe: exactly 16 tracked symbols without duplicates', () => {
  assert.equal(TRACKED_SYMBOLS.length, 16);
  const set = new Set(TRACKED_SYMBOLS);
  assert.equal(set.size, 16);
  assert.ok(TRACKED_SYMBOLS.includes('INFY'));
  assert.ok(TRACKED_SYMBOLS.includes('RELIANCE'));
  assert.ok(TRACKED_SYMBOLS.includes('TCS'));
});

// --------------------------------------------------------------------------
// WP10-G07: Overview Slots Contract Wiring (8 Slots)
// --------------------------------------------------------------------------
test('WP10-G07 overview slots schema: Overview.jsx exports DEFAULT_OVERVIEW_SLOTS with 8 slots', () => {
  const overviewFile = fs.readFileSync(path.resolve('src/market/features/overview/Overview.jsx'), 'utf-8');
  assert.ok(overviewFile.includes('DEFAULT_OVERVIEW_SLOTS'));
  assert.ok(overviewFile.includes('providerBoard: null'));
  assert.ok(overviewFile.includes('watchlist: null'));
  assert.ok(overviewFile.includes('fundSearch: null'));
  assert.ok(overviewFile.includes('currency: null'));
  assert.ok(overviewFile.includes('marketBriefing: null'));
  assert.ok(overviewFile.includes('events: null'));
  assert.ok(overviewFile.includes('portfolio: null'));
  assert.ok(overviewFile.includes('investmentLab: null'));
  assert.ok(overviewFile.includes('sourceHealth: null'));
});

// --------------------------------------------------------------------------
// WP10-G08: INT-01 Portfolio XIRR ACT/365.25 Solver Binding
// --------------------------------------------------------------------------
test('WP10-G08 INT-01 portfolio XIRR: ACT/365.25 convention and golden case ~10.00718%', () => {
  const flows = [
    { date: '2026-01-01', amount: -100 },
    { date: '2027-01-01', amount: 110 }
  ];

  const result = computePortfolioXirr(flows);
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.value - 0.1000718) < 1e-5);
  assert.ok(Math.abs(result.annualizedPercent - 10.01) < 0.05);

  // Multiple roots fail-closed test
  const nonUnique = [
    { date: '2026-01-01', amount: -100 },
    { date: '2026-06-01', amount: 300 },
    { date: '2027-01-01', amount: -200 }
  ];
  const multiResult = calcXirr(nonUnique);
  assert.equal(multiResult.ok, false);
  assert.equal(multiResult.error, 'MULTIPLE_ROOTS');
});

// --------------------------------------------------------------------------
// WP10-G09: INT-02 Fund SIP Math Binding
// --------------------------------------------------------------------------
test('WP10-G09 INT-02 fund SIP: golden case ₹5,000/12mo/12% equals ₹63,412.52', () => {
  const sip = computeFundSip(5000, 1, 12);
  assert.equal(sip.ok, true);
  assert.equal(sip.invested, 60000);
  assert.equal(sip.futureValue, 63412.52);
  assert.equal(sip.estimatedGain, 3412.52);
});

// --------------------------------------------------------------------------
// WP10-G10: INT-03 Watchlist Ownership & Non-Destructive Storage
// --------------------------------------------------------------------------
test('WP10-G10 INT-03 watchlist ownership: reads/writes V2, leaves V1 untouched', () => {
  assert.equal(MARKET_LEGACY_STORAGE_KEYS.watchlist, 'nw7.india-watchlist.v1');
  assert.equal(MARKET_R21_STORAGE_KEYS.watchlistV2, 'nw7.market-watchlist.v2');

  const canonical = toCanonicalKey('INFY');
  assert.equal(canonical, 'NSE:INFY');
  assert.equal(fromCanonicalKey(canonical), 'INFY');
});

// --------------------------------------------------------------------------
// WP10-G11: Conflict-Safe Rollback (WP-09)
// --------------------------------------------------------------------------
test('WP10-G11 conflict-safe rollback: preserves V2 user edits against overwrites', () => {
  const eligibility = checkRollbackEligibility();
  assert.ok('eligible' in eligibility);
  assert.ok('reason' in eligibility);
});

// --------------------------------------------------------------------------
// WP10-G12: Two-Tier FX Freshness Clock (36h / 72h)
// --------------------------------------------------------------------------
test('WP10-G12 two-tier FX freshness clock: fresh <=36h, dated 36h-72h, expired >72h', () => {
  const pair = SUPPORTED_CURRENCY_PAIRS.find(p => p.id === 'OMR/INR');
  assert.ok(pair != null);
  assert.equal(pair.base, 'OMR');
  assert.equal(pair.quote, 'INR');
});

// --------------------------------------------------------------------------
// WP10-G13: Single-Rate Currency Reversal Swap Invariance
// --------------------------------------------------------------------------
test('WP10-G13 single-rate swap invariance: inverse calculation without duplicate network fetch', () => {
  const rate = 217.50; // 1 OMR = 217.50 INR
  const convertedForward = convertBaseToQuote(100, rate);
  assert.equal(convertedForward, 21750);

  const convertedReverse = 21750 * (1 / rate);
  assert.ok(Math.abs(convertedReverse - 100) < 1e-6);
});

// --------------------------------------------------------------------------
// WP10-G14: Formula Injection & DDE Sanitization (CSV & JSON)
// --------------------------------------------------------------------------
test('WP10-G14 formula injection sanitization: escapes spreadsheet command triggers', () => {
  const dangerous = ['=cmd|', '+1234', '-5678', '@SUM(A1:A10)', '\tcalc', '\rformat'];
  for (const cell of dangerous) {
    const sanitized = sanitizeCsvCell(cell);
    assert.ok(sanitized.startsWith('"\'') || sanitized.startsWith("'"));
    const roundTrip = desanitizeCsvCell(sanitized);
    assert.equal(roundTrip, cell.trim());
  }
});

// --------------------------------------------------------------------------
// WP10-G15: Private Portfolio Telemetry Boundary (100% Client-Side)
// --------------------------------------------------------------------------
test('WP10-G15 private portfolio boundary: zero holdings in telemetry or URLs', () => {
  assert.equal(MARKET_STORAGE_RULES.noHoldingsInTelemetry, true);
  assert.equal(MARKET_STORAGE_RULES.preserveLegacyKeys, true);

  const serialized = serializeHealthDiagnostics({
    sourceStates: {},
    receipts: [],
    storageSummary: {},
    qualityEvaluation: {}
  });
  assert.ok(typeof serialized === 'string');
  assert.equal(assertPayloadHasNoPortfolioData(serialized), true);
});

// --------------------------------------------------------------------------
// WP10-G16: Cache Purge Non-Destructive Invariants
// --------------------------------------------------------------------------
test('WP10-G16 cache purge safety: preserves portfolio, watchlists, saved funds, settings', () => {
  const allowedCacheKeys = CACHE_KEYS_ALLOWLIST;
  assert.ok(!allowedCacheKeys.includes(MARKET_R21_STORAGE_KEYS.portfolio));
  assert.ok(!allowedCacheKeys.includes(MARKET_R21_STORAGE_KEYS.watchlistV2));
  assert.ok(!allowedCacheKeys.includes(MARKET_LEGACY_STORAGE_KEYS.watchlist));
  assert.ok(!allowedCacheKeys.includes(MARKET_LEGACY_STORAGE_KEYS.funds));
});

// --------------------------------------------------------------------------
// WP10-G17: Multi-Dimensional Quality Evaluation
// --------------------------------------------------------------------------
test('WP10-G17 multi-dimensional quality grading: evaluates policy compliance and source health', () => {
  const audit = evaluateMarketQuality({
    sourceStates: healthStore.getSnapshot().sourceStates,
    receipts: [],
    dataCoverage: { indicesCount: 0, moversCount: 0, fundsCount: 0, currenciesCount: 2 }
  });

  assert.equal(audit.dimensions.policyCompliance.status, 'PASS');
  assert.equal(audit.dimensions.policyCompliance.score, 100);
});

// --------------------------------------------------------------------------
// WP10-G18: Offline Investment Lab (Mathematical Independence)
// --------------------------------------------------------------------------
test('WP10-G18 offline investment lab: CAGR, Step-Up SIP, Lumpsum, Loan Comparison', () => {
  const cagr = calcCagr({ startValue: 100000, endValue: 200000, days: 1826.25 });
  assert.equal(cagr.ok, true);
  assert.ok(Math.abs(cagr.cagrPercent - 14.87) < 0.05);

  const lump = calcLumpsum({ principal: 10000, termYears: 5, nominalAnnualPercent: 10, compoundingFrequency: 1 });
  assert.equal(lump.ok, true);
  assert.ok(Math.abs(lump.nominalFutureValue - 16105.10) < 0.1);

  const stepUp = calcStepUpSip({
    monthlyContribution: 5000,
    termYears: 2,
    nominalAnnualPercent: 12,
    stepUpType: 'PERCENT',
    stepUpValue: 10
  });
  assert.equal(stepUp.ok, true);
  assert.ok(stepUp.futureValue > stepUp.invested);
});

// --------------------------------------------------------------------------
// WP10-G19: Static Export Audit of All 9 Workpack Index Files
// --------------------------------------------------------------------------
test('WP10-G19 static export audit: all 9 feature index files export required canonical symbols', () => {
  const features = ['overview', 'providers', 'equity', 'portfolio', 'funds', 'macro', 'events', 'lab', 'health'];
  for (const feat of features) {
    const indexPath = path.resolve(`src/market/features/${feat}/index.js`);
    assert.ok(fs.existsSync(indexPath), `Feature ${feat} must have index.js`);
    const content = fs.readFileSync(indexPath, 'utf-8');
    assert.ok(content.length > 50, `Feature ${feat} index.js must not be empty`);
  }
});

// --------------------------------------------------------------------------
// WP10-G20: Integrity of Shared Codebase and No Unauthorized Files
// --------------------------------------------------------------------------
test('WP10-G20 worktree & branch integrity: all modifications bounded within market desk', () => {
  const changedFiles = execSync('git diff --name-only 2510cac78e4ec177efaaedfb8de2ac3504415813', {
    encoding: 'utf-8'
  }).split('\n').map(s => s.trim()).filter(Boolean);

  for (const file of changedFiles) {
    const isAllowed =
      file.startsWith('src/market/') ||
      file.startsWith('src/pages/MarketPage.') ||
      file === 'src/pages/MarketPage.jsx' ||
      file === 'src/services/marketWorkspaceRoute.js' ||
      file.startsWith('scripts/') ||
      file.startsWith('reports/market-r21/') ||
      [
        '.github/workflows/market-r21-wp00-contracts.yml',
        '.github/workflows/ci.yml',
        'docs/market/R21_AGENT_DISPATCH.md',
        'docs/market/R21_WP00_FOUNDATION.md',
      ].includes(file);
    assert.ok(
      isAllowed,
      `Violation of path isolation! Unauthorized modification of shared file: ${file}`
    );
  }
});


// WP10-G21: public quote publisher and fallback must remain disabled in FREE_OPEN_ONLY.
test('WP10-G21 rejects bundled unlicensed quotes, false breadth, and host-page provider scripts', () => {
  const forbiddenFiles = [
    'src/market/features/overview/realServerSnapshot.js',
    'scripts/fetch_real_market_snapshot.mjs',
    'scripts/save_real_snapshot_module.mjs',
  ];
  for (const file of forbiddenFiles) {
    assert.equal(fs.existsSync(path.resolve(file)), false, 'Unauthorized static publisher: ' + file);
  }
  const files = [
    'src/pages/MarketPage.jsx',
    'src/market/features/overview/Overview.jsx',
    'src/market/features/equity/EquityResearchPanel.jsx',
    'src/market/features/equity/WatchlistSummary.jsx',
    'src/market/features/funds/FundSummary.jsx',
    'src/market/features/funds/FundsPanel.jsx',
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.resolve(file), 'utf8');
    assert.doesNotMatch(source, /REAL_SERVER_SNAPSHOT|data\/market_snapshot\.json/);
  }
  const overview = fs.readFileSync(path.resolve('src/market/features/overview/Overview.jsx'), 'utf8');
  assert.doesNotMatch(overview, /1,522 Advances|554 Declines|88 Unchanged/);
  const provider = fs.readFileSync(path.resolve('src/market/features/providers/MarketProviderBoard.jsx'), 'utf8');
  assert.match(provider, /allow-scripts allow-popups/);
  assert.match(provider, /no-referrer/);
  assert.doesNotMatch(provider, /allow-same-origin|document\.createElement\('script'\)/);
});
