import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSectionsSnapshot } from '../adapters/sectionsSnapshotFetcher.js';
import {
  buildLiveDigestCandidatePool,
  loadDailyDigestLiveFallback,
  selectLiveDigestCards,
} from './dailyDigestLiveFallback.js';

vi.mock('../adapters/sectionsSnapshotFetcher.js', async importOriginal => ({
  ...await importOriginal(),
  loadSectionsSnapshot: vi.fn(),
}));

const H = 60 * 60 * 1000;
const NOW = Date.parse('2026-10-18T12:00:00Z');

function story(id, ageHours, sourceGroup, section, impactScore = 0.5) {
  return {
    id,
    title: `${id} title`,
    summary: `${id} summary`,
    source: sourceGroup,
    sourceGroup,
    url: `https://example.com/${id}`,
    publishedAt: NOW - ageHours * H,
    impactScore,
    section,
  };
}

describe('Daily Digest Live fallback selector', () => {
  it('admits only fresh valid stories and dedupes cross-section repeats by URL', () => {
    const shared = story('shared', 2, 'wire-a', 'topStories');

    const snapshot = {
      schemaVersion: 2,
      fetchedAt: NOW,
      sections: {
        topStories: [
          shared,
          story('old', 14, 'wire-b', 'topStories'),
        ],
        india: [
          { ...shared, id: 'shared-india', section: 'india' },
          story('india', 3, 'publisher-b', 'india'),
        ],
        world: [
          story('world', 4, 'publisher-c', 'world'),
        ],
      },
    };

    const pool = buildLiveDigestCandidatePool(snapshot, { nowMs: NOW });
    const ids = pool.map(item => item.canonicalId);

    expect(ids).toContain('shared');
    expect(ids).toContain('india');
    expect(ids).toContain('world');
    expect(ids).not.toContain('old');
    expect(pool.filter(item => item.canonicalUrl.includes('/shared'))).toHaveLength(1);
  });

  it('keeps ten distinct stories for each of at least three complete sources', () => {
    const sourceStories = (source, section) => Array.from({ length: 12 }, (_, index) =>
      story(`${source}-${index}`, 1 + index / 5, source, section, 1 - index / 20));
    const snapshot = {
      schemaVersion: 2,
      fetchedAt: NOW,
      sections: {
        india: sourceStories('india-pub', 'india'),
        world: sourceStories('world-pub', 'world'),
        business: sourceStories('biz-pub', 'business'),
        technology: [story('tech-a', 2.6, 'tech-pub', 'technology', 0.74)],
      },
    };

    const result = selectLiveDigestCards(snapshot, { nowMs: NOW });

    expect(result.cards).toHaveLength(30);
    expect(result.sourceGroupCount).toBe(3);
    expect(new Set(result.cards.map(card => card.canonicalUrl)).size).toBe(30);
    expect(result.cards[0].deliveryMode).toBe('LIVE');
    for (const source of ['india-pub', 'world-pub', 'biz-pub']) {
      expect(result.cards.filter(card => card.sourceGroup === source)).toHaveLength(10);
    }
  });

  it('returns the real stories from three sources when some sources have fewer than ten', () => {
    const snapshot = { fetchedAt: NOW, sections: { world: [
      story('one', 1, 'first', 'world'),
      story('two', 2, 'second', 'world'),
      story('three', 3, 'third', 'world'),
    ] } };

    const result = selectLiveDigestCards(snapshot, { nowMs: NOW });
    expect(result.sourceGroupCount).toBe(3);
    expect(result.cards.map(card => card.canonicalId)).toEqual(['one', 'two', 'three']);
  });

  it('refuses to fabricate a digest from an insufficient or single-source pool', () => {
    const insufficient = selectLiveDigestCards({
      fetchedAt: NOW,
      sections: {
        topStories: [
          story('one', 1, 'only-source', 'topStories'),
          story('two', 2, 'only-source', 'topStories'),
        ],
      },
    }, { nowMs: NOW });

    expect(insufficient.cards).toEqual([]);
    expect(insufficient.reason).toBe('live_digest_insufficient_cards');

    const singleSource = selectLiveDigestCards({
      fetchedAt: NOW,
      sections: {
        topStories: [
          story('one', 1, 'only-source', 'topStories'),
          story('two', 2, 'only-source', 'topStories'),
          story('three', 3, 'only-source', 'topStories'),
          story('four', 4, 'only-source', 'topStories'),
        ],
      },
    }, { nowMs: NOW });

    expect(singleSource.cards).toEqual([]);
    expect(singleSource.reason).toBe('live_digest_insufficient_source_diversity');
  });
});

describe('Daily Digest on the official Pages deployment', () => {
  const fresh = {
    schemaVersion: 2,
    fetchedAt: NOW,
    sections: {
      world: ['first', 'second', 'third'].map(id => story(id, 1, id, 'world')),
    },
  };
  const stale = { ...fresh, fetchedAt: NOW - 13 * H };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    { scenario: 'stale authority', authority: stale, canonical: fresh, ready: true, requests: 1 },
    { scenario: 'unreachable authority', authorityError: 'network error', canonical: fresh, ready: true, requests: 1 },
    { scenario: 'stale canonical snapshot', authority: stale, canonical: stale, ready: false, requests: 1 },
    { scenario: 'fresh authority', authority: fresh, canonical: fresh, ready: true, requests: 0 },
    { scenario: 'another repo', pathname: '/different-app/', authority: stale, canonical: fresh, ready: false, requests: 0 },
    { scenario: 'another Pages host', origin: 'https://example.github.io', authority: stale, canonical: fresh, ready: false, requests: 0 },
  ])('checks the canonical snapshot only when eligible for $scenario', async ({
    pathname = '/NWv-7/', origin = 'https://reallakshman19.github.io',
    authority, authorityError, canonical, ready, requests,
  }) => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    vi.stubGlobal('window', { location: new URL(pathname, origin) });
    const fetchCanonical = vi.fn(async () => ({ ok: true, json: async () => canonical }));
    vi.stubGlobal('fetch', fetchCanonical);
    if (authorityError) loadSectionsSnapshot.mockRejectedValueOnce(new Error(authorityError));
    else loadSectionsSnapshot.mockResolvedValueOnce(authority);

    const result = await loadDailyDigestLiveFallback({ nowMs: NOW });

    expect(result.status).toBe(ready ? 'READY' : 'UNAVAILABLE');
    expect(result.cards).toHaveLength(ready ? 3 : 0);
    expect(fetchCanonical).toHaveBeenCalledTimes(requests);
    if (ready && requests) {
      expect(fetchCanonical).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/reallakshman19/NWv-7/main/public/newsdata/sections_latest.json',
        expect.objectContaining({ cache: 'no-store', redirect: 'error', signal: expect.any(AbortSignal) }),
      );
      expect(result.summary.dataSource).toMatchObject({
        effective: 'github_main',
        fallback: true,
        fallbackReason: authorityError || 'sections_snapshot_stale',
      });
    }
  });
});
