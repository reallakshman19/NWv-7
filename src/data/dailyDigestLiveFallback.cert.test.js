import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSectionsSnapshot } from '../adapters/sectionsSnapshotFetcher.js';
import {
  buildLiveDigestCandidatePool,
  loadDailyDigestLiveFallback,
  loadDailyDigestPublishedFallback,
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
    expect(result.cards[0]).toMatchObject({publishedAt:NOW-H,snippet:'india-pub-0 summary'});
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
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('recovers a current publication whose body takes longer than the old two-second budget', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    vi.stubGlobal('window', { location: new URL('http://127.0.0.1:4173/') });
    loadSectionsSnapshot.mockRejectedValueOnce(new Error('snapshot-budget-exceeded'));
    vi.stubGlobal('fetch', vi.fn(async (_url, { signal }) => ({
      ok: true,
      json: async () => {
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (signal.aborted) throw new DOMException('Timed out', 'AbortError');
        return fresh;
      },
    })));
    const pending = loadDailyDigestLiveFallback({ nowMs: NOW });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toMatchObject({ status: 'READY', cards: expect.any(Array) });
    expect((await pending).cards).toHaveLength(3);
  });

  it('stops recovery after eight seconds when the publication cannot be reached', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    vi.stubGlobal('window', { location: new URL('http://127.0.0.1:4173/') });
    loadSectionsSnapshot.mockRejectedValueOnce(new Error('snapshot-budget-exceeded'));
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
    })));
    let settled = false;
    const pending = loadDailyDigestLiveFallback({ nowMs: NOW }).then(result => { settled = true; return result; });
    await vi.advanceTimersByTimeAsync(7999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ status: 'UNAVAILABLE', cards: [] });
  });

  it.each([
    { scenario: 'stale authority', authority: stale, canonical: fresh, ready: true, requests: 1 },
    { scenario: 'unreachable authority', authorityError: 'network error', canonical: fresh, ready: true, requests: 1 },
    { scenario: 'stale canonical snapshot', authority: stale, canonical: stale, ready: false, requests: 1 },
    { scenario: 'fresh authority', authority: fresh, canonical: fresh, ready: true, requests: 0 },
    { scenario: 'another repo', pathname: '/different-app/', authority: stale, canonical: fresh, ready: false, requests: 0 },
    { scenario: 'another Pages host', origin: 'https://example.github.io', authority: stale, canonical: fresh, ready: false, requests: 0 },
    { scenario: 'localhost stale authority', pathname:'/', origin:'http://127.0.0.1:4173', authority:stale, canonical:fresh, ready:true, requests:1 },
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

describe('Daily Digest published-only recovery',()=>{
  afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();});
  const snapshot={schemaVersion:2,fetchedAt:NOW,sections:{world:['one','two','three'].map(id=>story(id,1,id,'world'))}};
  it.each([false,true])('uses local or canonical current publication (old bundle %s), without requesting the Worker',async oldBundle=>{
    vi.spyOn(Date,'now').mockReturnValue(NOW);vi.stubGlobal('window',{location:new URL('http://127.0.0.1:4173/')});
    loadSectionsSnapshot.mockClear();
    const fetchImpl=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>oldBundle?{...snapshot,fetchedAt:NOW-13*H}:snapshot})
      .mockResolvedValueOnce({ok:true,json:async()=>snapshot});
    const result=await loadDailyDigestPublishedFallback({nowMs:NOW,fetchImpl});
    expect(result).toMatchObject({status:'READY',deliveryMode:'SNAPSHOT',generatedAt:NOW});
    expect(result.cards).toHaveLength(3);expect(result.cards.every(row=>row.deliveryMode==='SNAPSHOT')).toBe(true);
    expect(loadSectionsSnapshot).not.toHaveBeenCalled();expect(fetchImpl).toHaveBeenCalledTimes(oldBundle?2:1);
    if(oldBundle)expect(result.summary.dataSource.effective).toBe('github_main');
    expect(result.cards[0].publishedAt).toBe(NOW-H);
  });
  it('rejects stale publications and future or acquisition-only story clocks without changing their ages',async()=>{
    vi.spyOn(Date,'now').mockReturnValue(NOW);vi.stubGlobal('window',{location:new URL('http://localhost:4173/')});
    const fetchImpl=vi.fn().mockResolvedValue({ok:true,json:async()=>({...snapshot,fetchedAt:NOW-13*H})});
    expect((await loadDailyDigestPublishedFallback({nowMs:NOW,fetchImpl})).status).toBe('UNAVAILABLE');
    expect(selectLiveDigestCards({...snapshot,sections:{world:snapshot.sections.world.map((row,index)=>({...row,publishedAt:NOW+H*(index+1)}))}},{nowMs:NOW}).cards).toEqual([]);
    expect(selectLiveDigestCards({...snapshot,sections:{world:snapshot.sections.world.map(row=>({...row,publishedAtSource:'fetch_time_fallback'}))}},{nowMs:NOW}).cards).toEqual([]);
  });
});
