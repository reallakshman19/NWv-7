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

function renderStory(story, { title = 'Muscat' } = {}) {
  render(
    <NewsSection
      id="local-news"
      title={title}
      icon="📍"
      colorClass="news-section__title--local"
      news={[story]}
      maxDisplay={1}
    />
  );
}

function topStoryRank(overrides = {}) {
  return {
    normalizedScore: 0.72,
    score: 87.5,
    eventType: 'public_safety',
    eventQualified: true,
    slotBand: 'primary',
    admissionReason: 'admitted',
    timestampConfidence: 'high',
    ageHours: 2,
    freshnessScore: 0.83,
    publicInterestScore: 0.96,
    consensusScore: 0.36,
    sourceCount: 2,
    topFeedHits: 2.2,
    topFeedCorroborationHits: 1,
    independentEvidenceCount: 1,
    penalties: 0,
    explanation: 'event=public_safety; qualified=true; reason=admitted',
    ...overrides,
  };
}

describe('S1 browser-visible card provenance', () => {
  it('exposes the exact story ID and clickable publisher URL on the rendered card', () => {
    renderStory({
      id: 'world-immutable-123',
      title: 'Verified publisher headline',
      source: 'Example publisher',
      url: 'https://publisher.example/world/123?edition=1',
      publishedAt: Date.now() - 60_000,
    });
    const headline = screen.getByText('Verified publisher headline');
    const card = headline.closest('article.modern-news-card');

    expect(card).not.toBeNull();
    expect(card.getAttribute('data-story-id')).toBe('world-immutable-123');
    expect(card.getAttribute('data-story-url'))
      .toBe('https://publisher.example/world/123?edition=1');
  });

  it('uses the same sourceUrl fallback as the real card click target', () => {
    renderStory({
      id: 'world-source-fallback-1',
      title: 'Publisher story with sourceUrl only',
      source: 'Example publisher',
      sourceUrl: 'https://publisher.example/latest/one',
      publishedAt: Date.now() - 60_000,
    });
    const card = screen.getByText('Publisher story with sourceUrl only')
      .closest('article.modern-news-card');
    expect(card.getAttribute('data-story-id')).toBe('world-source-fallback-1');
    expect(card.getAttribute('data-story-url'))
      .toBe('https://publisher.example/latest/one');
  });

  it('does not fabricate a canonical URL or identity for a missing publisher field', () => {
    renderStory({
      title: 'Unidentified story',
      source: 'Unknown',
      publishedAt: Date.now() - 60_000,
    });
    const card = screen.getByText('Unidentified story').closest('article.modern-news-card');

    expect(card.getAttribute('data-story-id')).toBe('');
    expect(card.getAttribute('data-story-url')).toBe('');
  });
});

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
    expect(screen.getAllByText('General update').length).toBeGreaterThanOrEqual(2);
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

describe('NW-RANK-011 Top Stories UI consistency', () => {
  it('renders authoritative _topStoryRank diagnostics for a row without legacy breakdown', async () => {
    renderStory({
      id: 'bbc-ranked',
      title: 'Qualified public safety report',
      source: 'BBC',
      impactScore: 1,
      publishedAt: Date.now() - 2 * 60 * 60 * 1000,
      _topStoryRank: topStoryRank(),
    }, { title: 'Top Stories' });

    await userEvent.click(screen.getByTitle('Story info'));

    expect(screen.getByText('Top Stories Diagnostics')).toBeTruthy();
    expect(screen.getByText('_topStoryRank')).toBeTruthy();
    expect(screen.getByText('0.72')).toBeTruthy();
    expect(screen.getByText('admitted')).toBeTruthy();
    expect(screen.getByText('Independent Evidence').parentElement?.textContent).toContain('1.00');
    expect(screen.queryByText('Ranking Score')).toBeNull();
  });

  it('uses normalized Top Stories score for stars even when legacy impact score conflicts', () => {
    renderStory({
      id: 'ranked-rating',
      title: 'Ranked story',
      source: 'Reuters',
      impactScore: 25,
      publishedAt: Date.now(),
      _topStoryRank: topStoryRank({ normalizedScore: 0.72 }),
    }, { title: 'Top Stories' });

    const rating = screen.getByLabelText('Top Stories score 0.72 of 1; 4 of 5 stars');
    expect(rating.textContent).toBe('★★★★☆');
  });

  it('shows an integrity warning and only a reference legacy score when _topStoryRank is missing', async () => {
    renderStory({
      id: 'missing-rank',
      title: 'Legacy-only Top Stories row',
      source: 'BBC',
      impactScore: 18,
      publishedAt: Date.now(),
      _scoreBreakdown: {
        freshness: 2,
        severity: 1,
        decisions: ['legacy keyword evidence'],
      },
    }, { title: 'Top Stories' });

    expect(screen.getByLabelText('Top Stories score unavailable; 0 of 5 stars').textContent).toBe('☆☆☆☆☆');

    await userEvent.click(screen.getByTitle('Story info'));

    expect(screen.getByText('Top Stories Diagnostics')).toBeTruthy();
    expect(screen.getByText('unavailable')).toBeTruthy();
    expect(screen.getByText('authoritative _topStoryRank is missing')).toBeTruthy();
    expect(screen.getByText('Legacy Section Score — reference only')).toBeTruthy();
    expect(screen.getByText('18.00')).toBeTruthy();
  });

  it('retains legacy impact-star behavior outside Top Stories', () => {
    renderStory({
      id: 'ordinary-rating',
      title: 'Ordinary section story',
      source: 'Wire',
      impactScore: 12,
      publishedAt: Date.now(),
      _topStoryRank: topStoryRank({ normalizedScore: 0.9 }),
    });

    const rating = screen.getByLabelText('Impact score 12.00; 4 of 5 stars');
    expect(rating.textContent).toBe('★★★★☆');
  });
});