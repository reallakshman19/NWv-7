import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_HOLIDAYS, HOLIDAY_SOURCES } from '../data/holidays/localHolidays2026_2027.js';
import { getHolidayCalendarItems } from './holidayCalendar.js';
import { fetchStaticUpAheadData, fetchLiveUpAheadData, isUpAheadDataFresh, saveToCache, sanitizeUpAheadData, loadFromCache } from './upAheadService.js';
import { getUpAheadPlannerSuggestions } from './upAheadPlannerSuggestions.js';
import { fetchIntelligentUpAheadData } from './intelligentUpAheadFetcher.js';
vi.mock('./intelligentUpAheadFetcher.js', () => ({ fetchIntelligentUpAheadData: vi.fn() }));

const NOW = Date.parse('2026-11-16T08:00:00Z');
const locations = ['Chennai', 'Muscat'];
const published = { fetchedAt: NOW, sourceMode: 'snapshot', items: [{
  id: 'fresh-release', title: 'Upcoming Chennai cinema release', city: 'Chennai',
  category: 'movies', eventStartAt: NOW + 86400000, eventEndAt: NOW + 172800000,
  publishedAt: NOW - 3600000, plannerEligible: true, source: 'Publisher',
}] };

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(NOW);
  const stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: key => stored.get(key) || null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: key => stored.delete(key),
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('one-time Chennai / Muscat 2026–2027 holiday calendar', () => {
  it('contains all 24 gazette entries for each Chennai year and both Muscat years', () => {
    for (const year of ['2026', '2027']) {
      const rows = LOCAL_HOLIDAYS.filter(row => row.location === 'Chennai' && row.date.startsWith(year));
      expect(rows).toHaveLength(24);
      expect(rows.every(row => row.status === 'announced' && HOLIDAY_SOURCES[row.sourceKey].authority === 'official')).toBe(true);
      expect(LOCAL_HOLIDAYS.some(row => row.location === 'Muscat' && row.date.startsWith(year))).toBe(true);
    }
  });

  it('uses the announced Oman National Day leave dates instead of the old November 18 fallback', () => {
    const items = getHolidayCalendarItems(['Muscat'], NOW);
    const holiday = items.find(item => item.id === 'holiday-muscat-2026-national-day');
    expect(holiday.date).toBe('2026-11-25');
    expect(holiday.eventDateEndKey).toBe('2026-11-26');
    expect(holiday.plannerEligible).toBe(true);
    expect(items.some(item => item.date === '2026-11-18')).toBe(false);
  });

  it('keeps co-occurring Chennai observances together without losing either name in URL deduplication', () => {
    const items = getHolidayCalendarItems(['Chennai'], NOW);
    const sameDay = items.filter(item => item.date === '2027-08-15');
    expect(sameDay).toHaveLength(1);
    expect(sameDay[0].holidayNames).toEqual(['Independence Day', "Milad-un-Nabi (Prophet's Birthday)"]);
    const data = sanitizeUpAheadData({ sections: { festivals: items } });
    expect(data.sections.festivals.find(item => item.date === '2027-08-15').holidayNames).toHaveLength(2);
  });

  it('keeps each holiday through its final local day and expires at the city midnight, independent of browser timezone', () => {
    const chennaiEnd = Date.parse('2026-12-25T00:00:00+05:30') + 86400000;
    const omanEnd = Date.parse('2026-11-27T00:00:00+04:00');
    expect(getHolidayCalendarItems(['Chennai'], chennaiEnd - 1).some(item => item.date === '2026-12-25')).toBe(true);
    expect(getHolidayCalendarItems(['Chennai'], chennaiEnd).some(item => item.date === '2026-12-25')).toBe(false);
    expect(getHolidayCalendarItems(['Muscat'], omanEnd - 1).some(item => item.id === 'holiday-muscat-2026-national-day')).toBe(true);
    expect(getHolidayCalendarItems(['Muscat'], omanEnd).some(item => item.id === 'holiday-muscat-2026-national-day')).toBe(false);
  });

  it('labels every unannounced Oman 2027 occasion provisional and never automatically offers it to Planner', () => {
    const items = getHolidayCalendarItems(['Muscat'], Date.parse('2027-01-04T08:00:00Z'));
    expect(items).toHaveLength(8);
    expect(items.every(item => item.holidayStatus === 'provisional' && item.title.includes('(provisional)')
      && item.dateConfidence === 'tentative' && item.plannerEligible === false)).toBe(true);
    expect(items.some(item => item.date === '2027-12-26')).toBe(true);
    const suggestions = getUpAheadPlannerSuggestions({ timeline: items.map(item => ({ date: item.date, items: [item] })) },
      {}, new Set(), { locations: ['Muscat'] }, Date.parse('2027-01-04T08:00:00Z'));
    expect(suggestions).toHaveLength(0);
  });

  it('distinguishes bank-only closing from public leave and filters selected cities', () => {
    const items = getHolidayCalendarItems(['Chennai'], NOW);
    expect(items.every(item => item.city === 'Chennai')).toBe(true);
    const closing = items.find(item => item.date === '2027-04-01');
    expect(closing.holidayScope).toBe('banks-only');
    expect(closing.description).toMatch(/Banks only/);
    expect(getHolidayCalendarItems(['London'], NOW)).toHaveLength(0);
  });

  it('keeps the calendar alongside fresh real publication without changing its freshness or duplicating refreshes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => published }));
    const fetched = await fetchStaticUpAheadData({ locations });
    const retained = saveToCache(fetched);
    const refreshed = saveToCache(await fetchStaticUpAheadData({ locations }));
    expect(retained.sections.movies).toHaveLength(1);
    expect(retained.sections.festivals.some(item => item.calendarDataset)).toBe(true);
    expect(refreshed.sections.festivals).toHaveLength(retained.sections.festivals.length);
    expect(refreshed.fetchedAt).toBe(NOW);
    expect(isUpAheadDataFresh(refreshed)).toBe(true);
    expect(refreshed.auditSummary?.fallback).toBeUndefined();
  });

  it('shows bundled holidays during a failed snapshot request without inventing a feed update time', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const data = await fetchStaticUpAheadData({ locations });
    expect(data.sections.festivals.length).toBeGreaterThan(0);
    expect(data.lastUpdated).toBeNull();
    expect(data.auditSummary.error).toContain('offline');
    expect(isUpAheadDataFresh(data)).toBe(false);
  });

  it('keeps the calendar on a live provider failure without presenting a new publication time', async () => {
    vi.mocked(fetchIntelligentUpAheadData).mockRejectedValueOnce(new Error('provider down'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const data = await fetchLiveUpAheadData({ locations });
      expect(data.sections.festivals.length).toBeGreaterThan(0);
      expect(data.sourceMode).toBe('failed');
      expect(data.lastUpdated).toBeNull();
      expect(isUpAheadDataFresh(data)).toBe(false);
    } finally { log.mockRestore(); }
  });

  it('does not let calendar-only data advance a real feed timestamp after recovery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => published }));
    saveToCache(await fetchStaticUpAheadData({ locations }));
    const calendars = getHolidayCalendarItems(locations, NOW);
    const merged = saveToCache({ fetchedAt: NOW + 3600000, sourceMode: 'calendar', sections: { festivals: calendars } });
    expect(merged.fetchedAt).toBe(NOW);
    expect(merged.sourceMode).toBe('snapshot');
    expect(merged.sections.movies).toHaveLength(1);
  });
  it.each(['failed', 'success'])('does not turn a resolved %s empty acquisition into fresh news through the calendar', async status => {
    const acquisitionSummary = { status, attemptedSources: 2, successfulSources: status === 'failed' ? 0 : 2,
      returnedItems: 0, byCategory: {} };
    vi.mocked(fetchIntelligentUpAheadData).mockResolvedValueOnce({ rankedItems: [], acquisitionSummary });
    const data = await fetchLiveUpAheadData({ locations });
    expect(data.sections.festivals.length).toBeGreaterThan(0);
    expect(data.lastUpdated).toBeNull();
    expect(isUpAheadDataFresh(data)).toBe(false);
    expect(data.acquisitionSummary).toEqual(acquisitionSummary);
    expect(data.sourceMode).toBe(status === 'failed' ? 'failed' : 'calendar');
  });

  it('loads the shipped calendar immediately offline, even before the first network fetch or with an old fresh cache', () => {
    expect(loadFromCache()).toBeNull();
    const offline = loadFromCache({ locations });
    expect(offline.sections.festivals.some(item => item.id === 'holiday-muscat-2026-national-day')).toBe(true);
    expect(offline.lastUpdated).toBeNull();
    saveToCache(published);
    const cached = loadFromCache({ locations: ['Chennai'] });
    expect(cached.sections.movies).toHaveLength(1);
    expect(cached.sections.festivals.every(item => item.city === 'Chennai')).toBe(true);
    expect(cached.fetchedAt).toBe(NOW);
  });

  it('offers announced upcoming holidays to Planner without writing them into the saved agenda', () => {
    const now = Date.parse('2026-12-21T08:00:00Z');
    vi.setSystemTime(now);
    const data = loadFromCache({ locations: ['Chennai'] });
    const suggestions = getUpAheadPlannerSuggestions(data, {}, new Set(), { locations: ['Chennai'] }, now);
    expect(suggestions.some(item => item.title === 'Christmas · 2026' && item.planDate === '2026-12-25')).toBe(true);
  });
  it('keeps the selected bundled calendar after a fresh API response skips static/live acquisition', () => {
    saveToCache(published);
    const prepared = loadFromCache({ locations: ['Chennai'] });
    const afterApi = saveToCache(published, prepared, { locations: ['Chennai'] });
    expect(afterApi.sections.festivals.length).toBeGreaterThan(0);
    expect(afterApi.sections.festivals.every(item => item.city === 'Chennai')).toBe(true);
    expect(afterApi.fetchedAt).toBe(NOW);
  });
  it('does not revive cached Muscat calendar rows after changing the selection to Chennai', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => published }));
    saveToCache(await fetchStaticUpAheadData({ locations }), null, { locations });
    const prepared = loadFromCache({ locations: ['Chennai'] });
    const afterApi = saveToCache(published, prepared, { locations: ['Chennai'] });
    expect(afterApi.sections.festivals.every(item => item.city === 'Chennai')).toBe(true);
    expect(afterApi.timeline.flatMap(day => day.items).filter(item => item.calendarDataset)
      .every(item => item.city === 'Chennai')).toBe(true);
  });

  it('preserves source and retail/location policy metadata when raw publisher items become display cards', () => {
    const metadata = { retailerId: 'lulu', offerMarket: 'oman', offerChannel: 'offline',
      acquisitionLocation: 'oman', sourceUrl: 'https://example.org/source', sourceAuthority: 'official',
      affectedLocations: ['Muscat'], affectedScope: 'city' };
    const data = sanitizeUpAheadData({ ...published, items: [{ ...published.items[0], ...metadata }] });
    expect(data.sections.movies[0]).toMatchObject(metadata);
  });
});
