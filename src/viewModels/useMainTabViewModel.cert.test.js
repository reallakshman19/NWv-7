import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import {
  __mainViewModelInternalsForTest,
} from './useMainTabViewModel.js';

vi.mock('../utils/storage', () => ({
  getViewCount: vi.fn(() => 0),
  isArticleRead: vi.fn(() => false),
}));

const {
  filterLatestStories,
  getProjectedMainData,
  makeMainBoundaryEnvelope,
  getRefreshOutcome,
} = __mainViewModelInternalsForTest;

const story = id => ({
  id,
  title: id,
  url: `https://example.com/${id}`,
});

const ids = rows => rows.map(row => row.id);

describe('useMainTabViewModel Top Stories ranker-order guardrail', () => {
  const src = fs.readFileSync('src/viewModels/useMainTabViewModel.js', 'utf8');

  it('retires final generic recency ranking from Main Top Stories', () => {
    expect(src).not.toContain('rankTopStoriesByRecency');
    expect(src).not.toContain('topStoriesRecency');
  });

  it('preserves supplied ranker order by default', () => {
    const rows = [story('ranker-first'), story('ranker-second'), story('ranker-third')];

    expect(ids(filterLatestStories(rows, false))).toEqual([
      'ranker-first',
      'ranker-second',
      'ranker-third',
    ]);
  });

  it('caps Main Top Stories at 25', () => {
    const rows = Array.from({ length: 30 }, (_, index) => story(`story-${index}`));

    expect(filterLatestStories(rows, false)).toHaveLength(25);
  });

  it('custom sorting does not recency-rank supplied ranker order', () => {
    const rows = [story('ranker-first'), story('ranker-second'), story('ranker-third')];

    expect(ids(filterLatestStories(rows, true))).toEqual([
      'ranker-first',
      'ranker-second',
      'ranker-third',
    ]);
  });
});

describe('useMainTabViewModel Main migration internals', () => {
  it('projects dataset frontPage into newsData fallback shape', () => {
    const result = getProjectedMainData({
      envelope: {
        data: {
          frontPage: [story('a')],
          sections: { world: [story('world-a')] },
        },
      },
      newsData: {},
      weatherData: { temp: 30 },
      breakingNews: [],
    });

    expect(result.newsData.frontPage).toHaveLength(1);
    expect(result.newsData.world).toHaveLength(1);
  });

  it('marks loading-only Main projection as not ready', () => {
    const envelope = makeMainBoundaryEnvelope({
      envelope: null,
      newsData: {},
      weatherData: null,
      breakingNews: [],
      isLoading: true,
      error: null,
    });

    expect(envelope.ok).toBe(false);
    expect(envelope.validation.warnings).toContain('main_loading_without_renderable_projection');
  });

  it('reports degraded refresh when one source succeeds and one envelope fails', () => {
    const outcome = getRefreshOutcome([
      { status: 'fulfilled', value: true },
      { status: 'fulfilled', value: { ok: false, error: 'news down' } },
    ]);

    expect(outcome.ok).toBe(true);
    expect(outcome.degraded).toBe(true);
  });
});
