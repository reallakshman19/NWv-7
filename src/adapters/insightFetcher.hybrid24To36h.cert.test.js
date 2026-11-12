import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateSlot } from '../insight/src/cache/cacheManager.ts';
import { createInsightFetcher, DEFAULT_CONFIG, runInsightPipeline } from './insightFetcher.js';
import { loadInsightSnapshot } from './insightSnapshotFetcher.js';
import { fetchStoriesForSlot } from './newsFetcher.js';
import { loadSectionsSnapshot } from './sectionsSnapshotFetcher.js';
import sectionsSnapshot from './fixtures/insightSections24To36h.json';

vi.mock('./insightSnapshotFetcher.js', async importOriginal => ({
  ...await importOriginal(),
  loadInsightSnapshot: vi.fn(),
}));

vi.mock('./newsFetcher.js', () => ({ fetchStoriesForSlot: vi.fn() }));

vi.mock('./sectionsSnapshotFetcher.js', async importOriginal => ({
  ...await importOriginal(),
  loadSectionsSnapshot: vi.fn(),
}));

const HOUR_MS = 60 * 60 * 1000;
const SLOTS = ['now', 'minus4h', 'minus12h', 'minus24h'];

describe('Insight Hybrid fallback with 24–36h Sections stories', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.stubEnv('VITE_BACKEND_URL', '');
    vi.stubGlobal('localStorage', {
      getItem: key => key === 'nw_fetch_mode' ? 'hybrid' : null,
    });
    SLOTS.forEach(invalidateSlot);

    const expiredSnapshot = {
      schemaVersion: 2,
      fetchedAt: Date.now() - 72 * HOUR_MS,
      contentHash: 'expired-insight',
      stories: [],
    };
    loadInsightSnapshot.mockImplementation(async ({ allowStale }) => (
      allowStale ? expiredSnapshot : null
    ));
    loadSectionsSnapshot.mockResolvedValue(sectionsSnapshot);
    fetchStoriesForSlot.mockRejectedValue(new Error('RSS unavailable'));
  });

  afterEach(() => {
    SLOTS.forEach(invalidateSlot);
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(['localhost', 'example.github.io'])(
    'renders the older slot from fresh Sections on %s when Insight has expired',
    async hostname => {
      vi.stubGlobal('window', { location: { hostname, search: '' } });

      const acquisition = await createInsightFetcher();
      const result = await runInsightPipeline(acquisition.fetcher, {
        ...DEFAULT_CONFIG,
        ...acquisition.pipelineConfigOverrides,
      });

      expect(acquisition).toMatchObject({
        source: 'snapshot',
        snapshotTs: sectionsSnapshot.fetchedAt,
        sectionsRuntimeSummary: {
          schemaVersion: 2,
          stale: false,
          totalStories: 7,
        },
      });
      expect(loadSectionsSnapshot).toHaveBeenCalledOnce();
      expect(fetchStoriesForSlot).not.toHaveBeenCalled();

      const olderStories = await acquisition.fetcher('minus24h');
      expect(olderStories.map(({ id }) => id)).toEqual([
        'metro-service-schedule',
        'metro-accessibility',
        'metro-commuter-reaction',
        'metro-funding',
        'metro-tender',
        'metro-construction',
      ]);
      const metro = result.parents.find(parent => /metro/i.test(parent.canonicalHeadline));
      expect(metro?.snapshotPresence).toMatchObject({
        now: false, minus4h: false, minus12h: false, minus24h: true,
      });
    },
  );
});
