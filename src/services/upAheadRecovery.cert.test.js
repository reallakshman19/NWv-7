import { afterEach, describe, expect, it, vi } from 'vitest';
import { getVisibleUpAheadProjection } from './upAheadProjection.js';
import { getUpAheadPlannerSuggestions } from './upAheadPlannerSuggestions.js';
import { sanitizeUpAheadData } from './upAheadService.js';
import { __upAheadPageViewModelInternalsForTest as vm } from '../viewModels/useUpAheadPageViewModel.js';

const NOW = Date.parse('2026-11-14T17:35:00Z');
const DAY = 86_400_000;
const settings = { upAhead: { locations: ['Chennai', 'Muscat'] } };
const row = (id, category, extra = {}) => ({
  id, title: id, category, publishedAt: NOW - 3600_000, expiryAt: NOW + DAY, ...extra,
});
const project = sections => getVisibleUpAheadProjection({ data: { sections }, settings });

afterEach(() => vi.useRealTimers());

describe('Up Ahead live-audit regressions', () => {
  it('labels Hybrid snapshots accurately and displays ongoing ranges through their last day', () => {
    expect(vm.getSourceModeState({ data: { sourceMode: 'snapshot' }, runtime: { isStaticHost: false } }).modeLabel).toBe('Snapshot');
    const label = vm.formatConciseDate('2026-11-09', NOW, Date.parse('2026-11-16T00:00:00Z'));
    expect(label).toContain('09 Nov');
    expect(label).toContain('15 Nov');
  });
  it('includes general and weather alerts in Suggested', () => {
    vi.useFakeTimers().setSystemTime(NOW);
    const result = project({ alerts: [row('Chennai road closure advisory', 'alerts')], weather_alerts: [
      row('heavy rain weather warning Chennai', 'weather_alerts'),
    ] });
    expect(result.combinedAlerts).toHaveLength(2);
    expect(result.suggestedItems).toHaveLength(2);
  });

  it('keeps country-scoped online offers and text-local civics; rejects foreign events', () => {
    vi.useFakeTimers().setSystemTime(NOW);
    const result = project({
      shopping: [row('Amazon laptop sale', 'shopping', { region: 'in', locationCanonical: 'in' })],
      civic: [row('Chennai water supply interruption tomorrow', 'civic')],
      events: [row('London concert', 'events', { city: 'London', date: '2026-11-15' })],
    });
    expect(result.onlineOffers).toHaveLength(1);
    expect(result.offlineOffers).toHaveLength(0);
    expect(result.civicItems).toHaveLength(1);
    expect(result.eventItems).toHaveLength(0);
    expect(result.upAheadEvidence.coveredCategories).not.toContain('events');
  });

  it('keeps unrelated retailers and products separate during Black Friday', () => {
    vi.useFakeTimers().setSystemTime(NOW);
    const result = project({ shopping: [
      row('Amazon India Black Friday laptop sale', 'shopping'),
      row('Flipkart India Black Friday clothing sale', 'shopping'),
      row('Amazon India Black Friday camera sale', 'shopping'),
    ] });
    expect(result.onlineOffers).toHaveLength(3);
  });

  it('does not count saved-plan-only data as fetched tab coverage', () => {
    vi.useFakeTimers().setSystemTime(NOW);
    const result = getVisibleUpAheadProjection({ settings, data: {
      sections: {}, weekly_plan: [{ date: '2026-11-15', items: [row('saved item', 'events')] }],
    } });
    expect(result.hasVisibleContent).toBe(false);
    expect(result.upAheadEvidence.totalVisibleItems).toBe(0);
  });

  it('retains both category routes for one source article without duplicate suggestions', () => {
    vi.useFakeTimers().setSystemTime(NOW);
    const item = row('workshop', 'events', { title: 'Chennai workshop', eventStartAt: NOW + DAY,
      plannerEligible: true, url: 'https://example.org/workshop', city: 'Chennai' });
    const data = sanitizeUpAheadData({ fetchedAt: NOW, items: [item, { ...item, category: 'alerts' }] });
    const result = getVisibleUpAheadProjection({ data, settings });
    expect(result.eventItems).toHaveLength(1);
    expect(result.generalAlerts).toHaveLength(1);
    expect(result.suggestedItems).toHaveLength(1);
  });

  it('offers an ongoing multi-day event to Planner today and deduplicates saved occurrences', () => {
    const item = row('expo', 'events', { city: 'Chennai', eventStartAt: NOW - DAY,
      eventEndAt: NOW + DAY, plannerEligible: true, date: '2026-11-13' });
    const data = { timeline: [{ date: item.date, items: [item] }] };
    const suggested = getUpAheadPlannerSuggestions(data, {}, new Set(), settings.upAhead, NOW);
    expect(suggested).toHaveLength(1);
    expect(suggested[0].planDate).toBe('2026-11-14');
    expect(getUpAheadPlannerSuggestions(data, { '2026-11-14': suggested }, new Set(), settings.upAhead, NOW)).toHaveLength(0);
  });
});
