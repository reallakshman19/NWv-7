/**
 * Static contract tests and foundation boundary verification for WP-03 (Equity Research & Watchlist).
 * Node-native (Node 22 test runner). No DOM or JSX runtime required.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

import {
  TRACKED_NSE_METADATA,
  TRACKED_SYMBOLS,
  getEquityMetadata,
  getNseQuoteUrl,
  getNseAnnouncementsUrl,
} from '../src/market/features/equity/equityMetadata.js';

import {
  validateCustomSymbol,
  toCanonicalKey,
  fromCanonicalKey,
  isFormulaInjection,
  parseWatchlistFile,
  generateWatchlistCsv,
  generateWatchlistJson,
  MAX_WATCHLIST_LIMIT,
  MAX_FILE_SIZE_BYTES,
} from '../src/market/features/equity/equityModel.js';

import {
  WATCHLIST_V2_KEY,
  WATCHLIST_V1_KEY,
} from '../src/market/features/equity/watchlistStore.js';

const FOUNDATION_BASE_SHA = '2510cac78e4ec177efaaedfb8de2ac3504415813';

// ----------------------------------------------------------------------------
// WP03-S01: index.js exports canonical contract names
// ----------------------------------------------------------------------------
test('WP03-S01: index.js exports canonical contract names', () => {
  const indexPath = 'src/market/features/equity/index.js';
  assert.ok(existsSync(indexPath), 'Missing src/market/features/equity/index.js');
  const content = readFileSync(indexPath, 'utf-8');

  assert.match(content, /EquityResearchPanel/);
  assert.match(content, /WatchlistSummary/);
  assert.match(content, /createWatchlistStore/);
  assert.match(content, /useWatchlist/);
  assert.match(content, /createNotesStore/);
  assert.match(content, /useEquityNote/);
  assert.match(content, /TRACKED_NSE_METADATA/);
  assert.match(content, /parseWatchlistFile/);
  assert.match(content, /generateWatchlistCsv/);
  assert.match(content, /generateWatchlistJson/);
  assert.match(content, /ImportPreviewModal/);

  assert.equal(MAX_WATCHLIST_LIMIT, 12);
  assert.equal(MAX_FILE_SIZE_BYTES, 100 * 1024);
  assert.equal(WATCHLIST_V2_KEY, 'nw7.market-watchlist.v2');
  assert.equal(WATCHLIST_V1_KEY, 'nw7.india-watchlist.v1');
});

// ----------------------------------------------------------------------------
// WP03-S02: 16 tracked universe symbols exist in metadata with valid structure
// ----------------------------------------------------------------------------
test('WP03-S02: 16 tracked universe symbols exist in metadata with valid structure', () => {
  assert.equal(TRACKED_SYMBOLS.length, 16);

  const expected16 = [
    'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'ITC', 'BHARTIARTL',
    'KOTAKBANK', 'LT', 'HINDUNILVR', 'AXISBANK', 'BAJFINANCE', 'MARUTI', 'WIPRO', 'SUNPHARMA',
  ];

  for (const sym of expected16) {
    assert.ok(TRACKED_NSE_METADATA[sym], `Missing metadata for ${sym}`);
    const meta = getEquityMetadata(sym);
    assert.equal(meta.isCurated, true);
    assert.equal(meta.exchange, 'NSE');
    assert.equal(meta.canonicalKey, `NSE:${sym}`);
    assert.ok(typeof meta.name === 'string' && meta.name.length > 0);
    assert.ok(typeof meta.sector === 'string' && meta.sector.includes('(Descriptive)'));
  }
});

// ----------------------------------------------------------------------------
// WP03-S03: Custom symbol validation rejects HTML, formulas, invalid formats
// ----------------------------------------------------------------------------
test('WP03-S03: Custom symbol validation rejects HTML, formulas, invalid formats', () => {
  // Valid symbols
  assert.equal(validateCustomSymbol('infy'), 'INFY');
  assert.equal(validateCustomSymbol('M&M'), 'M&M');
  assert.equal(validateCustomSymbol('BAJAJ-AUTO'), 'BAJAJ-AUTO');
  assert.equal(validateCustomSymbol('TATAMOTORS.NS'), 'TATAMOTORS');

  // Invalid symbols / malicious payloads
  assert.equal(validateCustomSymbol('<script>alert(1)</script>'), null);
  assert.equal(validateCustomSymbol('"><img src=x onerror=alert(1)>'), null);
  assert.equal(validateCustomSymbol('=cmd|calc'), null);
  assert.equal(validateCustomSymbol('+1234'), null);
  assert.equal(validateCustomSymbol('-2+3'), null);
  assert.equal(validateCustomSymbol('@SUM(A1:A10)'), null);
  assert.equal(validateCustomSymbol('TOOLONGSYMBOLNAMETHATEXCEEDSTWENTYCHARS'), null);
  assert.equal(validateCustomSymbol(''), null);
  assert.equal(validateCustomSymbol(null), null);
  assert.equal(validateCustomSymbol(123), null);
});

// ----------------------------------------------------------------------------
// WP03-S04: Formula injection detection correctly flags spreadsheet triggers
// ----------------------------------------------------------------------------
test('WP03-S04: Formula injection detection correctly flags spreadsheet triggers', () => {
  assert.equal(isFormulaInjection('=1+1'), true);
  assert.equal(isFormulaInjection('+123'), true);
  assert.equal(isFormulaInjection('-123'), true);
  assert.equal(isFormulaInjection('@SUM(A1)'), true);
  assert.equal(isFormulaInjection('\tcmd'), true);
  assert.equal(isFormulaInjection('\rcmd'), true);
  assert.equal(isFormulaInjection('|cmd'), true);

  assert.equal(isFormulaInjection('INFY'), false);
  assert.equal(isFormulaInjection('NSE:INFY'), false);
  assert.equal(isFormulaInjection('RELIANCE'), false);
});

// ----------------------------------------------------------------------------
// WP03-S05: CSV & JSON import parsing rejects oversized payloads, formula injection, non-NSE
// ----------------------------------------------------------------------------
test('WP03-S05: CSV & JSON import parsing rejects oversized payloads, formula injection, non-NSE', () => {
  // 1. Oversized file (> 100 KB)
  const hugeContent = 'exchange,symbol\n' + 'NSE,INFY\n'.repeat(12000);
  const sizeRes = parseWatchlistFile(hugeContent);
  assert.equal(sizeRes.ok, false);
  assert.match(sizeRes.error, /exceeds the maximum allowed limit of 100 KB/i);

  // 2. Formula injection & non-NSE in CSV
  const maliciousCsv = `exchange,symbol\nNSE,INFY\nNSE,=cmd|calc\nBSE,TCS\nNSE,SBIN\n`;
  const csvRes = parseWatchlistFile(maliciousCsv, ['NSE:INFY']);
  assert.equal(csvRes.ok, true);
  assert.deepEqual(csvRes.validCandidates, ['NSE:SBIN']);
  assert.deepEqual(csvRes.duplicateKeys, ['NSE:INFY']);
  assert.equal(csvRes.rejectedRows.length, 2);
  assert.match(csvRes.rejectedRows[0].reason, /Formula injection/i);
  assert.match(csvRes.rejectedRows[1].reason, /Non-NSE exchange/i);

  // 3. JSON roundtrip
  const exportedJson = generateWatchlistJson(['NSE:INFY', 'NSE:TCS']);
  const jsonRes = parseWatchlistFile(exportedJson, []);
  assert.equal(jsonRes.ok, true);
  assert.deepEqual(jsonRes.validCandidates, ['NSE:INFY', 'NSE:TCS']);

  // 4. CSV roundtrip
  const exportedCsv = generateWatchlistCsv(['NSE:INFY', 'NSE:TCS']);
  const csvRoundRes = parseWatchlistFile(exportedCsv, []);
  assert.equal(csvRoundRes.ok, true);
  assert.deepEqual(csvRoundRes.validCandidates, ['NSE:INFY', 'NSE:TCS']);
});

// ----------------------------------------------------------------------------
// WP03-S06: Shared files remain 100% untouched against foundation commit
// ----------------------------------------------------------------------------
test('WP03-S06: Shared files remain 100% untouched against foundation commit (WP03-T16)', () => {
  const protectedPaths = [
    'src/pages/MarketPage.jsx',
    'src/components/market/BseMarketWidget.jsx',
    'src/services/marketWorkspaceRoute.js',
    'src/context/MarketContext.jsx',
    'src/components/market/MarketWorkspaceTools.jsx',
    'src/market/contracts/index.js',
    'src/market/contracts/instrumentIdentity.js',
    'src/market/contracts/sourceReceipt.js',
    'src/market/contracts/storagePolicy.js',
  ];

  for (const relPath of protectedPaths) {
    const diff = execSync(`git diff ${FOUNDATION_BASE_SHA} -- "${relPath}"`, {
      encoding: 'utf-8',
    });
    assert.equal(
      diff.trim(),
      '',
      `Protected path '${relPath}' has been modified against foundation commit ${FOUNDATION_BASE_SHA}!`
    );
  }
});

// ----------------------------------------------------------------------------
// WP03-S07: Integration patch proposal is documented and bounded
// ----------------------------------------------------------------------------
test('WP03-S07: Integration patch proposal is documented and bounded', () => {
  const patchPath = 'src/market/features/equity/INTEGRATION_PATCH_WP10.md';
  assert.ok(existsSync(patchPath), 'Missing INTEGRATION_PATCH_WP10.md');
  const content = readFileSync(patchPath, 'utf-8');
  assert.match(content, /WatchlistSummary/);
  assert.match(content, /EquityResearchPanel/);
  assert.match(content, /WP-10/);
});
