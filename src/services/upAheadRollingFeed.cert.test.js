import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE_KEY, loadFromCache, sanitizeUpAheadData, saveToCache } from './upAheadService.js';
import { getUpAheadPlannerSuggestions } from './upAheadPlannerSuggestions.js';

const NOW = Date.parse('2026-11-12T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function event(id, overrides = {}) {
  return {
    id,
    title: id,
    category: 'events',
    publishedAt: NOW - 6 * DAY,
    eventStartAt: NOW + 2 * DAY,
    eventEndAt: NOW + 2 * DAY + HOUR,
    dateConfidence: 'exact',
    plannerEligible: true,
    ...overrides,
  };
}

const snapshot = (fetchedAt, ...items) => ({ schemaVersion: 1, fetchedAt, items });
const ids = items => items.map(item => item.id);

beforeEach(() => {
  const storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  });
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('rolling Up Ahead feed', () => {
  it('keeps omitted active events, updates revised items, appends new items and prunes each expiry', () => {
    const workshop = event('workshop');
    const expo = event('expo', { eventStartAt: NOW - 2 * DAY });
    const alert = event('road-alert', { category: 'alerts', eventStartAt: null, eventEndAt: null, expiryAt: NOW + HOUR });
    const offer = event('sale', { category: 'shopping', eventStartAt: null, eventEndAt: null, expiryAt: NOW + 12 * HOUR });
    saveToCache(snapshot(NOW, workshop, expo, alert, offer));

    vi.setSystemTime(NOW + 8 * HOUR);
    expect(ids(loadFromCache().sections.events)).toEqual(['workshop', 'expo']);
    expect(loadFromCache().sections.alerts).toEqual([]);
    expect(ids(loadFromCache().sections.shopping)).toEqual(['sale']);
    const rescheduled = event('workshop', { eventStartAt: NOW + 3 * DAY, eventEndAt: NOW + 3 * DAY + HOUR });
    saveToCache(snapshot(Date.now(), rescheduled, event('concert')));
    const retained = loadFromCache();
    expect(ids(retained.sections.events)).toEqual(['workshop', 'expo', 'concert']);
    expect(retained.timeline.flatMap(day => day.items).filter(item => item.id === 'workshop'))
      .toEqual([expect.objectContaining({ eventStartAt: rescheduled.eventStartAt })]);
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)).sections.alerts).toEqual([]);

    vi.setSystemTime(NOW + 12 * HOUR);
    expect(loadFromCache().sections.shopping).toEqual([]);
  });

  it('keeps one occurrence across sources and ignores a delayed stale correction', () => {
    const original = event('workshop', { url: 'https://events.example/workshop?utm_source=rss' });
    saveToCache(snapshot(NOW, original));
    vi.setSystemTime(NOW + HOUR);
    saveToCache(snapshot(Date.now(), event('other-id', {
      title: 'Updated workshop',
      url: 'https://events.example/workshop',
    })));
    saveToCache(snapshot(NOW, original, event('distinct')));
    const data = loadFromCache();
    expect(data.sections.events).toEqual([
      expect.objectContaining({ title: 'Updated workshop', hiddenKey: 'workshop' }),
      expect.objectContaining({ title: 'distinct' }),
    ]);
    expect(data.timeline.flatMap(day => day.items)).toHaveLength(2);
  });

  it('drops an expired revision and rejects an older response that would revive it', () => {
    const original = snapshot(NOW, event('cancelled'));
    saveToCache(original);
    vi.setSystemTime(NOW + HOUR);
    saveToCache(snapshot(Date.now(), event('cancelled', { expiryAt: Date.now() })));
    expect(loadFromCache()).toBeNull();
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)).sections).toBeUndefined();
    saveToCache(original);
    expect(loadFromCache()).toBeNull();
    vi.setSystemTime(NOW + 2 * HOUR);
    saveToCache(snapshot(Date.now(), event('cancelled')));
    expect(ids(loadFromCache().sections.events)).toEqual(['cancelled']);
  });

  it('does not revive an undated offer or alert through snapshot normalization', () => {
    const items = [
      event('expired-alert', {
        category: 'alerts', eventStartAt: null, eventEndAt: null, publishedAt: NOW - 2 * HOUR, expiryAt: NOW - HOUR,
      }),
      event('expired-offer', {
        category: 'shopping', eventStartAt: null, eventEndAt: null, publishedAt: NOW - 49 * HOUR,
      }),
    ];
    expect(sanitizeUpAheadData(snapshot(NOW, ...items))).toBeNull();
  });
});

describe('Planner suggestions from the shared feed', () => {
  it('shows only active, eligible occurrences inside the seven-day agenda and honors saved entries and dismissals', () => {
    const saved = event('saved');
    const valid = event('valid');
    const retained = saveToCache(snapshot(NOW,
      saved, valid, event('dismissed'), event('tentative', { dateConfidence: 'tentative' }),
      event('later', { eventStartAt: NOW + 7 * DAY, eventEndAt: NOW + 7 * DAY + HOUR }),
      event('expired', { expiryAt: NOW - HOUR }),
      event('ineligible', { plannerEligible: false }),
      event('different-location', { city: 'London' }),
    ));
    const [firstDay] = retained.timeline;
    const savedPlan = { [firstDay.date]: [{ id: 'legacy-id', title: saved.title }] };
    const before = JSON.stringify(savedPlan);
    const suggestions = getUpAheadPlannerSuggestions(
      retained, savedPlan, new Set(['dismissed']), { locations: ['Chennai', 'Muscat'] }, NOW
    );
    expect(suggestions).toEqual([expect.objectContaining({ id: valid.id, planDate: firstDay.date })]);
    expect(JSON.stringify(savedPlan)).toBe(before);
    expect(localStorage.getItem('upAhead_planner')).toBeNull();
  });
});
