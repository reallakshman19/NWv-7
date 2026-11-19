// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { getSettings, saveSettings } from './storage.js';
import { MARKET_VISIBILITY_CONTROLS } from '../config/settings_market.js';

const USER_SETTINGS = 'dailyEventAI_settings';

beforeEach(() => window.localStorage.clear());

describe('Market workspace preference migration', () => {
  it('preserves existing visibility, font and Owner holidays without resurrecting inert controls', () => {
    const previous = {
      schemaVersion: 2,
      fontSize: 23,
      market: {
        showIndices: false, showGlobalIndices: true, showSectorals: false,
        showMutualFunds: false, showCurrency: false, showIPO: false,
        showGainers: false, showCommodities: false, cacheMinutes: 50000,
        layoutVariant: 'hybrid',
        tradingHolidays: ['2026-11-19', '2026-11-19', '2027-01-26'],
        tradingHolidayYears: [2026, 2027]
      }
    };
    localStorage.setItem(USER_SETTINGS, JSON.stringify(previous));
    localStorage.setItem('nw7.india-watchlist.v1', '["INFY","UNLISTED"]');
    localStorage.setItem('nw7.market-saved-funds.v1', '["100001","100002"]');
    const migrated = getSettings();
    expect(migrated.fontSize).toBe(23);
    for (const { key } of MARKET_VISIBILITY_CONTROLS) {
      expect(migrated.market[key]).toBe(previous.market[key]);
    }
    expect(migrated.market.showGainers).toBe(false);
    expect(migrated.market.showCommodities).toBe(false);
    expect(migrated.market).not.toHaveProperty('cacheMinutes');
    expect(migrated.market).not.toHaveProperty('layoutVariant');
    expect(migrated.market.tradingHolidays).toEqual(['2026-11-19','2027-01-26']);
    expect(migrated.market.tradingHolidayYears).toEqual([2026,2027]);
    expect(localStorage.getItem('nw7.india-watchlist.v1')).toBe('["INFY","UNLISTED"]');
    expect(localStorage.getItem('nw7.market-saved-funds.v1')).toBe('["100001","100002"]');
    expect(JSON.parse(localStorage.getItem(USER_SETTINGS))).toEqual(previous); // Pure read.
    expect(getSettings().market).toEqual(migrated.market); // Idempotent.
  });

  it('does not discard unrelated account settings on a Market visibility save', () => {
    const prior = {schemaVersion:2,theme:'dark',fontSize:24, market:{showCurrency:false,showGlobalIndices:true}};
    localStorage.setItem(USER_SETTINGS, JSON.stringify(prior));
    const updated = getSettings();
    updated.market.showCurrency = true;
    expect(saveSettings(updated)).toBe(true);
    const saved = getSettings();
    expect(saved.theme).toBe('dark');
    expect(saved.fontSize).toBe(24);
    expect(saved.market.showCurrency).toBe(true);
    expect(saved.market.showGlobalIndices).toBe(true);
  });

  it('normalizes invalid stored Market settings without exposing unsupported toggles', () => {
    localStorage.setItem(USER_SETTINGS, JSON.stringify({schemaVersion:2,market:{
      showIndices:'false', showGlobalIndices: 1, showCurrency:null,
      tradingHolidays:['2027-02-29','2027-01-26'], cacheMinutes: 999999
    }}));
    const market = getSettings().market;
    expect(market.showIndices).toBe(true);
    expect(market.showGlobalIndices).toBe(false);
    expect(market.showCurrency).toBe(true);
    expect(market.tradingHolidays).toEqual(['2027-01-26']);
    expect(market).not.toHaveProperty('cacheMinutes');
  });
});
