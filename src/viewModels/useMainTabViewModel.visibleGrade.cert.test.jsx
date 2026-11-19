// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import NewsSection from '../components/NewsSection.jsx';
import { useMainTabViewModel } from './useMainTabViewModel.js';

const state = vi.hoisted(() => ({
    news: { envelope: null, newsData: {}, breakingNews: [], loading: false, errors: {}, auditResults: {} },
    settings: { settings: { customSortTopStories: false, sections: {} } },
    segment: { currentSegment: { id: 'morning' } },
    weather: { weatherData: {}, loading: false },
}));
vi.mock('../context/NewsContext', () => ({ useNews: () => state.news }));
vi.mock('../context/SettingsContext', () => ({ useSettings: () => state.settings }));
vi.mock('../context/SegmentContext', () => ({ useSegment: () => state.segment }));
vi.mock('../context/WeatherContext', () => ({ useWeather: () => state.weather }));
vi.mock('../utils/toplineGenerator', () => ({
    generateTopline: () => null, fetchOnThisDay: async () => null,
}));
vi.mock('../services/travelLocationProfile.js', async original => ({
    ...await original(),
    getTravelLocationProfile: () => ({ prioritizeStories: false }),
}));

afterEach(() => { cleanup(); });

it('grades exactly the personalized cards rendered before expansion and after expansion or folding', async () => {
    const now = Date.now();
    const rows = Array.from({ length: 12 }, (_, i) => ({
        id: 'visible-' + i, title: 'Distinct article ' + i,
        publishedAt: now - (i < 10 ? 1 : 10) * 3_600_000,
        source: 'BBC', url: 'https://bbc.com/news/story-' + i,
    }));
    state.news.envelope = { ok: true, source: 'snapshot', freshness: 'fresh', data: { sections: {}, frontPage: rows } };
    state.news.newsData = { frontPage: rows };
    let vm;
    function Page() {
        const model = useMainTabViewModel({ isWebView: true });
        useEffect(() => { vm = model; });
        return <NewsSection id="top-stories" title="Top Stories" news={model.latestStories}
            maxDisplay={10} presentation={model.topStoriesPresentation}
            onPresentationChange={model.setTopStoriesPresentation} />;
    }
    render(<Page />);
    expect(screen.getAllByRole('article')).toHaveLength(10);
    expect(vm.mainTabAudit.summary.frontPageStoryCount).toBe(10);
    expect(vm.mainTabAudit.summary.top10FreshRatio).toBe(1);
    const user = userEvent.setup();
    await user.click(screen.getByText('Show 2 more'));
    expect(screen.getAllByRole('article')).toHaveLength(12);
    expect(vm.mainTabAudit.summary.frontPageStoryCount).toBe(12);
    expect(vm.mainTabAudit.summary.top10FreshRatio).toBe(0.833);
    await user.click(screen.getByRole('heading', { name: /Top Stories/ }));
    await waitFor(() => expect(screen.queryAllByRole('article')).toHaveLength(0));
    expect(vm.mainTabAudit.summary.frontPageStoryCount).toBe(0);
});
