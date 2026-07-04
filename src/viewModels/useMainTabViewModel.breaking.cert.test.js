import { describe, expect, it } from 'vitest';
import { __mainViewModelInternalsForTest } from './useMainTabViewModel.js';

const { filterLatestStories } = __mainViewModelInternalsForTest;
const now = Date.now();

describe('filterLatestStories breaking pin (L3)', () => {
  it('pins fresh breaking news above higher-impact non-breaking stories', () => {
    const stories = [
      { id: 'a', impactScore: 50, publishedAt: now - 60 * 60 * 1000 },
      { id: 'b', impactScore: 40, publishedAt: now - 60 * 60 * 1000 },
      { id: 'breaking', impactScore: 1, isBreaking: true, breakingScore: 5, publishedAt: now - 30 * 60 * 1000 },
      { id: 'c', impactScore: 30, publishedAt: now - 60 * 60 * 1000 },
    ];

    const result = filterLatestStories(stories, true);

    expect(result[0].id).toBe('breaking');
    expect(result.slice(1).map(s => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders fresh breaking items by breaking score', () => {
    const stories = [
      { id: 'a', impactScore: 50, publishedAt: now - 60 * 60 * 1000 },
      { id: 'lowbreak', impactScore: 1, isBreaking: true, breakingScore: 2, publishedAt: now - 30 * 60 * 1000 },
      { id: 'highbreak', impactScore: 1, isBreaking: true, breakingScore: 8, publishedAt: now - 30 * 60 * 1000 },
    ];

    const result = filterLatestStories(stories, true);

    expect(result.slice(0, 2).map(s => s.id)).toEqual(['highbreak', 'lowbreak']);
  });

  it('does not pin stale or timestamp-less breaking items outside the freshness window', () => {
    const stories = [
      { id: 'fresh', impactScore: 10, publishedAt: now - 60 * 60 * 1000 },
      { id: 'stale-breaking', impactScore: 1, isBreaking: true, breakingScore: 99, publishedAt: now - 8 * 60 * 60 * 1000 },
      { id: 'undated-breaking', impactScore: 1, isBreaking: true, breakingScore: 999 },
    ];

    const result = filterLatestStories(stories, false);

    expect(result[0].id).toBe('fresh');
    expect(result.map(s => s.id)).toEqual(['fresh', 'stale-breaking', 'undated-breaking']);
  });
});
