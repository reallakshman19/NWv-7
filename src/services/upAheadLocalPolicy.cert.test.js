import { describe, expect, it } from 'vitest';
import { classifyRetailOffer, getAlertProvenance, getLocalSourceDirectory, matchesLocalAlert } from './upAheadLocalPolicy.js';
import { buildSuggestedItems, getVisibleUpAheadProjection } from './upAheadProjection.js';

describe('Chennai and Muscat sources and scope', () => {
  it('keeps the requested online markets and store directory separate', () => {
    expect(getLocalSourceDirectory(['Chennai'], 'online').retailers.map(row => row.id)).toEqual(['amazon-in', 'flipkart-in']);
    expect(getLocalSourceDirectory(['Muscat'], 'online').retailers.map(row => row.id)).toEqual(['lulu-oman', 'hypermax-oman']);
    expect(getLocalSourceDirectory(['Muscat'], 'offline').retailers.map(row => row.id)).toEqual([
      'lulu-oman', 'hypermax-oman', 'sharaf-oman', 'extra-oman',
    ]);
    expect(getLocalSourceDirectory(['Chennai'], 'offline').retailers.map(row => row.id)).toEqual(['lulu-chennai']);
  });

  it('requires evidence of an affected city rather than a country search', () => {
    expect(matchesLocalAlert({ title: 'Rain warning for Salalah', region: 'oman' }, ['Muscat'])).toBe(false);
    expect(matchesLocalAlert({ title: 'India weather warning', region: 'in' }, ['Chennai'])).toBe(false);
    expect(matchesLocalAlert({ title: 'Chennai road closure tomorrow' }, ['Chennai'])).toBe(true);
    expect(matchesLocalAlert({ title: 'Power shutdown in Seeb' }, ['Muscat'])).toBe(true);
    expect(matchesLocalAlert({ title: 'National emergency', region: 'oman', affectedScope: 'countrywide' }, ['Muscat'])).toBe(true);
  });

  it('labels publisher reports without pretending they came from an official authority', () => {
    expect(getAlertProvenance({ sourceUrl: 'https://mausam.imd.gov.in/chennai/' })).toBe('Official notice');
    expect(getAlertProvenance({ sourceUrl: 'https://timesofoman.com/' })).toMatch(/News report/);
    expect(getAlertProvenance({ sourceUrl: 'https://met.caa.gov.om.evil.example/' })).toMatch(/News report/);
  });

  it('routes Oman online offers with city text online and rejects foreign Amazon stories', () => {
    expect(classifyRetailOffer({ title: 'LuLu Oman online delivery discount in Muscat' })).toMatchObject({
      market: 'oman', online: true, offline: true,
    });
    expect(classifyRetailOffer({ title: 'HyperMax Oman app-only sale in Seeb' })).toMatchObject({ online: true, offline: false });
    expect(classifyRetailOffer({ title: 'Amazon USA Prime Day sale', region: 'in' })).toBeNull();
    expect(classifyRetailOffer({ title: 'Amazon Prime Day sale' })).toBeNull();
    expect(classifyRetailOffer({ title: 'Amazon India laptop sale' })).toMatchObject({ online: true, offline: false });
    expect(classifyRetailOffer({ title: 'LuLu Kochi store sale', region: 'in', city: 'Kochi' })).toBeNull();
    expect(classifyRetailOffer({ title: 'Sharaf DG Dubai sale in UAE', region: 'oman' })).toBeNull();
    expect(classifyRetailOffer({ title: 'eXtra Oman online-only discount Muscat' })).toBeNull();
  });

  it('projects explicitly online Oman items online only, and hides unrelated regional alerts', () => {
    const now = Date.now();
    const row = (title, extras = {}) => ({ title, id: title, publishedAt: now, expiryAt: now + 3600_000, ...extras });
    const result = getVisibleUpAheadProjection({ settings: { upAhead: { locations: ['Chennai', 'Muscat'] } }, data: { sections: {
      shopping: [row('Hypermax Oman online offer in Muscat', { city: 'Muscat', offerChannel: 'online' })],
      alerts: [row('Muscat road closure tomorrow'), row('Salalah road closure', { region: 'oman' })],
      weather_alerts: [row('Heavy rain warning for Kerala', { region: 'in' })],
    } } });
    expect(result.onlineOffers).toHaveLength(1);
    expect(result.offlineOffers).toHaveLength(0);
    expect(result.combinedAlerts.map(row => row.title)).toEqual(['Muscat road closure tomorrow']);
  });

  it('keeps next-year holidays out of Suggested while retaining this week and current alerts', () => {
    const now = Date.now();
    const rows = buildSuggestedItems({
      festivalCards: [
        { id: 'soon', title: 'This week holiday', eventStartAt: now + 86400_000 },
        ...Array.from({ length: 30 }, (_, index) => ({ id: `future-${index}`, title: 'Next-year holiday', eventStartAt: now + 180 * 86400_000 })),
      ],
      generalAlerts: [{ id: 'alert', title: 'Muscat road closure', publishedAt: now - 3600_000 }],
    });
    expect(rows.map(row => row.id)).toEqual(['soon', 'alert']);
  });
  it('keeps election reports and unscoped school-closure roundups out of Holidays', () => {
    const now = Date.now();
    const row = (title, extra = {}) => ({ title, id: title, publishedAt: now, expiryAt: now + 86400_000, ...extra });
    const result = getVisibleUpAheadProjection({ settings: { upAhead: { locations: ['Chennai', 'Muscat'] } }, data: { sections: {
      festivals: [row('110 candidates to contest Oman Chamber elections on Nov 23', { region: 'oman' }),
        row('School Holiday Today: Check State-Wise List', { region: 'in' }),
        row('Muscat cultural festival tomorrow'), row('Christmas 2026', { city: 'Chennai', calendarDataset: 'curated-calendar' })],
    } } });
    expect(result.festivalCards.map(item => item.title)).toEqual(['Muscat cultural festival tomorrow', 'Christmas 2026']);
  });
});
