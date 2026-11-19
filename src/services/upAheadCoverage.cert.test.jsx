// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getUpAheadLocalCoverage } from './upAheadCoverage.js';
import LocalCoverage from '../components/up-ahead/LocalCoverage.jsx';
import { sanitizeUpAheadData, mergeUpAheadData, saveToCache, loadFromCache } from './upAheadService.js';
import { getVisibleUpAheadProjection } from './upAheadProjection.js';

const NOW = Date.parse('2026-11-18T16:00:00Z');
const HOUR = 3600000;
const settings = { locations: ['Chennai', 'Muscat'], categories: { events: true, civic: true, weather_alerts: true } };
const counts = { attemptedSources: 1, successfulSources: 1, failedSources: 0, checkedAt: NOW };
const data = { fetchedAt: NOW, acquisitionSummary: { checkedAt: NOW, byCategory: {
  events: { ...counts, byLocation: { Chennai: counts, Muscat: { ...counts, successfulSources: 0, failedSources: 1 } } },
} }, sourceStatuses: {
  'imd-nowcast': { category: 'weather_alerts', source: 'IMD Chennai', city: 'Chennai', checkedAt: NOW, ok: true,
    issuedAt: NOW-HOUR, validUntil: NOW+2*HOUR, status: 'checked_empty', message: 'Chennai severe weather warning: NIL' },
} };

afterEach(() => vi.restoreAllMocks());

