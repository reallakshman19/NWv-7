import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { readSnapshot, settings } = vi.hoisted(() => ({
    readSnapshot: vi.fn(),
    settings: { enableNewScoring: true, rankingMode: 'smart', enableCache: true, usePrefetchedSections: true },
}));
vi.mock('../adapters/sectionsSnapshotFetcher.js', async importOriginal => ({
    ...await importOriginal(),
    fetchPrefetchedSectionNews: readSnapshot,
}));
vi.mock('./sectionsAuthorityRouting.js', () => ({
    shouldUseSectionsAuthoritySnapshot: () => true,
    shouldForceSectionsAuthorityRefresh: () => false,
}));
vi.mock('../utils/storage.js', async importOriginal => ({
    ...await importOriginal(),
    getSettings: () => settings,
    getViewCount: () => 0,
}));

import { clearNewsCache, fetchAndParseFeed, fetchSectionNews, filterEligibleSectionItems } from './rssAggregator.js';
import { proxyManager } from './proxyManager.js';

const NOW = Date.parse('2026-11-14T17:01:00Z');
const item = (id, title, section, ageHours = 1, description = '') => ({
    id, title, section, description,
    source: 'The Hindu',
    publishedAt: NOW - ageHours * 3_600_000,
    url: `https://www.thehindu.com/news/${section === 'india' ? 'national' : 'national/tamil-nadu'}/${id}.ece`,
});

describe('public-impact ranking on the served section paths', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        const storage = new Map();
        vi.stubGlobal('localStorage', {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: key => storage.delete(key),
        });
        readSnapshot.mockReset();
        clearNewsCache();
    });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('ranks snapshot candidates before the visible limit and retains reasoning on memory-cache reads', async () => {
        readSnapshot.mockResolvedValue({
            stale: false,
            sourceSection: 'india',
            items: [
                item('elephants', 'Two elephants found dead in Mysuru and Chamarajanagar districts', 'india', 0.1),
                item('naming', 'Ganga bridge should be named after Lalu Prasad, demands his daughter', 'india', 0.1),
                item('crash', 'Assam minibus collision: toll rises to 26', 'india', 4),
                item('trade', 'India-US trade deal negotiations near finishing line', 'india', 4),
            ],
        });
        const fresh = await fetchSectionNews('india', 2);
        expect(new Set(fresh.map(row => row.id))).toEqual(new Set(['crash', 'trade']));
        expect(fresh.every(row => row._publicImpact.priority === 3)).toBe(true);
        const cached = await fetchSectionNews('india', 2);
        expect(cached.map(row => row.id)).toEqual(fresh.map(row => row.id));
        expect(readSnapshot).toHaveBeenCalledTimes(1);
        expect(cached.find(row => row.id === 'crash')._scoreBreakdown.publicImpactKind).toBe('public_safety');
    });

    it('keeps statewide policy, emergency and actionable local alerts ahead of routine Tamil feed items', async () => {
        readSnapshot.mockResolvedValue({
            stale: false,
            sourceSection: 'tn',
            items: [
                item('ceremony', 'Children’s Day celebrated at Stanley Hospital', 'chennai', 0.1),
                item('inspection', 'Metrowater inspects RWH structures across Chennai', 'chennai', 0.1),
                item('rain', 'Cyclone warning: Tamil Nadu braces for heavy rain', 'chennai', 3),
                item('policy', 'Tamil Nadu government imposes stock limits on paddy, rice and pulses', 'chennai', 3),
                item('drain', 'Watch out for this open SWD near MEPZ', 'chennai', 1, 'Broken drain threatens commuters outside a bus terminus.'),
            ],
        });
        const ranked = await fetchSectionNews('chennai', 3);
        expect(new Set(ranked.map(row => row.id))).toEqual(new Set(['rain', 'policy', 'drain']));
        expect(ranked.every(row => row._publicImpact.priority >= 2)).toBe(true);
    });

    it('keeps snapshot epoch and source age on a warm read and retains unseen candidates', async () => {
        const summary = {
            contentHash: 'fixed-epoch', fetchedAt: NOW - 12 * 3_600_000 + 60_000,
            stale: false, dataSource: { effective: 'cloudflare_preview' },
        };
        readSnapshot.mockResolvedValue({
            stale: false, sourceSection: 'india', summary,
            items: [
                item('policy', 'Supreme Court orders national pension reforms', 'india'),
                item('trade', 'India-US trade deal negotiations near finishing line', 'india'),
            ],
        });
        await fetchSectionNews('india', 1);
        vi.setSystemTime(NOW + 120_000);
        const cached = await fetchSectionNews('india', 4);
        expect(cached).toHaveLength(2);
        expect(cached.prefetched).toBe(true);
        expect(cached.snapshotRuntimeSummary.contentHash).toBe('fixed-epoch');
        expect(cached.snapshotRuntimeSummary.dataSource.effective).toBe('cloudflare_preview');
        expect(cached.snapshotRuntimeSummary.stale).toBe(true);
        expect(cached.staleReason).toBe('snapshot-age');
        expect(readSnapshot).toHaveBeenCalledTimes(1);
    });

    it('keeps missing publication dates missing on actual feed normalization and rejects invalid dates', async () => {
        vi.spyOn(proxyManager, 'fetchViaProxy').mockResolvedValue({
            title: 'BBC',
            items: [
                { title: 'Published report', link: 'https://bbc.com/a', pubDate: new Date(NOW - 60_000).toISOString() },
                { title: 'Undated report', link: 'https://bbc.com/b' },
                { title: 'Invalid report', link: 'https://bbc.com/c', pubDate: 'not-a-date' },
                { title: 'Future report', link: 'https://bbc.com/d', pubDate: new Date(NOW + 86_400_000).toISOString() },
            ],
        });
        const rows = await fetchAndParseFeed('https://bbc.com/rss', 'world');
        expect(rows[1].publishedAt).toBeNull();
        expect(rows[2].publishedAtSource).toBe('missing');
        expect(filterEligibleSectionItems(rows, 'world', settings, null, NOW).map(row => row.url))
            .toEqual(['https://bbc.com/a']);
    });
});
