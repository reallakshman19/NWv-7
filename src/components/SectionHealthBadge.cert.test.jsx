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

const rankingPolicyMock = {
  freshness: {
    halfLifeHours: 10,
    longFormHalfLifeHours: 36,
  },
};

vi.mock('../config/rankingPolicy.js', () => ({
  DEFAULT_RANKING_POLICY: rankingPolicyMock,
  getRankingPolicy: () => rankingPolicyMock,
}));

vi.mock('../utils/trendingUtils.js', () => ({
  computeTrending: () => false,
}));

import SectionHealthBadge from './SectionHealthBadge.jsx';
import NewsSection from './NewsSection.jsx';
import { buildMainSectionHealthSummaryMap } from '../viewModels/useMainTabViewModel.js';

const warningSummary = {
  sectionId: 'muscat',
  status: 'warning',
  storyCount: 12,
  sourceGroupCount: 1,
  topSources: [{ source: 'Times of Oman', count: 12 }],
  warningFeeds: [{ id: 'muscat_daily', zeroItemRuns: 12, lastError: '415 Unsupported Media Type' }],
  deadFeeds: [],
  staleFeeds: [],
  zeroItemFeeds: [{ id: 'muscat_daily', zeroItemRuns: 12 }],
  singleSource: true,
  reasons: ['persistent_zero_item_feed_streak'],
};

function renderBadge(summary) {
  render(<SectionHealthBadge summary={summary} />);
  return screen.getByRole('button');
}

describe('SectionHealthBadge', () => {
  it('maps health statuses to accessible badge states', () => {
    let badge = renderBadge({ sectionId: 'india', status: 'ok' });
    expect(badge.dataset.status).toBe('ok');
    expect(badge.textContent).toContain('OK');

    badge.remove();
    badge = renderBadge({ sectionId: 'muscat', status: 'warning' });
    expect(badge.dataset.status).toBe('warning');
    expect(badge.textContent).toContain('Warning');

    badge.remove();
    badge = renderBadge({ sectionId: 'business', status: 'critical' });
    expect(badge.dataset.status).toBe('critical');
    expect(badge.textContent).toContain('Critical');
  });

  it('renders missing diagnostics as unknown instead of false-ok', () => {
    render(<SectionHealthBadge summary={null} />);
    const badge = screen.getByRole('button', { name: /diagnostics unavailable/i });
    expect(badge.dataset.status).toBe('unknown');
    expect(badge.textContent).toContain('Unknown');
  });

  it('renders warning status for Muscat-style partial source failure', () => {
    render(<SectionHealthBadge summary={warningSummary} />);
    const badge = screen.getByRole('button', { name: /section health: warning/i });
    expect(badge.dataset.status).toBe('warning');
    expect(badge.textContent).toContain('Warning');
  });
});

describe('NewsSection section-health integration', () => {
  it('opens health diagnostics without collapsing the section', async () => {
    render(
      <NewsSection
        id="local-news"
        title="Muscat"
        icon="📍"
        colorClass="news-section__title--local"
        news={[{ id: 'story-1', title: 'Muscat civic update', source: 'Times of Oman', publishedAt: 1725000000000 }]}
        healthSummary={warningSummary}
      />
    );

    expect(screen.getByText('Muscat civic update')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /section health: warning/i }));

    expect(screen.getByRole('dialog', { name: /section health diagnostics/i })).toBeTruthy();
    expect(screen.getByText('Muscat civic update')).toBeTruthy();
    expect(screen.getByText('persistent zero item feed streak')).toBeTruthy();
  });
});

describe('Main ViewModel section-health mapping', () => {
  it('maps health summaries to Main UI section ids and aliases', () => {
    const healthMap = buildMainSectionHealthSummaryMap({
      datasetEnvelope: {
        data: {
          summaries: [
            { section: 'local', count: 12, sourceCounts: { 'Times of Oman': 12 } },
            { section: 'business', count: 0, sourceCounts: {} },
            { section: 'chennai', count: 4, sourceCounts: { 'The Hindu Chennai': 4 } },
            { section: 'world', count: 8, sourceCounts: { BBC: 4, Reuters: 4 } },
          ],
          sourceHealth: {
            sources: [
              { id: 'times_of_oman', section: 'muscat', source: 'Times of Oman', status: 'ok', items: 12 },
              { id: 'muscat_daily', section: 'muscat', source: 'Muscat Daily', status: 'warn', items: 0, zeroItemRuns: 12 },
              { id: 'financial_express', section: 'business', source: 'Financial Express', status: 'fail', items: 0, zeroItemRuns: 12 },
            ],
          },
        },
      },
    });

    expect(healthMap.local.status).toBe('warning');
    expect(healthMap['local-news']).toBe(healthMap.local);
    expect(healthMap.muscat).toBe(healthMap.local);
    expect(healthMap.business.status).toBe('critical');
    expect(healthMap.chennai.sectionId).toBe('chennai');
    expect(healthMap['chennai-news']).toBe(healthMap.chennai);
    expect(healthMap.world.status).toBe('ok');
    expect(healthMap['world-news']).toBe(healthMap.world);
  });
});
