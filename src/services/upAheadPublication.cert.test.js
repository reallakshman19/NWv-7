import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/upAheadRecovery.json';
import { fetchStaticUpAheadData, saveToCache, isUpAheadDataFresh } from './upAheadService.js';
import { getVisibleUpAheadProjection } from './upAheadProjection.js';
import { getUpAheadPlannerSuggestions } from './upAheadPlannerSuggestions.js';
import { getUpAheadBriefing } from './upAheadBriefing.js';

const NOW = fixture.fetchedAt;
const DAY = 86_400_000;
const settings = { upAhead: { locations: ['Chennai', 'Muscat'] } };

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(NOW);
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key),
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Up Ahead publication and dated nine-category replay', () => {
  it('reads current main on the exact official Pages deployment', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://reallakshman19.github.io', pathname: '/NWv-7/' } });
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => fixture });
    vi.stubGlobal('fetch', fetch);
    const data = await fetchStaticUpAheadData();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toMatch(/^https:\/\/raw\.githubusercontent\.com\/reallakshman19\/NWv-7\/main\/public\/data\/up_ahead\.json\?t=/);
    expect(data.fetchedAt).toBe(NOW);
    expect(fetch.mock.calls[0][1].headers).toBeUndefined();
  });

  it('tries the deployed file if current-main is stale and never uses that authority on a different host', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://reallakshman19.github.io', pathname: '/NWv-7/' } });
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...fixture, fetchedAt: NOW - 30 * DAY }) })
      .mockResolvedValue({ ok: true, json: async () => fixture });
    vi.stubGlobal('fetch', fetch);
    expect((await fetchStaticUpAheadData()).fetchedAt).toBe(NOW);
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.stubGlobal('window', { location: { origin: 'https://example.org', pathname: '/NWv-7/' } });
    fetch.mockClear();
    await fetchStaticUpAheadData();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).not.toMatch(/^https:/);
  });

  it('keeps six-day-old future items in every tab and Planner across refresh, revision and expiry', () => {
    const initial = { ...fixture, items: fixture.items.map((item, index) => index === 1 ? { ...item, occurrenceId: 'workshop-occurrence' } : item) };
    let retained = saveToCache(initial);
    let projected = getVisibleUpAheadProjection({ data: retained, settings });
    expect(projected.upAheadEvidence.coveredCategories).toHaveLength(9);
    expect(projected.suggestedItems).toHaveLength(9);
    expect(projected.onlineOffers).toHaveLength(1);
    expect(projected.offlineOffers).toHaveLength(1);
    expect(getUpAheadPlannerSuggestions(retained, {}, new Set(), settings.upAhead, NOW)).toHaveLength(9);
    const revised = { ...initial.items[1], title: 'Chennai workshop revised', eventStartAt: NOW + 2 * DAY };
    const added = { ...revised, id: 'new-workshop', occurrenceId: 'new-workshop-occurrence', url: 'https://example.org/new', title: 'Chennai new workshop' };
    const expired = { ...fixture.items.find(item => item.category === 'shopping'), expiryAt: NOW };
    retained = saveToCache({ fetchedAt: NOW + 1000, items: [revised, added, expired] });
    projected = getVisibleUpAheadProjection({ data: retained, settings });
    expect(projected.eventItems.filter(item => item.id === revised.id)).toHaveLength(1);
    expect(projected.eventItems.some(item => item.id === added.id)).toBe(true);
    expect(projected.offlineOffers).toHaveLength(0);
    expect(projected.movieCards).toHaveLength(1);
    expect(projected.combinedAlerts).toHaveLength(3);
  });

  it('counts today by local calendar and planner readiness once per eligible occurrence', () => {
    const item = { id: 'today', title: 'Chennai workshop', category: 'events', date: '2026-11-14',
      eventStartAt: Date.parse('2026-11-14T00:00:00Z'), expiryAt: NOW + DAY, plannerEligible: true };
    const briefing = getUpAheadBriefing({ now: NOW, settings, data: {}, visible: {
      eventItems: [item, item], movieCards: [], projectedSections: { events: [item] },
    } });
    expect(briefing.todayCount).toBe(1);
    expect(briefing.next72hCount).toBe(1);
    expect(briefing.plannerReadyCount).toBe(1);
  });

  it('expires an alert route without retiring the same article’s future event or Planner suggestion', () => {
    const item = { ...fixture.items[1], id: 'same-story' };
    const alert = { ...item, category: 'alerts', plannerEligible: false, expiryAt: NOW + 1000 };
    saveToCache({ fetchedAt: NOW, items: [item, alert] });
    vi.setSystemTime(NOW + 2000);
    const retained = saveToCache({ fetchedAt: Date.now(), items: [alert] });
    expect(retained?.sections.events).toHaveLength(1);
    expect(retained?.sections.alerts).toHaveLength(0);
    expect(getUpAheadPlannerSuggestions(retained, {}, new Set(), settings.upAhead, Date.now())).toHaveLength(1);
  });

  it('upgrades an existing calendar cache to real publication and rejects late fallback metadata', () => {
    const fallback = { fetchedAt: NOW - 1000, sourceMode: 'snapshot', auditSummary: { fallback: 'festival_calendar' },
      sections: { festivals: [{ id: 'calendar-only', title: 'Old calendar entry', date: '2026-11-16',
        category: 'festivals', source: 'Festival calendar' }] } };
    saveToCache(fallback);
    let retained = saveToCache(fixture);
    expect(isUpAheadDataFresh(retained)).toBe(true);
    expect(retained.auditSummary?.fallback).toBeUndefined();
    expect(retained.sections.festivals.map(item => item.id)).toEqual(['fixture-festivals']);
    retained = saveToCache({ ...fallback, fetchedAt: NOW + 1000 });
    expect(retained.fetchedAt).toBe(NOW);
    expect(retained.auditSummary?.fallback).toBeUndefined();
    expect(retained.sections.festivals.map(item => item.id)).toEqual(['fixture-festivals']);
  });

  it('does not let an empty failed refresh advance publication freshness', () => {
    saveToCache({ ...fixture, sourceMode: 'snapshot' });
    const retained = saveToCache({ fetchedAt: NOW + 3600_000, sourceMode: 'failed',
      acquisitionSummary: { status: 'failed' }, sections: {} });
    expect(retained.fetchedAt).toBe(NOW);
    expect(retained.sourceMode).toBe('snapshot');
    expect(retained.sections.movies).toHaveLength(1);
  });
});
