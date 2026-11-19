import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptRemoteSettings, DEFAULT_SETTINGS, getSettings, resetSettings } from './storage.js';
import { DEFAULT_MARKET_SETTINGS } from '../config/settings_market.js';
import { getMarketSessionState } from './marketSession.js';
import { classifySection } from './sectionClassifier.js';

function installLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed));

  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key) => store.get(key) ?? null),
    setItem: vi.fn((key, value) => store.set(key, String(value))),
    removeItem: vi.fn((key) => store.delete(key)),
  });
}

describe('config evolution', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('merges designated additive arrays so new defaults reach existing saved settings', () => {
    installLocalStorage({
      dailyEventAI_settings: JSON.stringify({
        schemaVersion: 2,
        sources: {
          enabled: ['custom-source'],
        },
        highImpactKeywords: ['Custom Impact'],
      }),
    });

    const settings = getSettings();

    expect(settings.sources.enabled).toEqual(
      expect.arrayContaining([...DEFAULT_SETTINGS.sources.enabled, 'custom-source'])
    );
    expect(settings.highImpactKeywords).toEqual(
      expect.arrayContaining([...DEFAULT_SETTINGS.highImpactKeywords, 'Custom Impact'])
    );
  });

  it('migrates legacy age limits before merging defaults and retains explicit overrides', () => {
    installLocalStorage({
      dailyEventAI_settings: JSON.stringify({
        freshnessLimitHours: 18,
        upAhead: { locations: [], categories: { alerts: false } },
        rankingWeights: { keyword: { matchBoost: 0 } },
      }),
    });
    const settings = getSettings();
    expect(settings.schemaVersion).toBe(2);
    expect(settings.hideOlderThanHours).toBe(18);
    expect(settings.upAhead.locations).toEqual([]);
    expect(settings.upAhead.categories.alerts).toBe(false);
    expect(settings.rankingWeights.keyword.matchBoost).toBe(0);

    localStorage.setItem('dailyEventAI_settings', JSON.stringify({
      freshnessLimitHours: 18, hideOlderThanHours: 300,
    }));
    expect(getSettings().hideOlderThanHours).toBe(168);
  });

  it('restores defaults for corrupt settings and keeps valid fields next to malformed ones', () => {
    installLocalStorage({ dailyEventAI_settings: '{missing' });
    expect(getSettings().hideOlderThanHours).toBe(60);
    localStorage.setItem('dailyEventAI_settings',
      '{"sections":"bad","storyDeduplication":[],"upAhead":{"locations":1},"theme":"light","__proto__":{"spoof":true}}');
    const settings = getSettings();
    expect(settings.sections.india.enabled).toBe(true);
    expect(settings.storyDeduplication.similarityThreshold).toBe(0.82);
    expect(settings.upAhead.locations).toEqual(['Chennai', 'Muscat']);
    expect(settings.theme).toBe('light');
    expect(settings.spoof).toBeUndefined();
  });

  it('treats user keywords as literal text and skips malformed keyword entries', () => {
    installLocalStorage({
      dailyEventAI_settings: JSON.stringify({ sectionKeywords: { technology: ['c++', 'r()', '[', null] } }),
    });
    expect(() => classifySection('A new compiler for c++', '', '', getSettings())).not.toThrow();
    expect(classifySection('Practice c++ and r()', '', '', getSettings())).toBe('technology');
    expect(classifySection('Practice javac++ and xr()suffix', '', '', getSettings())).not.toBe('technology');
  });

  it('keeps a newer local update against older remote data and resets to desktop defaults', () => {
    installLocalStorage({ dailyEventAI_settings: '{"fontSize":30,"lastUpdated":200}' });
    vi.stubGlobal('window', {
      innerWidth: 1280, location: { hostname: 'app.github.io', search: '' }, localStorage,
    });
    expect(acceptRemoteSettings({ fontSize: 14, lastUpdated: 199 })).toBe(false);
    expect(getSettings().fontSize).toBe(30);
    expect(acceptRemoteSettings({ fontSize: 24, lastUpdated: 201 })).toBe(true);
    expect(getSettings().fontSize).toBe(24);
    expect(resetSettings()).toBe(true);
    expect(getSettings().fontSize).toBe(18);
  });

  it('uses an explicit weekday-rules guard beyond the maintained market holiday calendar', () => {
    const state = getMarketSessionState({
      now: new Date('2027-01-26T04:30:00.000Z'),
      lastUpdated: new Date('2027-01-26T04:29:00.000Z').getTime(),
      tradingHolidays: DEFAULT_MARKET_SETTINGS.tradingHolidays,
    });

    expect(state.holidayCalendarStatus).toBe('unknown_year_weekday_rules');
    expect(state.reason).not.toBe('Holiday');
    expect(state.isOpen).toBe(true);
  });
});
