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
const { evaluateTopStories } = await vi.importActual('../../services/topStories/topStoriesRanker.js');
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
    displayed.snapshotRuntimeSummary = { contentHash: 'same-epoch', stale: false, fetchedAt: NOW - 60_000, dataSource: { effective: 'github_static' } };
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
    expect(input.topFeedEvidence).toEqual([expect.objectContaining({ id: 'top-feed' })]);
    expect(loadSectionsSnapshot).toHaveBeenCalledWith();
  });

  it('does not expand from a stale epoch', async () => {
    snapshot.fetchedAt = NOW - 13 * 60 * 60 * 1000;
    const { input } = await loadPool();
    expect(input.sectionItems.__all.map(item => item.id)).toEqual(['widget']);
    expect(input.topFeedEvidence).toEqual([]);
  });

  it('does not reintroduce a clustered story through its top-feed identity', async () => {
    snapshot.sections.topStories = [story('duplicate-top-feed', displayed[0].title)];
    const { input } = await loadPool();
    const result = evaluateTopStories(input);
    const matches = result.scoredCandidates.filter(item => item.title === displayed[0].title);
    expect(matches).toHaveLength(1);
    expect(matches[0]._topStoryRank.topFeedPresent).toBe(true);
    expect(matches[0]._topStoryRank.independentEvidenceCount).toBe(0);
  });

  it('retains two dated events that happen to have the same headline', async () => {
    displayed[0].eventDate = '2026-11-14';
    snapshot.sections.topStories = [
      { ...story('other-event', displayed[0].title), eventDate: '2026-11-15' },
    ];
    const { input } = await loadPool();
    const matches = evaluateTopStories(input).scoredCandidates.filter(item => item.title === displayed[0].title);
    expect(matches.map(item => item.eventDate).sort()).toEqual(['2026-11-14', '2026-11-15']);
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

  it('isolates foreign or unproven snapshot lanes even when they precede the valid lane', async () => {
    fetchSectionNews.mockImplementation(async section => {
      if (section === 'world') return displayed;
      const rows = [story(section, 'Headline for ' + section)];
      rows.prefetched = true;
      rows.snapshotRuntimeSummary = section === 'local' ? {
        contentHash: 'same-epoch', stale: false, fetchedAt: NOW - 120_000, dataSource: { effective: 'cloudflare_preview' },
      } : null;
      return rows;
    });
    const envelope = await load({ sections: ['local', 'business', 'world'] });
    const ids = rankTopStories.mock.calls[0][0].sectionItems.__all.map(item => item.id);
    expect(ids).toEqual(expect.arrayContaining(['widget', 'beyond-widget']));
    expect(ids).not.toEqual(expect.arrayContaining(['local']));
    expect(ids).not.toEqual(expect.arrayContaining(['business']));
    expect(envelope.diagnostics).toContainEqual(expect.objectContaining({
      event: 'sectionsDataset.top_stories_snapshot_lane_excluded',
    }));
    expect(envelope.freshness).toBe('stale');
    expect(envelope.data.authority.effective).toBe('unknown');
  });

  it('does not mix separate acquisitions just because their content hashes match', async () => {
    snapshot.fetchedAt -= 30_000;
    const { input } = await loadPool();
    expect(input.sectionItems.__all.map(row => row.id)).toEqual(['widget']);
  });

  it('keeps the Live ranking pool when the widget count changes', async () => {
    fetchSectionNews.mockImplementation(async (_section, limit) =>
      Array.from({ length: limit }, (_, i) => story('story-' + i,
        i === 29 ? 'President signs emergency ceasefire treaty' : 'Independent report number ' + i)));
    testSettings.value.sections = { world: { count: 1 } };
    const first = await load({ sections: ['world'] });
    testSettings.value.sections.world.count = 12;
    const second = await load({ sections: ['world'] });
    expect(first.data.sections.world).toHaveLength(6);
    expect(second.data.sections.world).toHaveLength(17);
    const rankedIds = rankTopStories.mock.calls.map(([input]) => input.sectionItems.__all.map(item => item.id));
    expect(rankedIds[0]).toEqual(rankedIds[1]);
    expect(rankedIds[0]).toContain('story-29');
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
    expect(input.sectionItems.__all).toEqual([]);
    expect(input.topFeedEvidence).toEqual([]);
  });

  it('applies strict keyword mode to the expanded pool', async () => {
    testSettings.value.filteringMode = 'keyword';
    const { input } = await loadPool();
    expect(input.sectionItems.__all).toEqual([]);
    expect(input.topFeedEvidence).toEqual([]);
  });

  it('applies top-website mode to the expanded pool', async () => {
    testSettings.value.topWebsitesOnly = true;
    snapshot.sections.topStories[0].source = 'Unlisted Bulletin';
    const { input } = await loadPool();
    expect(input.sectionItems.__all.some(item => item.id === 'top-feed')).toBe(false);
    expect(input.topFeedEvidence).toEqual([]);
  });

  it('applies the user age cutoff before Top Stories admission', async () => {
    testSettings.value.hideOlderThanHours = 0.5;
    const { input } = await loadPool();
    expect(input.sectionItems.__all).toEqual([]);
    expect(input.topFeedEvidence).toEqual([]);
  });

  it('keeps the top-feed twelve-hour timestamp guard', async () => {
    snapshot.sections.topStories[0].publishedAt = NOW - 13 * 60 * 60 * 1000;
    const { input } = await loadPool();
    // The selector can provide regional stale fallback; admission remains owned
    // by the ranker. Stale publisher-top rows must never become top-feed evidence.
    expect(input.topFeedEvidence).toEqual([]);
  });
});
