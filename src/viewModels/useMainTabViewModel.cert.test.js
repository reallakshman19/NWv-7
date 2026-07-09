import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

const readState = vi.hoisted(() => ({ readIds: new Set(), viewCounts: new Map() }));

vi.mock('../utils/storage', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isArticleRead: (id) => readState.readIds.has(id),
    getViewCount: (id) => readState.viewCounts.get(id) ?? 0,
  };
});

const { __mainViewModelInternalsForTest } = await import('./useMainTabViewModel.js');

const {
  MIN_CUSTOM_TOP_STORIES,
  MAX_VIEW_COUNT_FOR_CUSTOM_TOP_STORIES,
  asArray,
  asRecord,
  filterLatestStories,
  getNavSections,
  getProjectedMainData,
  makeMainBoundaryEnvelope,
  getRefreshOutcome,
  getFirstNewsError,
} = __mainViewModelInternalsForTest;

describe('useMainTabViewModel static checks', () => {
  const src = fs.readFileSync('src/viewModels/useMainTabViewModel.js', 'utf8');

  it('uses main dataset and owns context orchestration', () => {
    expect(src).toContain("useDataset('main')");
    expect(src).toContain('useWeather');
    expect(src).toContain('useNews');
    expect(src).toContain('useSettings');
    expect(src).toContain('useSegment');
  });

  it('owns travel, topline, latest-story, and audit projection', () => {
    expect(src).toContain('getTravelLocationProfile');
    expect(src).toContain('fetchTravelNewsPayload');
    expect(src).toContain('mergeTravelNewsIntoNewsData');
    expect(src).toContain('applyTravelLocationPriority');
    expect(src).toContain('generateTopline');
    expect(src).toContain('fetchOnThisDay');
    expect(src).toContain('filterLatestStories');
    expect(src).toContain('auditMainTabQuality');
  });

  it('supports both mainDataset shapes', () => {
    expect(src).toContain('data.newsData');
    expect(src).toContain('data.frontPage');
    expect(src).toContain('data.quickWeather');
    expect(src).toContain('data.raw?.newsData');
  });

  it('uses safe refresh fan-out and never passes boolean to refreshNews', () => {
    expect(src).toContain('Promise.allSettled');
    expect(src).toContain('refreshWeather(true)');
    expect(src).toContain('refreshNews()');
    expect(src).not.toContain('refreshNews' + '(true)');
  });

  it('guards Notification access', () => {
    expect(src).toContain("typeof Notification === 'undefined'");
  });

  it('applies travel priority to Top Stories when enabled', () => {
    expect(src).toContain('travelLocationProfile?.prioritizeStories');
    expect(src).toContain('prioritizedNewsData.frontPage');
  });

  it('is not a second Top Stories ranking authority (NW-RANK-001)', () => {
    // rankTopStories (services/topStories) owns Top Stories ordering; the
    // Main ViewModel must consume the supplied frontPage without re-ranking.
    expect(src).not.toContain('rankTopStoriesByRecency');
    expect(src).not.toContain('topStoriesRecency');
    expect(src).not.toContain('composeBalancedFeed');
    expect(src).toContain('slice(0, 25)');
  });
});

