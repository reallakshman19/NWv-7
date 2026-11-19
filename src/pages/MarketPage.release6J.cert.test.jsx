import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  __marketTabViewModelInternalsForTest,
} from '../viewModels/useMarketTabViewModel.js';

const {
  getIndiaIndices,
  getTrackedIndexBreadth,
  projectMarketData,
} = __marketTabViewModelInternalsForTest;

describe('Release 6J Market surface binding', () => {
  const marketPage = fs.readFileSync('src/pages/MarketPage.jsx', 'utf8');
  const quickMarket = fs.readFileSync('src/components/QuickMarket.jsx', 'utf8');
  const marketVm = fs.readFileSync('src/viewModels/useMarketTabViewModel.js', 'utf8');

  it('QuickMarket is prop-driven', () => {
    expect(quickMarket).not.toContain("from '../context/MarketContext'");
    expect(quickMarket).not.toContain("from '../context/SettingsContext'");
    expect(quickMarket).not.toContain('useMarket');
    expect(quickMarket).not.toContain('useSettings');
    expect(quickMarket).toContain('marketData = {}');
    expect(quickMarket).toContain('sessionState = null');
    expect(quickMarket).toContain('onRefreshMarket = null');
    expect(quickMarket).toContain('[QuickMarket] refresh failed');
  });

  it('QuickMarket receives sessionState rather than settings context', () => {
    expect(quickMarket).toContain('sessionState = null');
    expect(quickMarket).not.toContain('getMarketSessionState({');
    expect(quickMarket).not.toContain('settings?.market?.tradingHolidays');
  });

  it('MarketPage uses ViewModel instead of MarketContext/SettingsContext directly', () => {
    expect(marketPage).not.toContain("from '../context/MarketContext'");
    expect(marketPage).not.toContain("from '../context/SettingsContext'");
    expect(marketPage).not.toContain('useMarket()');
    expect(marketPage).not.toContain('useSettings()');
    expect(marketPage).toContain('useMarketTabViewModel');
  });

  it('MarketPage no longer owns market audit/session projection', () => {
    expect(marketPage).not.toContain('auditMarketTabQuality({');
    expect(marketPage).not.toContain('getMarketSessionState({');
  });

  it('Market ViewModel owns context, settings, boot, refresh, audit and session projection', () => {
    expect(marketVm).toContain("from '../context/MarketContext'");
    expect(marketVm).toContain("from '../context/SettingsContext'");
    expect(marketVm).toContain('useMarket');
    expect(marketVm).toContain('useSettings');
    expect(marketVm).toContain('ensureBoot');
    expect(marketVm).toContain('refreshMarket');
    expect(marketVm).toContain('auditMarketTabQuality');
    expect(marketVm).toContain('getMarketSessionState');
    expect(marketVm).toContain('quickMarketProps');
  });

  it('Market ViewModel owns full MarketPage projection', () => {
    [
      'marketSettings',
      'primaryIndices',
      'globalIndices',
      'displayedPrimaryIndices',
      'heroIndex',
      'heroSeries',
      'sessionState',
      'moverGainers',
      'moverLosers',
      'trackedIndexBreadth',
      'sectoralIndices',
      'marketTabAudit',
      'navSections',
    ].forEach(token => {
      expect(marketVm).toContain(token);
    });
  });

  it('projectMarketData normalizes missing sections', () => {
    expect(projectMarketData(null)).toEqual({
      indices: [],
      globalIndices: [],
      equities: [],
      equityCoverage: {},
      commodities: [],
      currencies: [],
      ipo: {},
      ipoLastCheckedAt: undefined,
      generatedAt: undefined,
      mutualFunds: [],
      nfo: [],
      movers: {},
      sectorals: [],
      fiidii: {},
      sourceHealth: {},
      fetchedAt: undefined,
      sourceMode: undefined,
      isSnapshot: false,
      isStale: false,
      raw: {},
    });

    expect(projectMarketData({
      indices: [{ name: 'NIFTY 50' }],
      commodities: [{ name: 'Gold' }],
    })).toMatchObject({
      indices: [{ name: 'NIFTY 50' }],
      commodities: [{ name: 'Gold' }],
      currencies: [],
      ipo: {},
      mutualFunds: [],
      movers: {},
      sectorals: [],
      fiidii: {},
      sourceHealth: {},
    });
  });

  it('preserves the IPO-specific check clock rather than substituting index time', () => {
    const date = '2026-11-19T10:30:00Z';
    const projected = projectMarketData({ipoLastCheckedAt:date,generatedAt:'2026-11-19T11:00:00Z',sourceHealth:{ipo:{status:'empty'}}});
    expect(projected.ipoLastCheckedAt).toBe(date);
    expect(projected.generatedAt).toBe('2026-11-19T11:00:00Z');
  });

  it('preserves acquired NFO schedules for the Market page', () => {
    const nfo = [{ name: 'Fixture new fund', openDate: '2026-11-16', closeDate: '2026-11-30' }];
    expect(projectMarketData({ nfo }).nfo).toEqual(nfo);
  });

  it('counts tracked India indices while excluding global and unnamed rows', () => {
    const indices = [
      { name: 'NIFTY 50', change: '+0.01', changePercent: '0.00' },
      { name: 'SENSEX', change: -12.2 },
      { name: 'BANK NIFTY', change: '0.00' },
      { name: 'NIFTY IT' },
      { name: 'S&P 500', change: 9 },
      { name: 'Nasdaq Composite', symbol: '^IXIC', change: 9 },
      { name: 'DAX', symbol: '^GDAXI', change: 9 },
      null,
      { name: ' ', change: 9 },
    ];
    const indiaIndices = getIndiaIndices(indices, [{ name: 'DAX', symbol: '^GDAXI' }]);
    expect(getTrackedIndexBreadth(indiaIndices)).toEqual({
      rising: 1,
      falling: 1,
      flat: 1,
      unknown: 1,
    });
  });

  it.each([null, false, '', ' ', 'unavailable', NaN, Infinity])(
    'counts invalid index change %s as unknown',
    (change) => {
      expect(getTrackedIndexBreadth([{ name: 'NIFTY 50', change }])).toEqual({
        rising: 0,
        falling: 0,
        flat: 0,
        unknown: 1,
      });
    },
  );
});
