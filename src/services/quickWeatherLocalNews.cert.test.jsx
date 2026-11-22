import React from 'react';
import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TravelLocalStories from '../components/travel/TravelLocalStories.jsx';
import { getTravelLocationProfile, buildWeatherSelectedNewsSettings } from './travelLocationProfile.js';
import { fetchTravelNewsPayload, mergeTravelNewsIntoNewsData } from './travelNewsIngestion.js';

const publishedAt = new Date().toISOString();
const baseSettings = {
  weather: { cities: ['chennai', 'trichy', 'muscat'], activeCity: 'chennai' },
  travelLocation: { city: 'colombo', enabled: true, prioritizeStories: true },
};
const profileFor = city => {
  const next = buildWeatherSelectedNewsSettings(baseSettings, city);
  return getTravelLocationProfile(next, { activeWeatherCity: next.weather.activeCity });
};
afterEach(() => vi.unstubAllGlobals());

describe('Quick Weather → Travel Local end-to-end contract', () => {
  it('uses weather city only for Main-page news while preserving saved travel preference', () => {
    const next = buildWeatherSelectedNewsSettings(baseSettings, 'Muscat');
    expect(next.weather.activeCity).toBe('muscat');
    expect(next.travelLocation.city).toBe('colombo');
    expect(profileFor('muscat').key).toBe('muscat');
    expect(profileFor('muscat').source).toBe('quick-weather');
    expect(getTravelLocationProfile(baseSettings).key).toBe('colombo');
  });

  it('filters out Chennai and state-only headlines in Trichy local panel', () => {
    const html = renderToStaticMarkup(<TravelLocalStories profile={profileFor('trichy')} newsData={{
      local: [
        { id: 'wrong', title: 'Chennai corporation updates Tamil Nadu roadworks' },
        { id: 'right', title: 'Trichy corporation announces city bus expansion', publishedAt },
        { id: 'broad', title: 'Tamil Nadu statewide transport policy announced' },
      ],
    }} />);
    expect(html).toContain('Trichy / India');
    expect(html).toContain('Trichy corporation announces');
    expect(html).not.toContain('Chennai corporation');
    expect(html).not.toContain('statewide transport');
  });

  it('renders Muscat headlines but not foreign source-only stories', () => {
    const html = renderToStaticMarkup(<TravelLocalStories profile={profileFor('muscat')} newsData={{
      local: [
        { id: 'wrong', title: 'Chennai port expands traffic access', source: 'Muscat Daily' },
        { id: 'right', title: 'Muscat Municipality opens new traffic interchange', source: 'Global Wire', publishedAt },
      ],
    }} />);
    expect(html).toContain('Muscat / Oman');
    expect(html).toContain('Muscat Municipality');
    expect(html).not.toContain('Chennai port');
  });

  it('does not fall back to Chennai for weather-only cities and never fetches a fake city JSON', async () => {
    const mumbai = profileFor('mumbai');
    expect(mumbai.display).toBe('Mumbai');
    expect(mumbai.hasDedicatedLocalFeed).toBe(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const payload = await fetchTravelNewsPayload({ profile: mumbai });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(payload.locationKey).toBe('mumbai');

    const html = renderToStaticMarkup(<TravelLocalStories profile={mumbai} newsData={{
      local: [{ title: 'Chennai local city festival' }, { title: 'Mumbai civic authorities launch new ferry service', publishedAt }],
    }} />);
    expect(html).toContain('Mumbai / India');
    expect(html).toContain('Mumbai civic authorities');
    expect(html).not.toContain('Chennai local');
  });

  it('shows an accurate empty panel and discards stale previous-city payloads', () => {
    const profile = profileFor('muscat');
    const html = renderToStaticMarkup(<TravelLocalStories profile={profile} newsData={{
      local: [{ title: 'Chennai corporation announces new measures' }],
    }} />);
    expect(html).toContain('No strong Muscat local story match yet');
    expect(html).not.toContain('Chennai corporation');
    const old = { locationKey: 'chennai', stories: [{ title: 'Chennai rail update' }] };
    expect(mergeTravelNewsIntoNewsData({}, old, profile)).toEqual({});
  });

  it('wires Main view model and both desktop/mobile panel placements', () => {
    const main = fs.readFileSync('src/pages/MainPage.jsx', 'utf8');
    const vm = fs.readFileSync('src/viewModels/useMainTabViewModel.js', 'utf8');
    expect(main.match(/<TravelLocalStories newsData=\{prioritizedNewsData\} profile=\{travelLocationProfile\}/g)).toHaveLength(2);
    expect(vm).toContain('getTravelLocationProfile(safeSettings, { activeWeatherCity: safeSettings?.weather?.activeCity })');
    expect(main).not.toContain('localStorage.getItem');
    expect(main).not.toContain('localStorage.setItem');
  });
});
