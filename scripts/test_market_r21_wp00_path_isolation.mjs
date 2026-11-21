import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isMarketSensitivePath, marketIsolationInput } from './market_r21_path_guard.mjs';

test('market-only policy edit cannot bypass market workpack isolation', () => {
  const changed = ['src/services/marketFreeOpenPolicy.js'];
  assert.equal(isMarketSensitivePath(changed[0]), true);
  assert.deepEqual(marketIsolationInput(changed), changed);
  // The workpack allowlists do not authorize editing policy-only files.
  const allowedByWp10 = changed.filter(f =>
    f.startsWith('src/market/') ||
    f.startsWith('src/pages/MarketPage.') ||
    f === 'src/services/marketWorkspaceRoute.js'
  );
  assert.deepEqual(allowedByWp10, []);
});

test('isolation watches all market service policy and workspace changes', () => {
  for (const file of [
    'src/market/contracts/index.js',
    'src/pages/MarketPage.jsx',
    'src/pages/MarketPage.styles.css',
    'src/services/marketWorkspaceRoute.js',
    'src/services/marketFreeOpenPolicy.js',
    'src/services/marketDataPolicy.js',
  ]) {
    assert.equal(isMarketSensitivePath(file), true, file);
    assert.deepEqual(marketIsolationInput([file]), [file], file);
  }
});

test('unrelated Newspaper-only changes remain outside the Market workpack guard', () => {
  const files = [
    'src/components/NewspaperCard.css',
    '.github/workflows/daily_brief.yml',
    'scripts/daily_brief.py',
    'src/pages/NewspaperPage.jsx',
  ];
  assert.deepEqual(marketIsolationInput(files), []);
});

test('a combined PR cannot hide prohibited edits behind an unrelated file', () => {
  const files = [
    'src/components/NewspaperCard.css',
    'src/services/marketFreeOpenPolicy.js',
  ];
  assert.deepEqual(marketIsolationInput(files), files);
});

test('invalid input fails closed instead of becoming an empty diff', () => {
  assert.throws(() => marketIsolationInput(undefined), TypeError);
  assert.equal(isMarketSensitivePath(null), false);
});
