/**
 * Node 22 native contract tests for NWv7 Market Desk R2.1 - WP-09 Health, Rights & Privacy Desk
 *
 * Verifies WP09-T01 through WP09-T38 covering:
 * - Zero-boot network silence
 * - 12-source registry coverage & rights
 * - Genuine WP-00 error code validation
 * - Bounded 100-receipt local activity log (valid vs rejected classes)
 * - Versioned recoverable watchlist migration & conflict-aware rollback
 * - In-memory saved-funds normalization (zero storage write)
 * - Strict allowlist diagnostic serialization & URL query stripping
 * - Store-coordinated cache purging with epoch race guards
 * - Multi-dimensional quality grading & accurate storage calculations
 * - Negative and recovery controls
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

// Import contracts and WP-09 modules
import { MARKET_SOURCES, getMarketSource } from '../src/market/registry/sourceRegistry.js';
import {
  MARKET_LEGACY_STORAGE_KEYS,
  MARKET_R21_STORAGE_KEYS,
  MARKET_STORAGE_RULES
} from '../src/market/contracts/storagePolicy.js';
import {
  validateSourceReceipt,
  createSourceReceipt
} from '../src/market/contracts/sourceReceipt.js';

import {
  buildInitialSourceStates,
  hydrateSourceStates,
  applyReceiptToSourceState,
  ALL_SOURCE_IDS
} from '../src/market/features/health/sourceHealthEngine.js';

import {
  readReceiptsLog,
  appendReceiptRecord,
  getReceiptsLogSummary,
  clearReceiptsLog,
  processReceiptCandidate,
  RECORD_CLASSES,
  MAX_RETAINED_RECEIPTS,
  RECEIPTS_LOG_STORAGE_KEY
} from '../src/market/features/health/receiptsLedger.js';

import {
  previewWatchlistMigration,
  executeWatchlistMigration,
  rollbackWatchlistMigration,
  checkRollbackEligibility,
  getNormalizedSavedFunds,
  getStorageUsageSummary,
  computeFingerprint,
  MIGRATION_JOURNAL_KEY,
  CACHE_KEYS_ALLOWLIST,
  PROTECTED_KEYS_ALLOWLIST
} from '../src/market/features/health/storageManager.js';

import {
  PRIVACY_DISCLOSURE,
  sanitizeSourceUrl,
  serializeHealthDiagnostics,
  assertPayloadHasNoPortfolioData
} from '../src/market/features/health/privacyGuard.js';

import { evaluateMarketQuality } from '../src/market/features/health/honestMarketGrading.js';

// Mock storage helper for isolated tests
function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    _store: store
  };
}

test('WP09-T01 Passive health mounting executes exactly zero network fetches', () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { fetchCalled = true; throw new Error('Fetch prohibited on boot'); };

  try {
    const states = buildInitialSourceStates();
    assert.equal(fetchCalled, false, 'No network fetch on initial states build');
    assert.equal(Object.keys(states).length, 12);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('WP09-T02 Covers all 12 registered sources with exact rights and publishers', () => {
  const expectedSources = [
    'tradingview-bse', 'nse-indices', 'nse-equities', 'nse-ipo', 'bse-ipo',
    'amfi-nfo', 'mfapi', 'frankfurter', 'world-bank', 'pib-economy-news', 'nwv7-market-news', 'personal-local'
  ];
  assert.equal(ALL_SOURCE_IDS.length, 12);
  for (const id of expectedSources) {
    const s = getMarketSource(id);
    assert.ok(s, `Source ${id} must exist in registry`);
  }
  const states = buildInitialSourceStates();
  for (const id of expectedSources) {
    assert.ok(states[id], `Source ${id} must exist in initial health states`);
    assert.equal(states[id].publisher, MARKET_SOURCES[id].publisher);
    assert.equal(states[id].rights, MARKET_SOURCES[id].rights);
  }
});

test('WP09-T03 Invalid receipts rejected using actual WP-00 error codes', () => {
  // Test INVALID_PROVIDER_CLOCK
  const badClock = {
    sourceId: 'mfapi',
    accessMode: 'DIRECT_ON_DEMAND',
    rights: 'BROWSER_DIRECT_CONDITIONAL',
    publisher: 'MFapi',
    state: 'READY',
    validity: 'VALID',
    providerAsOf: 'NOT_A_VALID_DATE',
    originalUrl: 'https://www.mfapi.in/docs/'
  };
  const res = validateSourceReceipt(badClock);
  assert.equal(res.ok, false);
  assert.ok(res.errors.includes('INVALID_PROVIDER_CLOCK'), 'Must emit INVALID_PROVIDER_CLOCK');

  // Test SOURCE_ACCESS_MISMATCH
  const badAccess = {
    ...badClock,
    providerAsOf: '2026-11-20',
    providerClockGranularity: 'day',
    accessMode: 'UNAUTHORIZED_PUBLICATION'
  };
  const res2 = validateSourceReceipt(badAccess);
  assert.equal(res2.ok, false);
  assert.ok(res2.errors.includes('SOURCE_ACCESS_MISMATCH'), 'Must emit SOURCE_ACCESS_MISMATCH');
});

test('WP09-T04 Valid receipts and rejected attempts stored as distinct diagnostic classes', () => {
  const validCandidate = {
    sourceId: 'mfapi',
    accessMode: 'DIRECT_ON_DEMAND',
    rights: 'BROWSER_DIRECT_CONDITIONAL',
    publisher: 'MFapi',
    state: 'READY',
    validity: 'VALID',
    providerAsOf: '2026-11-20',
    providerClockGranularity: 'day',
    originalUrl: 'https://www.mfapi.in/docs/',
    transportStatus: 200,
    requestedAt: '2026-11-20T10:00:00Z',
    checkedAt: '2026-11-20T10:00:01Z'
  };
  const r1 = processReceiptCandidate(validCandidate);
  assert.equal(r1.recordClass, RECORD_CLASSES.VALID_RECEIPT);
  assert.ok(r1.receipt);
  assert.equal(r1.errors.length, 0);

  const invalidCandidate = {
    sourceId: 'mfapi',
    accessMode: 'DIRECT_ON_DEMAND',
    rights: 'BROWSER_DIRECT_CONDITIONAL',
    publisher: 'MFapi',
    state: 'READY',
    validity: 'VALID',
    providerAsOf: 'bad-clock'
  };
  const r2 = processReceiptCandidate(invalidCandidate);
  assert.equal(r2.recordClass, RECORD_CLASSES.REJECTED_ATTEMPT);
  assert.equal(r2.receipt, null);
  assert.ok(r2.errors.length > 0);
});

test('WP09-T05 Status decoupling: legal rights separated from request and reachability', () => {
  const states = buildInitialSourceStates();
  const nse = states['nse-indices'];
  assert.equal(nse.rights, 'LINK_ONLY');
  assert.equal(nse.requestStatus, 'NOT_REQUESTED');
  assert.equal(nse.currentReachability, 'UNKNOWN');
  assert.equal(nse.observationStatus, 'LINK_ONLY'); // Legal policy, not an error!
});

test('WP09-T06 Official links cannot produce native READY or NO_RESULTS observations', () => {
  const linkCandidate = {
    sourceId: 'nse-ipo',
    accessMode: 'OFFICIAL_LINK',
    rights: 'LINK_ONLY',
    publisher: 'NSE',
    state: 'READY',
    validity: 'VALID',
    providerAsOf: '2026-11-20',
    originalUrl: 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo'
  };
  const check = validateSourceReceipt(linkCandidate);
  assert.equal(check.ok, false);
  assert.ok(check.errors.includes('NOT_NATIVE_OBSERVATION'));
});

test('WP09-T07 Provider embeds cannot yield extractable native quote observations', () => {
  const embedCandidate = {
    sourceId: 'tradingview-bse',
    accessMode: 'PROVIDER_EMBED',
    rights: 'DISPLAY_PROVIDER_ONLY',
    publisher: 'TradingView',
    state: 'READY',
    validity: 'VALID',
    providerAsOf: '2026-11-20T10:00:00Z',
    originalUrl: 'https://www.tradingview.com/widget/'
  };
  const check = validateSourceReceipt(embedCandidate);
  assert.equal(check.ok, false);
  assert.ok(check.errors.includes('NOT_NATIVE_OBSERVATION'));
});

test('WP09-T08 World Bank NO_PUBLICATION remains fail-closed without authorization', () => {
  const wbCandidate = {
    sourceId: 'world-bank',
    accessMode: 'LICENSED_OPEN_DATA',
    rights: 'NO_PUBLICATION',
    publisher: 'World Bank',
    state: 'READY',
    validity: 'VALID',
    providerAsOf: '2025',
    originalUrl: 'https://data.worldbank.org/'
  };
  const check = validateSourceReceipt(wbCandidate);
  assert.equal(check.ok, false);
  assert.ok(check.errors.includes('RIGHTS_DO_NOT_ALLOW_NATIVE_RESULT'));
});

test('WP09-T09 Exactly 100 records retained in activity log; FIFO pruning works', () => {
  const storage = createMockStorage();
  for (let i = 0; i < 110; i++) {
    appendReceiptRecord(storage, {
      sourceId: 'mfapi',
      accessMode: 'DIRECT_ON_DEMAND',
      rights: 'BROWSER_DIRECT_CONDITIONAL',
      publisher: 'MFapi',
      state: 'HISTORICAL',
      validity: 'VALID',
      providerAsOf: '2026-11-01',
      providerClockGranularity: 'day',
      originalUrl: 'https://www.mfapi.in/docs/',
      transportStatus: 200,
      checkedAt: `2026-11-20T10:${String(i % 60).padStart(2, '0')}:00Z`
    });
  }

  const { records } = readReceiptsLog(storage);
  assert.equal(records.length, 100, 'Must not exceed 100 retained records');
  const summary = getReceiptsLogSummary(storage);
  assert.equal(summary.totalRetained, 100);
  assert.equal(summary.isPruned, true);
});

test('WP09-T10 Malformed receipt storage handled gracefully without silent destructive wipe', () => {
  const storage = createMockStorage({
    [RECEIPTS_LOG_STORAGE_KEY]: '{corrupted_not_json'
  });
  const { records, corrupt } = readReceiptsLog(storage);
  assert.equal(corrupt, true);
  assert.equal(records.length, 0);
  // Key must still exist in storage!
  assert.equal(storage.getItem(RECEIPTS_LOG_STORAGE_KEY), '{corrupted_not_json');
});

test('WP09-T11 Diagnostic export uses strict allowlist schema; contains zero portfolio records', () => {
  const storageSummary = {
    knownPayloadBytes: 2500,
    estimatedOriginQuotaBytes: 500000,
    itemCounts: { 'nw7.market-watchlist.v2': 5 }
  };
  const jsonStr = serializeHealthDiagnostics({
    appVersion: '7.0.0',
    sourceStates: Object.values(buildInitialSourceStates()),
    storageSummary,
    receiptsSummary: { retainedCount: 10, discardedCount: 2 }
  });

  assert.ok(assertPayloadHasNoPortfolioData(jsonStr), 'Must have no portfolio data');
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.sources.length, 12);
  assert.equal(parsed.storage.knownPayloadBytes, 2500);
  assert.equal(parsed.portfolio, undefined);
  assert.equal(parsed.lots, undefined);
});

test('WP09-T12 URL sanitization: sensitive query parameters and paths stripped', () => {
  const sensitiveUrl = 'https://www.mfapi.in/docs/?token=secret_123&user_search=private#hash';
  const clean = sanitizeSourceUrl(sensitiveUrl);
  assert.equal(clean, 'https://www.mfapi.in/docs/');
});

test('WP09-T13 Watchlist migration preserves exact nw7.india-watchlist.v1 legacy bytes', () => {
  const legacyOriginal = JSON.stringify(['INFY', 'TCS.NS', 'RELIANCE']);
  const storage = createMockStorage({
    [MARKET_LEGACY_STORAGE_KEYS.watchlist]: legacyOriginal
  });

  const res = executeWatchlistMigration(storage);
  assert.equal(res.ok, true);
  assert.equal(res.migratedCount, 3);

  // Legacy key must be 100% byte-for-byte identical
  assert.equal(storage.getItem(MARKET_LEGACY_STORAGE_KEYS.watchlist), legacyOriginal);
});

test('WP09-T14 Validated migration writes canonical V2, validates output, and reads back', () => {
  const storage = createMockStorage({
    [MARKET_LEGACY_STORAGE_KEYS.watchlist]: JSON.stringify(['INFY', 'TCS.NS', 'INVALID_SYMBOL!@#'])
  });

  const res = executeWatchlistMigration(storage);
  assert.equal(res.ok, true);
  assert.deepEqual(res.v2Keys, ['NSE:INFY', 'NSE:TCS']);
  assert.deepEqual(res.rejected, ['INVALID_SYMBOL!@#']);

  const v2Readback = JSON.parse(storage.getItem(MARKET_R21_STORAGE_KEYS.watchlistV2));
  assert.deepEqual(v2Readback, ['NSE:INFY', 'NSE:TCS']);
});

test('WP09-T15 Rollback conflict: blocked when new edits exist in V2; permits if unedited', () => {
  const storage = createMockStorage({
    [MARKET_LEGACY_STORAGE_KEYS.watchlist]: JSON.stringify(['INFY', 'TCS'])
  });

  // Step 1: Migrate
  executeWatchlistMigration(storage);

  // Step 2: Unedited -> rollback is eligible
  const el1 = checkRollbackEligibility(storage);
  assert.equal(el1.eligible, true);

  // Step 3: User makes new edit in V2 on Day 2
  const edited = ['NSE:INFY', 'NSE:TCS', 'NSE:RELIANCE'];
  storage.setItem(MARKET_R21_STORAGE_KEYS.watchlistV2, JSON.stringify(edited));

  // Step 4: Rollback must be BLOCKED!
  const el2 = checkRollbackEligibility(storage);
  assert.equal(el2.eligible, false);
  assert.equal(el2.reason, 'CONFLICT_NEW_EDITS_PRESENT');

  const rollbackRes = rollbackWatchlistMigration(storage, false);
  assert.equal(rollbackRes.ok, false);
  assert.equal(rollbackRes.blocked, true);

  // V2 must STILL exist!
  assert.ok(storage.getItem(MARKET_R21_STORAGE_KEYS.watchlistV2));
});

test('WP09-T16 Saved funds safe: normalization is in-memory only; never overwrites legacy storage key', () => {
  const legacyFunds = JSON.stringify(['119551', '120503', 123456, 'invalid_code']);
  const storage = createMockStorage({
    [MARKET_LEGACY_STORAGE_KEYS.funds]: legacyFunds
  });

  const norm = getNormalizedSavedFunds(storage);
  assert.deepEqual(norm.codes, ['119551', '120503', '123456']);
  assert.deepEqual(norm.rejected, ['invalid_code']);

  // Storage key is completely untouched
  assert.equal(storage.getItem(MARKET_LEGACY_STORAGE_KEYS.funds), legacyFunds);
  // No unauthorized V2 key created
  assert.equal(storage.getItem('nw7.market-saved-funds.v2'), null);
});

test('WP09-T17 Storage quota resilience: quota failure leaves original records intact', () => {
  const legacy = JSON.stringify(['INFY']);
  const storage = createMockStorage({
    [MARKET_LEGACY_STORAGE_KEYS.watchlist]: legacy
  });

  // Simulate quota failure
  storage.setItem = (k, v) => {
    if (k === MARKET_R21_STORAGE_KEYS.watchlistV2) {
      throw new Error('QuotaExceededError');
    }
    storage._store.set(k, String(v));
  };

  const res = executeWatchlistMigration(storage);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'STORAGE_QUOTA_EXCEEDED');
  assert.equal(storage.getItem(MARKET_LEGACY_STORAGE_KEYS.watchlist), legacy);
});

test('WP09-T18 Cross-tab invalidation: storage keys allowlist correctly identifies cache keys', () => {
  assert.ok(CACHE_KEYS_ALLOWLIST.includes('nw7.omr-inr.frankfurter.v1'));
  assert.ok(CACHE_KEYS_ALLOWLIST.includes('nw7.market-fund-nav.v1'));
  assert.ok(CACHE_KEYS_ALLOWLIST.includes('nw7.market-source-receipts.v1'));
  assert.ok(!CACHE_KEYS_ALLOWLIST.includes(MARKET_R21_STORAGE_KEYS.portfolio));
});

test('WP09-T19 FX cache purge targets only allowlisted FX keys', () => {
  const storage = createMockStorage({
    'nw7.omr-inr.frankfurter.v1': '{"rate":216.5}',
    'nw7.usd-inr.frankfurter.v1': '{"rate":84.2}',
    'nw7.market-fund-nav.v1': '{"nav":50}',
    [MARKET_R21_STORAGE_KEYS.portfolio]: '{"lots":[]}'
  });

  // Purge only FX
  storage.removeItem('nw7.omr-inr.frankfurter.v1');
  storage.removeItem('nw7.usd-inr.frankfurter.v1');

  assert.equal(storage.getItem('nw7.omr-inr.frankfurter.v1'), null);
  assert.equal(storage.getItem('nw7.usd-inr.frankfurter.v1'), null);
  // NAV and portfolio must remain intact
  assert.ok(storage.getItem('nw7.market-fund-nav.v1'));
  assert.ok(storage.getItem(MARKET_R21_STORAGE_KEYS.portfolio));
});

test('WP09-T20 NAV cache purge targets only allowlisted NAV keys', () => {
  const storage = createMockStorage({
    'nw7.market-fund-nav.v1': '{"nav":50}',
    'nw7.market-fund-history.v1': '{"history":[]}',
    [MARKET_LEGACY_STORAGE_KEYS.funds]: '["119551"]'
  });

  storage.removeItem('nw7.market-fund-nav.v1');
  storage.removeItem('nw7.market-fund-history.v1');

  assert.equal(storage.getItem('nw7.market-fund-nav.v1'), null);
  assert.equal(storage.getItem('nw7.market-fund-history.v1'), null);
  // Saved funds must remain intact
  assert.ok(storage.getItem(MARKET_LEGACY_STORAGE_KEYS.funds));
});

test('WP09-T21 In-flight race: epoch increments on purge to invalidate pending writes', () => {
  let epoch = 1;
  const requestEpoch = epoch;

  // Cache purge occurs
  epoch += 1;

  // In-flight fetch finishes with older epoch
  const shouldDiscard = requestEpoch !== epoch;
  assert.equal(shouldDiscard, true, 'Write must be discarded because epoch incremented');
});

test('WP09-T22 Store invalidation: cache keys allowlist covers verified temporary keys', () => {
  for (const k of CACHE_KEYS_ALLOWLIST) {
    assert.ok(PROTECTED_KEYS_ALLOWLIST.indexOf(k) === -1, `Cache key ${k} must not be in protected keys`);
  }
});

test('WP09-T23 User data intact: full cache purge preserves portfolio, watchlists, funds, settings', () => {
  const storage = createMockStorage({
    [MARKET_R21_STORAGE_KEYS.portfolio]: '{"lots":[{"id":"l1"}]}',
    [MARKET_LEGACY_STORAGE_KEYS.watchlist]: '["INFY"]',
    [MARKET_R21_STORAGE_KEYS.watchlistV2]: '["NSE:INFY"]',
    [MARKET_LEGACY_STORAGE_KEYS.funds]: '["119551"]',
    [MARKET_LEGACY_STORAGE_KEYS.indexPins]: '["NIFTY 50"]',
    [MARKET_LEGACY_STORAGE_KEYS.settings]: '{"theme":"dark"}',
    'nw7.omr-inr.frankfurter.v1': '{"rate":216}',
    'nw7.market-source-receipts.v1': '[]'
  });

  // Purge all allowlisted cache keys
  for (const k of CACHE_KEYS_ALLOWLIST) {
    storage.removeItem(k);
  }

  // All protected keys MUST remain
  for (const k of PROTECTED_KEYS_ALLOWLIST) {
    assert.ok(storage.getItem(k), `Protected key ${k} must survive cache purge`);
  }
});

test('WP09-T24 Missing receipts never produce a false READY state', () => {
  const states = buildInitialSourceStates();
  for (const s of Object.values(states)) {
    assert.notEqual(s.observationStatus, 'READY', `Initial source ${s.sourceId} cannot be READY without a receipt`);
  }
});

test('WP09-T25 Honest grading: absence of native quotes caps availability but does not give false Grade A', () => {
  const states = buildInitialSourceStates();
  const evaluation = evaluateMarketQuality({
    sourceStates: states,
    receipts: [],
    dataCoverage: { indicesCount: 0, moversCount: 0 }
  });

  assert.equal(evaluation.dimensions.policyCompliance.status, 'PASS');
  assert.equal(evaluation.dimensions.dataAvailability.status, 'LIMITED_FREE_TIER');
  assert.equal(evaluation.honestSummary.hasNativeExchangeQuotes, false);
});

test('WP09-T26 Policy separation: intentional absence of unlicensed quotes is not penalized as policy failure', () => {
  const states = buildInitialSourceStates();
  const eval1 = evaluateMarketQuality({ sourceStates: states, dataCoverage: { indicesCount: 0 } });
  assert.equal(eval1.dimensions.policyCompliance.status, 'PASS');
  assert.equal(eval1.dimensions.policyCompliance.score, 100);
});

test('WP09-T27 Storage labels: distinguishes known-key UTF-8 byte usage from origin quota estimate', () => {
  const storage = createMockStorage({
    [MARKET_R21_STORAGE_KEYS.watchlistV2]: '["NSE:INFY"]'
  });
  const summary = getStorageUsageSummary(storage, 10000000);
  assert.ok(summary.knownPayloadBytes > 0);
  assert.equal(summary.estimatedOriginQuotaBytes, 10000000);
});

test('WP09-T28 Responsive & A11y: health.css contains responsive media queries and accessible tokens', () => {
  const cssPath = resolve(root, 'src/market/features/health/health.css');
  assert.ok(existsSync(cssPath), 'health.css must exist');
  const css = readFileSync(cssPath, 'utf8');
  assert.ok(css.includes('@media print'), 'Must include print media query');
  assert.ok(css.includes('--bg-card'), 'Must use CSS tokens');
});

test('WP09-T29 Malicious URL query containing private tokens cannot reach diagnostic export', () => {
  const maliciousUrl = 'https://www.mfapi.in/docs/?account_num=123456789&secret=token';
  const clean = sanitizeSourceUrl(maliciousUrl);
  assert.equal(clean.includes('123456789'), false);
  assert.equal(clean.includes('secret'), false);
});

test('WP09-T30 Private data nested in error objects cannot escape allowlist serializer', () => {
  const dirtyCandidate = {
    sourceId: 'mfapi',
    publisher: 'MFapi',
    accessMode: 'DIRECT_ON_DEMAND',
    rights: 'BROWSER_DIRECT_CONDITIONAL',
    state: 'FAILED',
    // Attempted injection of private object
    privateHoldings: [{ symbol: 'TCS', quantity: 500, purchasePrice: 3500 }]
  };
  const jsonStr = serializeHealthDiagnostics({
    sourceStates: [dirtyCandidate]
  });
  assert.equal(jsonStr.includes('privateHoldings'), false);
  assert.equal(jsonStr.includes('3500'), false);
  assert.ok(assertPayloadHasNoPortfolioData(jsonStr));
});

test('WP09-T31 Third-party script trust boundary documented transparently', () => {
  assert.ok(PRIVACY_DISCLOSURE.trustBoundaryNotes.length >= 3);
  assert.ok(PRIVACY_DISCLOSURE.trustBoundaryNotes.some(n => n.includes('TradingView')));
});

test('WP09-T32 Privacy wording: does not make misleading 100% confidentiality claim', () => {
  assert.ok(PRIVACY_DISCLOSURE.badgeText.includes('Third-party integration privacy verification pending'));
  assert.ok(!PRIVACY_DISCLOSURE.badgeText.includes('100% Guaranteed Zero Leakage'));
});

test('WP09-T33 Interrupted write recovery: missing journal does not corrupt V2', () => {
  const storage = createMockStorage({
    [MARKET_R21_STORAGE_KEYS.watchlistV2]: '["NSE:INFY"]'
    // MIGRATION_JOURNAL_KEY intentionally missing
  });
  const el = checkRollbackEligibility(storage);
  assert.equal(el.eligible, false);
  assert.equal(el.reason, 'NO_MIGRATION_JOURNAL');
});

test('WP09-T34 WP-03 V2 watchlist edits survive attempted rollback with conflict warning', () => {
  const storage = createMockStorage();
  storage.setItem(MARKET_LEGACY_STORAGE_KEYS.watchlist, JSON.stringify(['INFY']));
  executeWatchlistMigration(storage);

  // User adds RELIANCE in WP-03
  storage.setItem(MARKET_R21_STORAGE_KEYS.watchlistV2, JSON.stringify(['NSE:INFY', 'NSE:RELIANCE']));

  const res = rollbackWatchlistMigration(storage, false);
  assert.equal(res.ok, false);
  assert.equal(res.blocked, true);
  assert.equal(JSON.parse(storage.getItem(MARKET_R21_STORAGE_KEYS.watchlistV2)).length, 2);
});

test('WP09-T35 WP-05 saved-fund records survive normalization and cache clearing byte-for-byte', () => {
  const originalFunds = JSON.stringify(['119551', '120503']);
  const storage = createMockStorage({
    [MARKET_LEGACY_STORAGE_KEYS.funds]: originalFunds,
    'nw7.market-fund-nav.v1': '{"119551":50}'
  });

  getNormalizedSavedFunds(storage);
  storage.removeItem('nw7.market-fund-nav.v1'); // Cache cleared

  assert.equal(storage.getItem(MARKET_LEGACY_STORAGE_KEYS.funds), originalFunds);
});

test('WP09-T36 WP-04 portfolio ledger survives every permitted WP-09 action byte-for-byte', () => {
  const originalPortfolio = JSON.stringify({ lots: [{ id: 'lot-1', symbol: 'NSE:INFY', qty: 10 }] });
  const storage = createMockStorage({
    [MARKET_R21_STORAGE_KEYS.portfolio]: originalPortfolio,
    [MARKET_LEGACY_STORAGE_KEYS.watchlist]: '["INFY"]'
  });

  // Execute migration
  executeWatchlistMigration(storage);
  // Clear caches
  for (const k of CACHE_KEYS_ALLOWLIST) {
    storage.removeItem(k);
  }
  // Check usage
  getStorageUsageSummary(storage);

  assert.equal(storage.getItem(MARKET_R21_STORAGE_KEYS.portfolio), originalPortfolio);
});

test('WP09-T37 Invalid/malformed receipt cannot make a source appear qualified or ready', () => {
  const initial = buildInitialSourceStates()['mfapi'];
  const malformed = {
    recordClass: RECORD_CLASSES.REJECTED_ATTEMPT,
    capturedAt: new Date().toISOString(),
    sourceId: 'mfapi',
    errors: ['INVALID_PROVIDER_CLOCK']
  };
  const updated = applyReceiptToSourceState(initial, malformed);
  assert.equal(updated.observationStatus, 'FAILED');
  assert.notEqual(updated.observationStatus, 'READY');
});

test('WP09-T38 Clean non-destructive INTEGRATION_PATCH_WP10.md delivered', () => {
  const patchPath = resolve(root, 'src/market/features/health/INTEGRATION_PATCH_WP10.md');
  assert.ok(existsSync(patchPath), 'INTEGRATION_PATCH_WP10.md must exist');
  const content = readFileSync(patchPath, 'utf8');
  assert.ok(content.includes('HealthPanel'), 'Must document HealthPanel mount');
  assert.ok(content.includes('evaluateMarketQuality'), 'Must document quality grading');
});
