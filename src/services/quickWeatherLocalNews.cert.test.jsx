import React from 'react';
import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TravelLocalStories from '../components/travel/TravelLocalStories.jsx';
import { getTravelLocationProfile } from './travelLocationProfile.js';
import { fetchTravelNewsPayload, mergeTravelNewsIntoNewsData } from './travelNewsIngestion.js';

afterEach(() => vi.unstubAllGlobals());

describe('Quick Weather to Travel Local news contract', () => {
  const oldTravelSetting = { travelLocation: { city: 'chennai', prioritizeStories: true } };

  it('explicit weather selection wins over a saved travel city without changing manual-only behavior', () => {
    const manual = getTravelLocationProfile(oldTravelSetting);
    const selected = getTravelLocationProfile(oldTravelSetting, { activeWeatherCity: 'muscat' });
    expect(manual.key).toBe('chennai');
    expect(manual.source).toBe('manual');
    expect(selected.key).toBe('muscat');
    expect(selected.source).toBe('quick-weather');
    expect(selected.countryLabel).toBe('Oman');
  });

  it('shows selected Trichy news and excludes Chennai or Tamil Nadu-only stories', () => {
    const profile = getTravelLocationProfile(oldTravelSetting, { activeWeatherCity: 'trichy' });
    const html = renderToStaticMarkup(
      <TravelLocalStories profile={profile} newsData={{
        travelLocal: [
          { id: 'wrong', title: 'Chennai corporation announces Tamil Nadu road works' },
          { id: 'right', title: 'Trichy city roads to undergo major repair this weekend' },
          { id: 'broad', title: 'Tamil Nadu state government announces statewide measures' },
        ],
      }} />,
    );
    expect(html).toContain('Trichy / India');
    expect(html).toContain('Trichy city roads to undergo major repair');
    expect(html).not.toContain('Chennai corporation');
    expect(html).not.toContain('statewide measures');
  });

  it('supports any configured weather city without relabelling it Chennai', async () => {
    const profile = getTravelLocationProfile(oldTravelSetting, { activeWeatherCity: 'mumbai' });
    expect(profile.key).toBe('mumbai');
    expect(profile.display).toBe('Mumbai');
    expect(profile.countryLabel).toBe('India');
    expect(profile.source).toBe('quick-weather');
    expect(profile.prefetchSupported).toBe(false);

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const payload = await fetchTravelNewsPayload({ profile });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(payload.locationKey).toBe('mumbai');

    const html = renderToStaticMarkup(<TravelLocalStories
      profile={profile}
      newsData={{ travelLocal: [
        { id: 'c', title: 'Chennai welcomes new city buses this morning' },
        { id: 'm', title: 'Mumbai municipal corporation launches new city buses' },
      ] }}
    />);
    expect(html).toContain('Mumbai / India');
    expect(html).toContain('Mumbai municipal corporation');
    expect(html).not.toContain('Chennai welcomes');
  });

  it('renders an honest empty state and excludes stale city-specific fetches', () => {
    const muscat = getTravelLocationProfile(oldTravelSetting, { activeWeatherCity: 'muscat' });
    const html = renderToStaticMarkup(<TravelLocalStories
      profile={muscat}
      newsData={{ travelLocal: [{ title: 'Chennai new traffic policy in Tamil Nadu' }] }}
    />);
    expect(html).toContain('No strong Muscat local story match yet');
    expect(html).not.toContain('Chennai new traffic policy');

    const oldPayload = { locationKey: 'chennai', stories: [{ title: 'Chennai rail service resumes' }] };
    expect(mergeTravelNewsIntoNewsData({}, oldPayload, muscat)).toEqual({});
  });

  it('wires the event all the way from both Quick Weather mounts to the reactive view model', () => {
    const page = fs.readFileSync('src/pages/MainPage.jsx', 'utf8');
    const viewModel = fs.readFileSync('src/viewModels/useMainTabViewModel.js', 'utf8');
    expect(page.match(/onActiveCityChange=\{setSelectedQuickWeatherCity\}/g)).toHaveLength(2);
    expect(page).toContain('activeWeatherCity: selectedQuickWeatherCity');
    expect(viewModel).toContain('getTravelLocationProfile(safeSettings, { activeWeatherCity })');
    expect(viewModel).toContain('[safeSettings, activeWeatherCity]');
  });
});
