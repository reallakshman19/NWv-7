import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './sectionsDataset.js';
import { fetchSectionNews } from '../../services/rssAggregator.js';
import { loadSectionsSnapshot } from '../../adapters/sectionsSnapshotFetcher.js';
import { rankTopStories } from '../../services/topStories/topStoriesRanker.js';

const testSettings = vi.hoisted(() => ({ value: {} }));
vi.mock('../../services/rssAggregator.js', async importOriginal => ({ ...await importOriginal(), fetchSectionNews: vi.fn() }));
vi.mock('../../utils/storage.js', async importOriginal => ({ ...await importOriginal(), getSettings: () => testSettings.value }));
vi.mock('../../adapters/sectionsSnapshotFetcher.js', async importOriginal => ({
  ...await importOriginal(),
  loadSectionsSnapshot: vi.fn(),
}));
vi.mock('../../services/topStories/topStoriesRanker.js', () => ({ rankTopStories: vi.fn(() => []) }));

const NOW = Date.parse('2026-11-14T17:01:00Z');
const story = (id, title) => ({
  id, title, url: `https://www.bbc.com/news/${id}`, source: 'BBC',
  publishedAt: NOW - 60 * 60 * 1000, timestampConfidence: 'high',
});
let snapshot;
let displayed;

describe('Sections Top Stories candidate pool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    testSettings.value = { sections: { world: { count: 1 } } };
    displayed = [story('widget', 'Local arts programme opens')];
    displayed.prefetched = true;
    displayed.snapshotRuntimeSummary = { contentHash: 'same-epoch', stale: false };
    snapshot = {
      schemaVersion: 1, contentHash: 'same-epoch', fetchedAt: NOW - 60_000,
      sections: {
        world: [displayed[0], story('beyond-widget', 'Global emergency response begins')],
        topStories: [story('top-feed', 'Peace agreement signed after national talks')],
      },
    };
    fetchSectionNews.mockResolvedValue(displayed);
    loadSectionsSnapshot.mockImplementation(async () => snapshot);
  });

  afterEach(() => vi.useRealTimers());

  async function loadPool() {
    const envelope = await load({ sections: ['world'] });
    return { envelope, input: rankTopStories.mock.calls[0][0] };
  }

  it('ranks the complete fresh epoch and dedicated top feed without expanding widgets', async () => {
    const { envelope, input } = await loadPool();
    expect(envelope.data.sections.world.map(item => item.id)).toEqual(['widget']);
    expect(input.sectionItems.__all.map(item => item.id)).toEqual(expect.arrayContaining(['beyond-widget', 'top-feed']));
    expect(input.topFeedItems).toEqual([expect.objectContaining({ id: 'top-feed', topFeedPresent: true })]);
    expect(loadSectionsSnapshot).toHaveBeenCalledWith();
  });

  it('does not expand from a stale epoch', async () => {
    snapshot.fetchedAt = NOW - 13 * 60 * 60 * 1000;
    const { input } = await loadPool();
    expect(input.sectionItems.__all.map(item => item.id)).toEqual(['widget']);
    expect(input.topFeedItems).toEqual([]);
  });

  it('does not reintroduce a clustered story through its top-feed identity', async () => {
    snapshot.sections.topStories = [story('duplicate-top-feed', displayed[0].title)];
    const { input } = await loadPool();
    const candidates = [...Object.values(input.sectionItems).flat(), ...input.topFeedItems];
    expect(candidates.filter(item => item.title === displayed[0].title)).toHaveLength(1);
  });

  it('does not let an expired high-scoring widget suppress a fresh update', async () => {
    displayed[0] = { ...story('old-widget', 'Cyclone warning: Tamil Nadu braces for heavy rain'), publishedAt: NOW - 14 * 3_600_000, impactScore: 20 };
    snapshot.sections.world = [story('fresh-update', 'Cyclone warning: Tamil Nadu braces for heavy rain as storm intensifies')];
    const { input } = await loadPool();
    expect(input.sectionItems.__all.some(item => item.id === 'fresh-update')).toBe(true);
    expect(input.sectionItems.__all.some(item => item.id === 'old-widget')).toBe(false);
  });

  it('does not mix a different snapshot epoch into the displayed authority', async () => {
    snapshot.contentHash = 'different-epoch';
    const { input } = await loadPool();
    expect(input.sectionItems.__all.map(item => item.id)).toEqual(['widget']);
  });

  it('does not acquire a snapshot in the browser live RSS path', async () => {
    displayed.prefetched = false;
    await loadPool();
    expect(loadSectionsSnapshot).not.toHaveBeenCalled();
  });

  it('applies blocked keywords to the expanded pool', async () => {
    testSettings.value.feedBlockedKeywords = ['emergency'];
    const { input } = await loadPool();
    expect(input.sectionItems.__all.some(item => item.id === 'beyond-widget')).toBe(false);
  });

  it('applies publisher choices to the expanded pool', async () => {
    testSettings.value.newsSources = { bbc: false };
    const { input } = await loadPool();
    expect(input.sectionItems.__all.map(item => item.id)).toEqual(['widget']);
    expect(input.topFeedItems).toEqual([]);
  });

  it('applies strict keyword mode to the expanded pool', async () => {
    testSettings.value.filteringMode = 'keyword';
    const { input } = await loadPool();
    expect(input.sectionItems.__all.map(item => item.id)).toEqual(['widget']);
    expect(input.topFeedItems).toEqual([]);
  });

  it('applies top-website mode to the expanded pool', async () => {
    testSettings.value.topWebsitesOnly = true;
    snapshot.sections.topStories[0].source = 'Unlisted Bulletin';
    const { input } = await loadPool();
    expect(input.sectionItems.__all.some(item => item.id === 'top-feed')).toBe(false);
    expect(input.topFeedItems).toEqual([]);
  });

  it('applies the user age cutoff before Top Stories admission', async () => {
    testSettings.value.hideOlderThanHours = 0.5;
    const { input } = await loadPool();
    expect(input.sectionItems.__all.map(item => item.id)).toEqual(['widget']);
    expect(input.topFeedItems).toEqual([]);
  });

  it('keeps the top-feed twelve-hour timestamp guard', async () => {
    snapshot.sections.topStories[0].publishedAt = NOW - 13 * 60 * 60 * 1000;
    const { input } = await loadPool();
    // The selector can provide regional stale fallback; admission remains owned
    // by the ranker. Stale publisher-top rows must never become top-feed evidence.
    expect(input.topFeedItems).toEqual([]);
  });
});
