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
}));

vi.mock('../config/rankingPolicy.js', () => ({
  getRankingPolicy: () => ({ freshness: { halfLifeHours: 10, longFormHalfLifeHours: 36 } }),
}));

vi.mock('../utils/trendingUtils.js', () => ({
  computeTrending: () => false,
}));

import NewsSection from './NewsSection.jsx';

const stories = [
  {
    id: 'world-1',
    title: 'World report one',
    source: 'BBC',
    sourceGroup: 'bbc',
    publishedAt: Date.now() - 60_000,
  },
  {
    id: 'world-2',
    title: 'World report two',
    source: 'The Hindu',
    sourceGroup: 'the_hindu',
    publishedAt: Date.now() - 120_000,
  },
];

function renderWorld(props = {}) {
  return render(
    <NewsSection
      id="world-news"
      title="World"
      icon="🌍"
      colorClass="news-section__title--world"
      news={stories}
      maxDisplay={2}
      {...props}
    />
  );
}

describe('NW-MAIN-007 NewsSection runtime health boundary', () => {
  it('shows Warning instead of Unknown when rendered stories provide source evidence', async () => {
    renderWorld();

    const badge = screen.getByRole('button', { name: /section health: warning or degraded for world/i });
    expect(badge.getAttribute('data-status')).toBe('warning');
    expect(screen.queryByText('Unknown')).toBeNull();

    await userEvent.click(badge);

    const dialog = screen.getByRole('dialog', { name: 'Section health diagnostics' });
    expect(dialog.textContent).toContain('world');
    expect(dialog.textContent).toContain('2');
    expect(dialog.textContent).toContain('BBC (1)');
    expect(dialog.textContent).toContain('The Hindu (1)');
    expect(dialog.textContent).toContain('runtime story evidence only');
    expect(dialog.textContent).toContain('source health unavailable');
    expect(dialog.textContent).not.toContain('unknown — diagnostics unavailable');
  });

  it('preserves an authoritative concrete health summary', () => {
    renderWorld({
      healthSummary: {
        sectionId: 'world',
        status: 'critical',
        storyCount: 2,
        sourceGroupCount: 2,
        topSources: [{ source: 'BBC', count: 1 }, { source: 'The Hindu', count: 1 }],
        reasons: ['source_failure_present'],
      },
    });

    expect(screen.getByRole('button', { name: /section health: critical for world/i }).getAttribute('data-status'))
      .toBe('critical');
  });

  it('fails closed when the served section is empty and source health is unavailable', () => {
    renderWorld({ news: [] });
    const badge = screen.getByRole('button', {
      name: /section health: critical for world.*served_section_empty.*source_health_unavailable/i,
    });
    expect(badge.getAttribute('data-status')).toBe('critical');
  });
});
