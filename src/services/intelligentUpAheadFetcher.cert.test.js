import { describe, expect, it, vi } from 'vitest';
import { __intelligentUpAheadFetcherInternalsForTest, fetchIntelligentUpAheadData } from './intelligentUpAheadFetcher.js';
import { proxyManager } from './proxyManager.js';

vi.mock('./proxyManager.js', () => ({ proxyManager: { fetchViaProxy: vi.fn() } }));
vi.mock('../intelligence/feedSourceRegistry.js', () => ({
  buildFeedFetchPlan: () => [{ category: 'events', sources: [{ category: 'events', url: 'https://events.example/rss' }] }],
}));

const { makeAcquisitionSummary } = __intelligentUpAheadFetcherInternalsForTest;

describe('Up Ahead acquisition diagnostics', () => {
  it('tracks attempted source coverage per category before fetching', () => {
    const summary = makeAcquisitionSummary([
      {
        category: 'shopping',
        sources: [
          { category: 'shopping', url: 'https://example.com/a' },
          { category: 'shopping', url: 'https://example.com/b' },
        ],
      },
      {
        category: 'airlines',
        sources: [
          { category: 'airlines', url: 'https://example.com/c' },
        ],
      },
    ]);

    expect(summary.status).toBe('running');
    expect(summary.attemptedSources).toBe(3);
    expect(summary.byCategory.shopping.attemptedSources).toBe(2);
    expect(summary.byCategory.airlines.attemptedSources).toBe(1);
  });

  it('reports no-sources when a category plan has no providers', () => {
    const summary = makeAcquisitionSummary([
      { category: 'shopping', sources: [] },
    ]);

    expect(summary.status).toBe('no-sources');
    expect(summary.attemptedSources).toBe(0);
  });

  it('considers the full seven-day window and processes repeated entries so revisions can merge', async () => {
    const asOfDate = new Date();
    const day = 86_400_000;
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    });
    proxyManager.fetchViaProxy.mockResolvedValue({
      items: [6 * day, 7 * day, 7 * day + 1].map(age => ({
        guid: String(age),
        link: `https://events.example/${age}`,
        title: `Community workshop ${age}`,
        pubDate: new Date(asOfDate.getTime() - age).toISOString(),
      })),
    });
    try {
      const first = await fetchIntelligentUpAheadData({ asOfDate });
      const second = await fetchIntelligentUpAheadData({ asOfDate });
      expect(first.rawCount).toBe(2);
      expect(first.acquisitionSummary.unseenItems).toBe(2);
      expect(second.rawCount).toBe(2);
      expect(second.acquisitionSummary.unseenItems).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
