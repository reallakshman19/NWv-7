/**
 * Node-native test suite for WP-04 (Portfolio & Transactions Desk)
 * Run: node --test scripts/test_market_r21_wp04_portfolio.mjs
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import {
  validateTransactionInputs,
  sortTransactions,
  replayPortfolio
} from '../src/market/features/portfolio/portfolioAccounting.js';

import {
  buildPortfolioCashFlows
} from '../src/market/features/portfolio/portfolioCashFlows.js';

import {
  computePortfolioXirr,
  referenceCalcXirr,
  calendarDayDifference
} from '../src/market/features/portfolio/portfolioXirrAdapter.js';

import {
  createDefaultPortfolioState,
  sanitizeCsvCell,
  desanitizeCsvCell,
  PORTFOLIO_STORAGE_KEY
} from '../src/market/features/portfolio/portfolioStore.js';

test('WP04-S01 Golden Case: Moving weighted-average cost with fees', () => {
  // Golden Case from plan & independent review:
  // BUY 10 @ 100 with 20 fee => total buy cash outflow ₹1,020, avg cost = ₹102/unit.
  // SELL 5 @ 120 with 10 fee => net sell cash inflow ₹590.
  // Cost relieved = 5 * 102 = 510.
  // Remaining cost basis = 1020 - 510 = ₹510 (5 @ ₹102).
  // Realized P&L = 590 - 510 = ₹80.
  // Total fees paid = 20 + 10 = ₹30.
  const transactions = [
    {
      id: 'tx_buy_1',
      type: 'BUY',
      instrumentKey: 'NSE:INFY',
      date: '2026-01-01',
      sequenceIndex: 0,
      quantity: 10,
      price: 100,
      fee: 20
    },
    {
      id: 'tx_sell_1',
      type: 'SELL',
      instrumentKey: 'NSE:INFY',
      date: '2026-01-15',
      sequenceIndex: 0,
      quantity: 5,
      price: 120,
      fee: 10
    }
  ];

  const result = replayPortfolio(transactions);
  assert.equal(result.validity, 'VALID');
  assert.equal(result.hasInvalidLedger, false);
  assert.equal(result.totalRemainingCostBasis, 510);
  assert.equal(result.totalRealizedPnL, 80);
  assert.equal(result.totalFeesPaid, 30);
  assert.equal(result.activeHoldingsCount, 1);

  const pos = result.positions[0];
  assert.equal(pos.instrumentKey, 'NSE:INFY');
  assert.equal(pos.currentQty, 5);
  assert.equal(pos.averageCost, 102);
  assert.equal(pos.remainingCostBasis, 510);
  assert.equal(pos.realizedPnL, 80);
  assert.equal(pos.totalFeesPaid, 30);
});

test('WP04-S02 Fail-closed oversell replay halts accounting on deficit', () => {
  const transactions = [
    {
      id: 'tx_buy_1',
      type: 'BUY',
      instrumentKey: 'NSE:TCS',
      date: '2026-02-01',
      sequenceIndex: 0,
      quantity: 5,
      price: 3000,
      fee: 15
    },
    {
      id: 'tx_sell_oversell',
      type: 'SELL',
      instrumentKey: 'NSE:TCS',
      date: '2026-02-10',
      sequenceIndex: 0,
      quantity: 10, // tried to sell 10 with only 5 available!
      price: 3200,
      fee: 20
    }
  ];

  const result = replayPortfolio(transactions);
  assert.equal(result.hasInvalidLedger, true);
  assert.equal(result.validity, 'INVALID_LEDGER');
  assert.equal(result.valuationStatus, 'INVALID');
  assert.equal(result.totalCurrentValue, null);
  assert.equal(result.totalUnrealizedPnL, null);

  const pos = result.positions.find(p => p.instrumentKey === 'NSE:TCS');
  assert.ok(pos);
  assert.equal(pos.status, 'INVALID_LEDGER');
  assert.equal(pos.oversellDeficit, 5);
  assert.equal(pos.invalidTxId, 'tx_sell_oversell');
});

test('WP04-S03 Multi-trade weighted-average cost accumulation and full liquidation', () => {
  const transactions = [
    { id: '1', type: 'BUY', instrumentKey: 'NSE:RELIANCE', date: '2026-01-01', quantity: 10, price: 2000, fee: 0 },
    { id: '2', type: 'BUY', instrumentKey: 'NSE:RELIANCE', date: '2026-01-05', quantity: 10, price: 2200, fee: 0 },
    // Avg cost = (20000 + 22000) / 20 = 2100.
    { id: '3', type: 'SELL', instrumentKey: 'NSE:RELIANCE', date: '2026-01-10', quantity: 20, price: 2300, fee: 0 }
    // Full liquidation: proceeds = 46000, cost relieved = 42000, realized = 4000.
  ];

  const result = replayPortfolio(transactions);
  assert.equal(result.validity, 'VALID');
  assert.equal(result.activeHoldingsCount, 0);
  assert.equal(result.valuationStatus, 'LIQUIDATED');
  assert.equal(result.totalRemainingCostBasis, 0);
  assert.equal(result.totalRealizedPnL, 4000);
  assert.equal(result.totalCurrentValue, 0);
  assert.equal(result.totalUnrealizedPnL, 0);

  const pos = result.positions[0];
  assert.equal(pos.currentQty, 0);
  assert.equal(pos.remainingCostBasis, 0);
  assert.equal(pos.averageCost, 0);
  assert.equal(pos.realizedPnL, 4000);
});

test('WP04-S04 Deterministic event ordering respects same-day sequenceIndex', () => {
  // Scenario: Same day BUY and SELL. If sorted incorrectly (SELL first), oversell occurs!
  const txs = [
    { id: 'b', type: 'SELL', instrumentKey: 'NSE:INFY', date: '2026-03-01', sequenceIndex: 1, quantity: 10, price: 150 },
    { id: 'a', type: 'BUY', instrumentKey: 'NSE:INFY', date: '2026-03-01', sequenceIndex: 0, quantity: 10, price: 100 }
  ];

  const sorted = sortTransactions(txs);
  assert.equal(sorted[0].id, 'a');
  assert.equal(sorted[1].id, 'b');

  const replayed = replayPortfolio(txs);
  assert.equal(replayed.validity, 'VALID');
  assert.equal(replayed.hasInvalidLedger, false);
});

test('WP04-S05 Valuation status and missing marks handling (no false ₹0.00)', () => {
  const txs = [
    { id: '1', type: 'BUY', instrumentKey: 'NSE:INFY', date: '2026-01-01', quantity: 10, price: 100 },
    { id: '2', type: 'BUY', instrumentKey: 'NSE:TCS', date: '2026-01-01', quantity: 5, price: 200 }
  ];

  // 1. No marks
  const r1 = replayPortfolio(txs, {});
  assert.equal(r1.valuationStatus, 'PARTIAL');
  assert.equal(r1.totalCurrentValue, null); // NEVER 0!
  assert.equal(r1.totalUnrealizedPnL, null);

  // 2. Partial marks (only INFY marked)
  const r2 = replayPortfolio(txs, {
    'NSE:INFY': { price: 120, asOfDate: '2026-01-10' }
  });
  assert.equal(r2.valuationStatus, 'PARTIAL');
  assert.equal(r2.totalCurrentValue, null);

  // 3. Complete marks
  const r3 = replayPortfolio(txs, {
    'NSE:INFY': { price: 120, asOfDate: '2026-01-10' },
    'NSE:TCS': { price: 250, asOfDate: '2026-01-10' }
  });
  assert.equal(r3.valuationStatus, 'COMPLETE');
  // INFY: 10 * 120 = 1200; TCS: 5 * 250 = 1250; total = 2450.
  assert.equal(r3.totalCurrentValue, 2450);
  // Cost basis: 10*100 + 5*200 = 2000.
  assert.equal(r3.totalRemainingCostBasis, 2000);
  assert.equal(r3.totalUnrealizedPnL, 450);
  assert.equal(r3.totalUnrealizedPnLPercent, 22.5);
});

test('WP04-S06 Cash flows builder handles open terminal marks and liquidated portfolios', () => {
  const txs = [
    { id: '1', type: 'BUY', instrumentKey: 'NSE:INFY', date: '2026-01-01', quantity: 10, price: 100, fee: 10 }
  ];

  // 1. Missing mark on open holding
  const cf1 = buildPortfolioCashFlows(txs, {});
  assert.equal(cf1.ok, false);
  assert.equal(cf1.errorCode, 'INCOMPLETE_VALUATION');

  // 2. Mark date before transaction date
  const cf2 = buildPortfolioCashFlows(txs, {
    'NSE:INFY': { price: 110, asOfDate: '2025-12-31' }
  });
  assert.equal(cf2.ok, false);
  assert.equal(cf2.errorCode, 'INCONSISTENT_DATES');

  // 3. Valid mark
  const cf3 = buildPortfolioCashFlows(txs, {
    'NSE:INFY': { price: 110, asOfDate: '2026-06-01' }
  });
  assert.equal(cf3.ok, true);
  assert.equal(cf3.cashFlows.length, 2);
  assert.deepEqual(cf3.cashFlows[0], { date: '2026-01-01', amount: -1010 });
  assert.deepEqual(cf3.cashFlows[1], { date: '2026-06-01', amount: 1100 });

  // 4. Fully liquidated portfolio needs no terminal mark
  const liquidatedTxs = [
    { id: '1', type: 'BUY', instrumentKey: 'NSE:INFY', date: '2026-01-01', quantity: 10, price: 100, fee: 0 },
    { id: '2', type: 'SELL', instrumentKey: 'NSE:INFY', date: '2026-02-01', quantity: 10, price: 120, fee: 0 }
  ];
  const cf4 = buildPortfolioCashFlows(liquidatedTxs, {});
  assert.equal(cf4.ok, true);
  assert.equal(cf4.terminalDate, null);
  assert.deepEqual(cf4.cashFlows, [
    { date: '2026-01-01', amount: -1000 },
    { date: '2026-02-01', amount: 1200 }
  ]);
});

test('WP04-S07 XIRR solver annualizes with 365.25 day calendar convention', () => {
  // Calendar day diff
  assert.equal(calendarDayDifference('2027-01-01', '2026-01-01'), 365);

  // Golden case from independent review:
  // Invest 100 on 2026-01-01, receive 110 on 2027-01-01 (365 calendar days).
  // Using 365.25 annualization convention: (1.1)^(365.25 / 365) - 1 ≈ 10.00718%.
  const cashFlows = [
    { date: '2026-01-01', amount: -100 },
    { date: '2027-01-01', amount: 110 }
  ];

  const res = referenceCalcXirr(cashFlows);
  assert.equal(res.ok, true);
  assert.ok(Math.abs(res.value - 0.1000718) < 1e-5, `Expected ~0.1000718, got ${res.value}`);
  assert.ok(Math.abs(res.annualizedPercent - 10.0072) < 0.01);
});

test('WP04-S08 Formula injection sanitization and desanitization', () => {
  const dangerous = ['=cmd|', '+123', '-456', '@SUM(A1)', '\tcalc', '\rcmd', '|test'];
  for (const val of dangerous) {
    const sanitized = sanitizeCsvCell(val);
    assert.ok(sanitized.startsWith('"\'') || sanitized.startsWith("'"), `Expected escape prefix for ${val}`);
    const roundTrip = desanitizeCsvCell(sanitized);
    assert.equal(roundTrip, val.trim());
  }

  // Safe strings remain clean
  assert.equal(sanitizeCsvCell('INFY'), 'INFY');
  assert.equal(sanitizeCsvCell('100.50'), '100.50');
});

test('WP04-S09 Transaction input validation bounds', () => {
  // Valid
  const v1 = validateTransactionInputs({
    type: 'BUY',
    exchange: 'NSE',
    symbol: 'INFY',
    date: '2026-04-15',
    sequenceIndex: 0,
    quantity: 10,
    price: 1450.50,
    fee: 20
  });
  assert.equal(v1.ok, true);
  assert.equal(v1.sanitized.instrumentKey, 'NSE:INFY');

  // Invalid date
  const v2 = validateTransactionInputs({
    type: 'BUY',
    instrumentKey: 'NSE:INFY',
    date: '2026-02-30', // Feb 30 does not exist
    quantity: 1,
    price: 100
  });
  assert.equal(v2.ok, false);

  // Invalid quantity (fractional shares not allowed)
  const v3 = validateTransactionInputs({
    type: 'BUY',
    instrumentKey: 'NSE:INFY',
    date: '2026-01-01',
    quantity: 1.5,
    price: 100
  });
  assert.equal(v3.ok, false);
});

test('WP04-S10 Static export audit of index.js and shared file isolation', () => {
  const indexContent = fs.readFileSync(
    path.resolve('src/market/features/portfolio/index.js'),
    'utf-8'
  );
  assert.ok(indexContent.includes('PortfolioPanel'));
  assert.ok(indexContent.includes('PortfolioSummary'));
  assert.ok(indexContent.includes('TransactionModal'));
  assert.ok(indexContent.includes('PriceMarkModal'));
  assert.ok(indexContent.includes('PortfolioImportModal'));
  assert.ok(indexContent.includes('portfolioStore'));
  assert.ok(indexContent.includes('replayPortfolio'));
  assert.ok(indexContent.includes('computePortfolioXirr'));

  assert.equal(PORTFOLIO_STORAGE_KEY, 'nw7.market-portfolio.v1');

  // Git diff against 2510cac78e4ec177efaaedfb8de2ac3504415813
  const changedFiles = execSync('git diff --name-only $(git merge-base HEAD origin/main) HEAD', {
    encoding: 'utf-8'
  }).split('\n').map(s => s.trim()).filter(Boolean);

  // This workpack-isolation assertion applies only to Market implementation
  // changes. Independent Buzz/Up Ahead/Sections workflow PRs must not be
  // treated as Market workpacks solely because they add shared-path files.
  const marketWorkpack = changedFiles.some(file =>
    file.startsWith('src/market/') ||
    file.startsWith('reports/market-r21/') ||
    file.startsWith('src/pages/MarketPage.') ||
    file === 'src/services/marketWorkspaceRoute.js'
  );
  if (!marketWorkpack) return;

  for (const file of changedFiles) {
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