describe('Main ViewModel internals', () => {
  beforeEach(() => {
    readState.readIds.clear();
    readState.viewCounts.clear();
  });

  it('defines custom top-story constants', () => {
    expect(MIN_CUSTOM_TOP_STORIES).toBe(10);
    expect(MAX_VIEW_COUNT_FOR_CUSTOM_TOP_STORIES).toBe(3);
  });

  it('normalizes arrays and records', () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray([1])).toEqual([1]);
    expect(asRecord(null)).toEqual({});
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
  });

  it('preserves the supplied frontPage order when custom sort is disabled (NW-RANK-001)', () => {
    const now = Date.now();
    // Deliberately "wrong" recency order: the ranker upstream owns ordering,
    // so the view model must not re-rank by timestamp or impact.
    const stories = [
      { id: 'old', impactScore: 100, publishedAt: now - 30 * 60 * 60 * 1000 },
      { id: 'fresh', impactScore: 1, publishedAt: now - 60 * 60 * 1000 },
      { id: 'undated', impactScore: 50 },
    ];

    const result = filterLatestStories(stories, false);

    expect(result).not.toBe(stories);
    expect(result.map(story => story.id)).toEqual(['old', 'fresh', 'undated']);
  });

  it('caps Top Stories to 25 while preserving supplied order', () => {
    const stories = Array.from({ length: 30 }).map((_, index) => ({ id: `story-${index}` }));

    const result = filterLatestStories(stories, false);

    expect(result).toHaveLength(25);
    expect(result.map(story => story.id)).toEqual(stories.slice(0, 25).map(story => story.id));
  });

  it('keeps supplied order under custom sort when nothing is read or heavily viewed', () => {
    const now = Date.now();
    const stories = Array.from({ length: 12 }).map((_, index) => ({
      id: `story-${index}`,
      impactScore: index,
      publishedAt: now - index * 60 * 1000,
    }));

    const result = filterLatestStories(stories, true);

    expect(result).toHaveLength(12);
    expect(result.map(story => story.id)).toEqual(stories.map(story => story.id));
  });

  it('custom sort only demotes read/heavily viewed stories without recency re-ranking', () => {
    const stories = Array.from({ length: 12 }).map((_, index) => ({ id: `story-${index}` }));
    readState.readIds.add('story-2');
    readState.viewCounts.set('story-5', MAX_VIEW_COUNT_FOR_CUSTOM_TOP_STORIES + 1);

    const result = filterLatestStories(stories, true);

    const expected = stories
      .map(story => story.id)
      .filter(id => id !== 'story-2' && id !== 'story-5');
    expect(result.map(story => story.id)).toEqual(expected);
  });

  it('custom sort backfills demoted stories in supplied order to keep the minimum of 10', () => {
    const stories = Array.from({ length: 12 }).map((_, index) => ({ id: `story-${index}` }));
    ['story-0', 'story-1', 'story-2', 'story-3', 'story-4'].forEach(id => readState.readIds.add(id));

    const result = filterLatestStories(stories, true);

    expect(result).toHaveLength(MIN_CUSTOM_TOP_STORIES);
    expect(result.map(story => story.id)).toEqual([
      'story-5', 'story-6', 'story-7', 'story-8', 'story-9', 'story-10', 'story-11',
      'story-0', 'story-1', 'story-2',
    ]);
  });

  it('builds navigation sections from enabled settings', () => {
    const result = getNavSections({
      india: { enabled: true },
      chennai: { enabled: false },
      local: { enabled: true },
    });

    expect(result.map(item => item.id)).toEqual([
      'top-stories',
      'india-news',
      'local-news',
      'world-news',
    ]);
  });

  it('prefers dataset newsData shape when available', () => {
    const result = getProjectedMainData({
      envelope: {
        data: {
          newsData: {
            frontPage: [{ title: 'Dataset newsData' }],
          },
          weatherData: {
            chennai: { temp: 30 },
          },
          breakingNews: [{ title: 'Breaking dataset' }],
        },
      },
      newsData: {
        frontPage: [{ title: 'Context' }],
      },
      weatherData: {
        chennai: { temp: 20 },
      },
      breakingNews: [{ title: 'Breaking context' }],
    });

    expect(result.newsData.frontPage[0].title).toBe('Dataset newsData');
    expect(result.weatherData.chennai.temp).toBe(30);
    expect(result.breakingNews[0].title).toBe('Breaking dataset');
  });

  it('accepts mainDataset frontPage/sections shape', () => {
    const result = getProjectedMainData({
      envelope: {
        data: {
          frontPage: [{ title: 'Dataset frontPage' }],
          sections: {
            world: [{ title: 'World dataset' }],
            india: [{ title: 'India dataset' }],
          },
          quickWeather: {
            chennai: { temp: 31 },
          },
        },
      },
      newsData: {
        frontPage: [{ title: 'Context frontPage' }],
        world: [{ title: 'World context' }],
        india: [{ title: 'India context' }],
        chennai: [{ title: 'Chennai context' }],
        local: [{ title: 'Local context' }],
      },
      weatherData: {
        chennai: { temp: 20 },
      },
      breakingNews: [],
    });

    expect(result.newsData.frontPage[0].title).toBe('Dataset frontPage');
    expect(result.newsData.world[0].title).toBe('World dataset');
    expect(result.newsData.india[0].title).toBe('India dataset');
    expect(result.newsData.chennai[0].title).toBe('Chennai context');
    expect(result.weatherData.chennai.temp).toBe(31);
  });

  it('falls back to raw news data when present', () => {
    const result = getProjectedMainData({
      envelope: {
        data: {
          raw: {
            newsData: {
              frontPage: [{ title: 'Raw news' }],
            },
          },
        },
      },
      newsData: {
        frontPage: [{ title: 'Context' }],
      },
      weatherData: null,
      breakingNews: [],
    });

    expect(result.newsData.frontPage[0].title).toBe('Raw news');
  });

  it('falls back to context data when dataset is empty', () => {
    const result = getProjectedMainData({
      envelope: {
        data: {},
      },
      newsData: {
        frontPage: [{ title: 'Context' }],
      },
      weatherData: {
        chennai: { temp: 20 },
      },
      breakingNews: [{ title: 'Breaking context' }],
    });

    expect(result.newsData.frontPage[0].title).toBe('Context');
    expect(result.weatherData.chennai.temp).toBe(20);
    expect(result.breakingNews[0].title).toBe('Breaking context');
  });

  it('uses topline breakingNews fallback', () => {
    const result = getProjectedMainData({
      envelope: {
        data: {
          topline: {
            breakingNews: [{ title: 'Topline breaking' }],
          },
        },
      },
      newsData: {},
      weatherData: null,
      breakingNews: [{ title: 'Context breaking' }],
    });

    expect(result.breakingNews[0].title).toBe('Topline breaking');
  });

  it('builds a renderable boundary envelope', () => {
    const result = makeMainBoundaryEnvelope({
      envelope: null,
      newsData: {
        frontPage: [{ title: 'A' }],
      },
      weatherData: null,
      breakingNews: [],
      isLoading: false,
      error: null,
    });

    expect(result.ok).toBe(true);
    expect(result.datasetId).toBe('main');
    expect(result.data.projectedHasRenderableMain).toBe(true);
  });

  it('does not mark loading-only empty fallback envelope as ok', () => {
    const result = makeMainBoundaryEnvelope({
      envelope: null,
      newsData: {},
      weatherData: null,
      breakingNews: [],
      isLoading: true,
      error: null,
    });

    expect(result.ok).toBe(false);
    expect(result.validation.passed).toBe(false);
    expect(result.validation.warnings).toContain('main_loading_without_renderable_projection');
  });

  it('does not mark loading-only empty existing envelope as ok', () => {
    const result = makeMainBoundaryEnvelope({
      envelope: {
        ok: true,
        datasetId: 'main',
        data: {},
        validation: {
          passed: true,
          errors: [],
          warnings: [],
        },
      },
      newsData: {},
      weatherData: null,
      breakingNews: [],
      isLoading: true,
      error: null,
    });

    expect(result.ok).toBe(false);
    expect(result.validation.passed).toBe(false);
    expect(result.validation.warnings).toContain('main_loading_without_renderable_projection');
  });

  it('returns degraded success when one refresh branch fails and one succeeds', () => {
    const result = getRefreshOutcome([
      {
        status: 'fulfilled',
        value: { ok: false, error: 'Dataset degraded' },
      },
      {
        status: 'fulfilled',
        value: { ok: true },
      },
      {
        status: 'fulfilled',
        value: undefined,
      },
    ]);

    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
  });

  it('detects rejected refresh outcome when no branch succeeds', () => {
    const result = getRefreshOutcome([
      {
        status: 'rejected',
        reason: new Error('Network failed'),
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Network failed');
  });

  it('accepts all-fulfilled refresh outcome', () => {
    const result = getRefreshOutcome([
      {
        status: 'fulfilled',
        value: undefined,
      },
      {
        status: 'fulfilled',
        value: { ok: true },
      },
    ]);

    expect(result.ok).toBe(true);
  });

  it('normalizes news errors', () => {
    expect(getFirstNewsError(['A'])).toBe('A');
    expect(getFirstNewsError('B')).toBe('B');
    expect(getFirstNewsError({ message: 'C' })).toBe('C');
    expect(getFirstNewsError(null)).toBe(null);
  });

  it('always includes world in nav sections', () => {
    const result = getNavSections({
      india: { enabled: true },
      chennai: { enabled: false },
      local: { enabled: true },
    });

    expect(result.map(item => item.id)).toEqual([
      'top-stories',
      'india-news',
      'local-news',
      'world-news',
    ]);
  });

  it('emits main_no_renderable_data warning when data absent and not loading', () => {
    const result = makeMainBoundaryEnvelope({
      envelope: null,
      newsData: {},
      weatherData: null,
      breakingNews: [],
      isLoading: false,
      error: null,
    });

    expect(result.ok).toBe(false);
    expect(result.validation.warnings).toContain('main_no_renderable_data');
    expect(result.validation.warnings).not.toContain('main_loading_without_renderable_projection');
  });
});

