import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_MARKET_SETTINGS, MARKET_VISIBILITY_CONTROLS, normalizeMarketSettings } from '../src/config/settings_market.js';
import { MARKET_CACHE_SCHEMA_VERSION, MARKET_CONTEXT_CACHE_KEY,
  MARKET_SERVICE_CACHE_KEY } from '../src/services/marketTrust.js';

test('settings UI exposes only six implemented Market consumer toggles', () => {
  const keys = MARKET_VISIBILITY_CONTROLS.map(control => control.key);
  assert.deepEqual(keys, [
    'showIndices', 'showGlobalIndices', 'showSectorals',
    'showMutualFunds', 'showCurrency', 'showIPO',
  ]);
  assert.ok(MARKET_VISIBILITY_CONTROLS.every(control => control.label && control.key.startsWith('show')));
  assert.ok(!keys.includes('showGainers') && !keys.includes('showCommodities') && !keys.includes('showFIIDII'));
});
test('legacy index, sectoral and currency visibility survives migration', () => {
  const result = normalizeMarketSettings({
    showIndices: false, showGlobalIndices: true, showSectorals: false,
    showMutualFunds: false, showCurrency: false, showIPO: false,
    showCommodities: false, showGainers: false,
  });
  for (const key of MARKET_VISIBILITY_CONTROLS.map(control => control.key)) {
    assert.equal(result[key], key === 'showGlobalIndices');
  }
  assert.equal(result.showGainers, false);
  assert.equal(result.showCommodities, false);
});
test('obsolete layout and cache preference cannot influence quote retention', () => {
  const result = normalizeMarketSettings({ layoutVariant:'hybrid', cacheMinutes:100_000, showIndices:true });
  assert.equal(Object.hasOwn(result,'cacheMinutes'),false);
  assert.equal(Object.hasOwn(result,'layoutVariant'),false);
  assert.equal(result.showIndices,true);
});
test('custom dates survive, invalid dates are rejected without changing true dates', () => {
  const dates = ['2026-11-19', '2026-11-19', '2027-02-29', '2027-01-26', 'abc'];
  const result = normalizeMarketSettings({ tradingHolidays: dates, tradingHolidayYears:[2026,2027,2027,'2028'] });
  assert.deepEqual(result.tradingHolidays,['2026-11-19','2027-01-26']);
  assert.deepEqual(result.tradingHolidayYears,[2026,2027]);
});
test('migration is idempotent and does not reset default visibility on empty data', () => {
  const prior = normalizeMarketSettings({ showGlobalIndices:true, showCurrency:false, tradingHolidays:['2026-12-25'] });
  assert.deepEqual(normalizeMarketSettings(prior),prior);
  const defaults = normalizeMarketSettings();
  assert.equal(defaults.showGlobalIndices, DEFAULT_MARKET_SETTINGS.showGlobalIndices);
  assert.deepEqual(defaults.tradingHolidays,DEFAULT_MARKET_SETTINGS.tradingHolidays);
});
test('corrupt values cannot override the documented default booleans', () => {
  const next = normalizeMarketSettings({ showIndices:'false', showGlobalIndices:1, showCurrency:null,
    tradingHolidays:42, tradingHolidayYears:[100,9999] });
  assert.equal(next.showIndices,true);
  assert.equal(next.showGlobalIndices,false);
  assert.equal(next.showCurrency,true);
  assert.deepEqual(next.tradingHolidayYears,[]);
});
test('quote caches use new v4 keys while personal saved items are outside the quote cache', () => {
  assert.equal(MARKET_CACHE_SCHEMA_VERSION,'market-v4');
  assert.equal(MARKET_CONTEXT_CACHE_KEY,'market_cache_v4');
  assert.equal(MARKET_SERVICE_CACHE_KEY,'indian_market_stable_data_v4');
});