describe('Source coverage and the routed rolling feed', () => {
  it('does not certify one city using another city or a whole-snapshot timestamp', () => {
    const result = getUpAheadLocalCoverage({ data, categories: ['events'], settings, now: NOW });
    expect(result.cities.map(row => row.status)).toEqual(['checked', 'unavailable']);
    const stale = structuredClone(data);
    stale.acquisitionSummary.byCategory.events.byLocation.Chennai.checkedAt = NOW-13*HOUR;
    expect(getUpAheadLocalCoverage({ data: stale, categories: ['events'], settings, now: NOW }).cities[0].status).toBe('unknown');
    expect(getUpAheadLocalCoverage({ data: { fetchedAt: NOW }, categories: ['events'], settings, now: NOW }).cities.every(row => row.status==='unknown')).toBe(true);
  });

  it('shows actual bulletin content and validity, never an expired all-clear', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const html = renderToStaticMarkup(<LocalCoverage data={data} categories={['weather_alerts']} settings={settings} alerts />);
    expect(html).toContain('Chennai severe weather warning: NIL');
    expect(html).toContain('Bulletin valid until');
    expect(html).not.toContain('Chennai &amp; Muscat alert coverage');
    vi.mocked(Date.now).mockReturnValue(NOW+2*HOUR);
    const expired = renderToStaticMarkup(<LocalCoverage data={data} categories={['weather_alerts']} settings={settings} alerts />);
    expect(expired).not.toContain('warning: NIL');
    expect(expired).toContain('last source check has expired');
  });

  it('honours category and city settings, and reports failures separately from empty results', () => {
    expect(getUpAheadLocalCoverage({ data, categories: ['weather_alerts'], locations: ['Muscat'], settings, now: NOW }).bulletins).toEqual([]);
    const disabled = getUpAheadLocalCoverage({ data, categories: ['weather_alerts'], settings: { categories: { weather_alerts: false } }, now: NOW });
    expect(disabled.bulletins).toEqual([]);
    expect(disabled.cities.every(row => row.status==='disabled')).toBe(true);
    const failed = structuredClone(data);
    failed.sourceStatuses['imd-nowcast'] = { ...failed.sourceStatuses['imd-nowcast'], ok: false, status: 'checked_empty', message: 'Source timed out' };
    expect(getUpAheadLocalCoverage({ data: failed, categories: ['weather_alerts'], now: NOW }).bulletins[0]).toMatchObject({ status: 'unavailable', message: 'Source timed out' });
  });

  it('retains newest source evidence even if an older snapshot arrives later', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const item = { id: 'music', category: 'events', title: 'Chennai Music', city: 'Chennai',
      eventStartAt: NOW+HOUR, eventEndAt: NOW+2*HOUR, expiryAt: NOW+2*HOUR };
    const first = { ...data, sections: { events: [item] }, timeline: [] };
    const older = structuredClone(first);
    older.fetchedAt -= HOUR;
    older.sourceStatuses['imd-nowcast'].checkedAt -= HOUR;
    older.sourceStatuses['imd-nowcast'].message = 'Older check';
    const merged = mergeUpAheadData(first, older);
    expect(merged.sourceStatuses['imd-nowcast'].message).toContain('warning: NIL');
  });

  it('transports real schedule/notice fields through normalization, category/city selection and expiry', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const event = { id: 'music', title: 'Chennai Music', category: 'events', city: 'Chennai',
      source: 'Calendar', sourceAuthority: 'official', url: 'https://example.org/music',
      publishedAt: null, observedAt: NOW, eventDateKey: '2026-11-19', eventStartAt: NOW+10*HOUR,
      expiryAt: NOW+13*HOUR, datePrecision: 'time', plannerEligible: true };
    const civic = { id: 'water', title: 'Muscat water supply interruption', category: 'civic', city: 'Muscat',
      publishedAt: NOW-HOUR, expiryAt: NOW+HOUR, source: 'Local publisher', sourceUrl: 'https://example.org/water' };
    const raw = sanitizeUpAheadData({ fetchedAt: NOW, items: [event, civic] });
    const view = getVisibleUpAheadProjection({ data: raw, settings: { upAhead: settings } });
    expect(view.eventItems).toHaveLength(1);
    expect(view.eventItems[0].publishedAt).toBeNull();
    expect(view.eventItems[0].sourceMode).toBe('snapshot');
    expect(view.civicItems).toHaveLength(1);
    expect(view.combinedAlerts).toHaveLength(1);
    expect(getVisibleUpAheadProjection({ data: raw, settings: { upAhead: { ...settings, locations: ['Chennai'] } } }).civicItems).toEqual([]);
    expect(getVisibleUpAheadProjection({ data: raw, settings: { upAhead: { ...settings, categories: { civic: false, events: false } } } }).combinedAlerts).toEqual([]);
    vi.mocked(Date.now).mockReturnValue(NOW+13*HOUR);
    expect(getVisibleUpAheadProjection({ data: raw, settings: { upAhead: settings } }).eventItems).toEqual([]);
    expect(getVisibleUpAheadProjection({ data: raw, settings: { upAhead: settings } }).civicItems).toEqual([]);
  });

  it('keeps official cancellations effective across stale replays without altering personal reminders', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    localStorage.clear();
    const manual = JSON.stringify({ '2026-11-20': [{ id: 'manual', title: 'My own weather reminder' }] });
    localStorage.setItem('upAhead_planner', manual);
    const warning = { id: 'cap-001', occurrenceId: 'oman-warnings:cap-001', category: 'weather_alerts',
      title: 'Muscat heavy rain warning', city: 'Muscat', eventStartAt: NOW-HOUR,
      eventEndAt: NOW+HOUR, expiryAt: NOW+HOUR, datePrecision: 'time', observedAt: NOW-HOUR };
    saveToCache({ fetchedAt: NOW-HOUR, items: [warning] });
    saveToCache({ fetchedAt: NOW, items: [], retiredOccurrences: [
      { source: 'oman-warnings', category: 'weather_alerts', occurrenceId: 'oman-warnings:cap-001', observedAt: NOW },
    ] }, null, settings);
    saveToCache({ fetchedAt: NOW-HOUR, items: [{ ...warning, observedAt: NOW+1 }] }, null, settings);
    const retained = loadFromCache(settings);
    expect(retained.sections.weather_alerts || []).toEqual([]);
    expect(localStorage.getItem('upAhead_planner')).toBe(manual);
    expect(retained.retiredOccurrences).toHaveLength(1);
  });
});
