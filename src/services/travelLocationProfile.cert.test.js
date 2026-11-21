import { describe, expect, it } from 'vitest';
import {
  buildTravelLocationSettings,
  buildWeatherSelectedNewsSettings,
  getTravelEditionOptions,
  getTravelLocationProfile,
  normalizeTravelLocation,
  resolveTravelLocationKey,
} from './travelLocationProfile';

describe('Travel location profile certification', () => {
  it('accepts Colombo and common misspelling Columbo', () => {
    expect(resolveTravelLocationKey('Colombo')).toBe('colombo');
    expect(resolveTravelLocationKey('columbo')).toBe('colombo');
    expect(resolveTravelLocationKey('Sri Lanka')).toBe('colombo');
  });

  it('normalizes travel location strings', () => {
    expect(normalizeTravelLocation('  Sri-Lanka  ')).toBe('sri lanka');
  });

  it('builds canonical travel location settings', () => {
    const settings = buildTravelLocationSettings({}, { city: 'Columbo' });
    expect(settings.travelLocation.city).toBe('colombo');
    expect(settings.travelLocation.prioritizeStories).toBe(true);
  });

  it('uses manual travel location before weather location', () => {
    const profile = getTravelLocationProfile({
      weather: { activeCity: 'muscat' },
      travelLocation: { city: 'colombo' },
    });

    expect(profile.key).toBe('colombo');
    expect(profile.countryCode).toBe('LK');
    expect(profile.source).toBe('manual');
  });

  it('can derive from active weather city', () => {
    const profile = getTravelLocationProfile({
      weather: { activeCity: 'columbo' },
    });

    expect(profile.key).toBe('colombo');
    expect(profile.source).toBe('weather-active-city');
  });

  it('returns correct Sri Lanka news edition', () => {
    const profile = getTravelLocationProfile({
      travelLocation: { city: 'colombo' },
    });

    expect(getTravelEditionOptions(profile)).toEqual({
      country: 'LK',
      lang: 'en',
      timeRange: '30d',
    });
  });

  it('switches local news with each Quick Weather city selection', () => {
    const initial = {
      weather: { cities: ['chennai', 'trichy', 'muscat'], activeCity: 'chennai' },
      travelLocation: { city: 'chennai', enabled: true, prioritizeStories: true },
      theme: 'dark',
    };

    const trichy = buildWeatherSelectedNewsSettings(initial, 'Trichy');
    expect(trichy.weather.activeCity).toBe('trichy');
    expect(trichy.travelLocation.city).toBe('chennai');
    expect(getTravelLocationProfile(trichy, { activeWeatherCity: trichy.weather.activeCity }).display).toBe('Trichy');
    expect(trichy.theme).toBe('dark');

    const muscat = buildWeatherSelectedNewsSettings(trichy, 'Muscat');
    expect(muscat.weather.activeCity).toBe('muscat');
    expect(muscat.travelLocation.city).toBe('chennai');
    expect(getTravelLocationProfile(muscat, { activeWeatherCity: muscat.weather.activeCity }).countryLabel).toBe('Oman');
  });

  it('retains the user\'s local-news visibility preference', () => {
    const previous = {
      travelLocation: { city: 'chennai', enabled: false, prioritizeStories: false },
    };

    const next = buildWeatherSelectedNewsSettings(previous, 'colombo');
    expect(next.travelLocation).toEqual({
      city: 'chennai',
      enabled: false,
      prioritizeStories: false,
    });
    expect(getTravelLocationProfile(next).prioritizeStories).toBe(false);
  });

  it('shows a selected weather-only city instead of stale Chennai news', () => {
    const next = buildWeatherSelectedNewsSettings({
      travelLocation: { city: 'chennai' },
    }, 'Mumbai');

    const profile = getTravelLocationProfile(next, { activeWeatherCity: next.weather.activeCity });
    expect(profile.key).toBe('mumbai');
    expect(profile.display).toBe('Mumbai');
    expect(profile.countryLabel).toBe('India');
    expect(profile.hasDedicatedLocalFeed).toBe(false);
  });

  it('does not change saved settings for unknown cities', () => {
    const saved = { travelLocation: { city: 'chennai' } };
    expect(buildWeatherSelectedNewsSettings(saved, 'not-a-city')).toBe(saved);
  });

});
