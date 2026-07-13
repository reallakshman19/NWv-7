// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../context/NewsContext', () => ({
  useNews: () => ({ auditResults: {} }),
}));

vi.mock('../utils/storage', () => ({
  addReadArticle: vi.fn(),
  getSettings: () => ({}),
  getViewCount: () => 0,
  isArticleRead: () => false,
}));

vi.mock('../config/rankingPolicy.js', () => ({
  DEFAULT_RANKING_POLICY: { freshness: { halfLifeHours: 10, longFormHalfLifeHours: 36 } },
  getRankingPolicy: () => ({ freshness: { halfLifeHours: 10, longFormHalfLifeHours: 36 } }),
}));

vi.mock('../utils/trendingUtils.js', () => ({
  computeTrending: () => false,
}));

import NewsSection from './NewsSection.jsx';

function renderStory(story) {
  render(
    <NewsSection
      id="local-news"
      title="Muscat"
      icon="📍"
      colorClass="news-section__title--local"
      news={[story]}
      maxDisplay={1}
    />
  );
}

describe('NewsSection area relevance story info', () => {
  it('renders area relevance label, score, evidence, and human-readable reasons', async () => {
    renderStory({
      id: 'muscat-1',
      title: 'Ruwi civic works update near Muttrah',
      source: 'Muscat Daily',
      publishedAt: 1725000000000,
      _areaRelevance: {
        target: 'muscat',
        score: 92,
        label: 'exact-area',
        matchedTerms: ['ruwi', 'muttrah'],
        matchedFields: ['title', 'location'],
        sourceEvidence: ['title: ruwi', 'title: muttrah'],
        reasons: ['exact_area_match', 'city_match'],
        version: 'area-relevance-v1',
      },
    });

    await userEvent.click(screen.getByTitle('Story info'));

    expect(screen.getByText('Area Relevance')).toBeTruthy();
    expect(screen.getByText('exact-area — strong local/area evidence')).toBeTruthy();
    expect(screen.getByText('92')).toBeTruthy();
    expect(screen.getByText('ruwi, muttrah')).toBeTruthy();
    expect(screen.getByText('title, location')).toBeTruthy();
    expect(screen.getByText('title: ruwi, title: muttrah')).toBeTruthy();
    expect(screen.getByText('exact area match, city match')).toBeTruthy();
    expect(screen.getByText('area-relevance-v1')).toBeTruthy();
  });

  it('does not render a false empty area block when _areaRelevance is missing', async () => {
    renderStory({
      id: 'plain-1',
      title: 'General update',
      source: 'BBC',
      publishedAt: 1725000000000,
    });

    await userEvent.click(screen.getByTitle('Story info'));

    expect(screen.getByText('Story')).toBeTruthy();
    expect(screen.getByText('General update')).toBeTruthy();
    expect(screen.queryByText('Area Relevance')).toBeNull();
  });

  it('handles empty evidence arrays gracefully', async () => {
    renderStory({
      id: 'weak-1',
      title: 'Regional update with no local evidence',
      source: 'Wire',
      publishedAt: 1725000000000,
      _areaRelevance: {
        target: 'chennai',
        score: 0,
        label: 'weak',
        matchedTerms: [],
        matchedFields: [],
        sourceEvidence: [],
        reasons: [],
        version: 'area-relevance-v1',
      },
    });

    await userEvent.click(screen.getByTitle('Story info'));

    expect(screen.getByText('weak — insufficient local evidence')).toBeTruthy();
    expect(screen.getAllByText('None').length).toBeGreaterThanOrEqual(4);
  });
});
