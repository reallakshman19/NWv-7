import { afterEach, expect, it, vi } from 'vitest';
import { buildCanonicalItem } from '../intelligence/canonicalItemBuilder.js';
import { classifyPlannerWindow } from '../intelligence/dateAware.js';
import { proxyManager } from './proxyManager.js';
import { getUpAheadPlannerSuggestions } from './upAheadPlannerSuggestions.js';
import { formatUpAheadItemDate, getVisibleUpAheadProjection } from './upAheadProjection.js';
import { fetchLiveUpAheadData, sanitizeUpAheadData } from './upAheadService.js';

vi.mock('./proxyManager.js', () => ({ proxyManager: { fetchViaProxy: vi.fn() } }));
vi.mock('../intelligence/feedSourceRegistry.js', () => ({
  buildFeedFetchPlan: ({ locations }) => [{ category: 'events', sources: [{
    category: 'events', location: locations[0], url: 'https://events.example/rss', sourceType: 'event_listing', trust: 'high',
  }] }],
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('uses the UTC calendar for a day-key range without a known venue', () => {
  const event = {
    eventDateKey: '2026-12-31',
    eventDateEndExclusiveKey: '2027-01-02',
    dateConfidence: 'exact',
  };
  expect(classifyPlannerWindow(event, { asOfDate: '2026-12-31T00:30:00Z', plannerWindowDays: 1 }))
    .toMatchObject({ windowStatus: 'inside_window', plannerEligible: true });
  expect(classifyPlannerWindow(event, { asOfDate: '2027-01-02T00:00:00Z' }))
    .toMatchObject({ windowStatus: 'before_window', plannerEligible: false });
});

it.each([['Chennai', '+05:30'], ['Muscat', '+04:00']])(
  'keeps a %s range eligible through its last local day and preserves saved identity',
  async (city, offset) => {
    const startDay = '2026-12-30';
    const endDay = '2027-01-02';
    const exclusiveDay = '2027-01-03';
    const eventStartAt = `${startDay}T00:00:00${offset}`;
    const eventEndAt = `${exclusiveDay}T00:00:00${offset}`;
    const start = Date.parse(eventStartAt);
    const end = Date.parse(eventEndAt);
    const title = `${city} conference and exhibition ${startDay} to ${endDay}`;
    const settings = { locations: [city], categories: { events: true } };
    const item = {
      guid: `${city}-conference`,
      title,
      link: 'https://events.example/conference',
      source: 'https://events.example/rss',
      pubDate: '2026-12-29T04:00:00Z',
      sourceTypeHint: 'event_listing',
      sourceTrustHint: 'high',
      category: 'events',
    };
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    });
    vi.useFakeTimers().setSystemTime(start);
    proxyManager.fetchViaProxy.mockResolvedValue({ items: [item] });

    const visible = data => getVisibleUpAheadProjection({ data, settings: { upAhead: settings } })
      .eventItems.find(row => row.title === title);
    const suggest = (data, now, savedPlan = {}) => getUpAheadPlannerSuggestions(data, savedPlan, new Set(), settings, now)
      .find(row => row.title === title);
    const snapshot = ({
      fetchedAt: start,
      items: [{
        id: `${city}-snapshot-conference`, title, url: item.link, category: 'events', city,
        eventStartAt: Date.parse(`${startDay}T00:00:00Z`), eventEndAt: Date.parse(`${exclusiveDay}T00:00:00Z`),
        expiryAt: Date.parse(`${exclusiveDay}T00:00:00Z`),
        lifecycle: { displayUntil: Date.parse(`${exclusiveDay}T00:00:00Z`) },
        datePrecision: 'day', plannerEligible: true, dateConfidence: 'exact',
      }],
    });
    const first = await fetchLiveUpAheadData(settings);
    expect(visible(first)).toMatchObject({ eventDateKey: startDay, eventDateEndKey: endDay, eventDateEndExclusiveKey: exclusiveDay });
    const savedItem = suggest(first, start);
    expect(savedItem).toMatchObject({ planDate: startDay, eventDateKey: startDay });
    const saved = { [startDay]: [{ ...savedItem, state: 'saved' }] };

    // The exclusive endpoint follows the venue's midnight in any device timezone.
    vi.setSystemTime(end - 1);
    const refreshed = await fetchLiveUpAheadData(settings);
    const published = sanitizeUpAheadData(snapshot);
    const explicit = sanitizeUpAheadData({
      ...snapshot, items: [{ ...snapshot.items[0], eventStartAt, eventEndAt, expiryAt: eventEndAt, lifecycle: null }],
    });
    expect(visible(refreshed)).toMatchObject({ hiddenKey: savedItem.hiddenKey });
    for (const data of [refreshed, published, explicit]) {
      const display = visible(data);
      expect(display).toBeDefined();
      expect(formatUpAheadItemDate(display)).toBe('Wed, 30 Dec – Sat, 02 Jan');
      expect(suggest(data, end - 1)).toMatchObject({ eventDateKey: startDay, planDate: endDay });
      expect(suggest(data, end - 1, saved)).toBeUndefined();
    }
    expect(saved[startDay][0]).toMatchObject({ hiddenKey: savedItem.hiddenKey, state: 'saved' });
    expect(classifyPlannerWindow(visible(refreshed), { asOfDate: end - 1 }).windowStatus).toBe('inside_window');

    vi.setSystemTime(end);
    expect(visible(await fetchLiveUpAheadData(settings))).toBeUndefined();
    expect(sanitizeUpAheadData(snapshot)).toBeNull();
    expect(suggest(refreshed, end)).toBeUndefined();
    expect(classifyPlannerWindow(visible(refreshed) || savedItem, { asOfDate: end }).windowStatus).toBe('before_window');
    expect(buildCanonicalItem(item, { asOfDate: end, selectedCities: [city] }).windowStatus).toBe('before_window');
  }
);
