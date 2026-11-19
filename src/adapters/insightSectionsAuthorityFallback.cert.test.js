import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSectionsAuthorityInsightPool,
  createSectionsAuthorityInsightRawFetcher,
} from './insightSectionsAuthorityFallback.js';

const H = 60 * 60 * 1000;
const NOW = Date.parse('2026-10-18T12:00:00Z');

function story(id, ageHours, section = 'world') {
  return {
    id,
    title: `${id} title`,
    summary: `${id} summary`,
    source: `${section} source`,
    sourceGroup: `${section}_source`,
    url: `https://example.com/${id}`,
    publishedAt: NOW - ageHours * H,
  };
}

describe('Insight Sections authority fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  it('builds a deduplicated cross-section story pool', () => {
    const shared = story('shared', 2);

    const snapshot = {
      schemaVersion: 2,
      fetchedAt: NOW,
      sections: {
        topStories: [shared, story('top', 1)],
        india: [shared, story('india', 5, 'india')],
        world: [story('world', 13, 'world')],
        business: [story('business', 25, 'business')],
      },
    };

    const pool = buildSectionsAuthorityInsightPool(snapshot);
    const ids = pool.map(item => item.id);

    expect(ids).toContain('shared');
    expect(ids).toContain('top');
    expect(ids).toContain('india');
    expect(ids).toContain('world');
    expect(ids).toContain('business');
    expect(ids.filter(id => id === 'shared')).toHaveLength(1);
  });

  it('projects fresh authority stories into Insight temporal slots', async () => {
    const snapshot = {
      schemaVersion: 2,
      fetchedAt: NOW,
      sections: {
        topStories: [
          story('now', 2),
          story('minus4h', 6),
          story('minus12h', 18),
          story('minus24h', 30),
          story('too-old', 40),
        ],
      },
    };

    const fetcher = createSectionsAuthorityInsightRawFetcher(snapshot);

    expect((await fetcher('now')).map(item => item.id)).toEqual(['now']);
    expect((await fetcher('minus4h')).map(item => item.id)).toEqual(['minus4h']);
    expect((await fetcher('minus12h')).map(item => item.id)).toEqual(['minus12h']);
    expect((await fetcher('minus24h')).map(item => item.id)).toEqual(['minus24h']);
  });

  it('retains corroborating reports beyond forty stories without losing the older slot', async () => {
    const snapshot = {
      schemaVersion: 2,
      fetchedAt: NOW,
      sections: { topStories: [
        ...Array.from({ length: 55 }, (_, index) => story(`recent-${index}`, 1 + index / 60)),
        story('older', 30),
      ] },
    };
    const fetcher = createSectionsAuthorityInsightRawFetcher(snapshot);

    expect(await fetcher('now')).toHaveLength(55);
    expect((await fetcher('minus24h')).map(item => item.id)).toEqual(['older']);
  });

  it('bounds an oversized authority to 300 while preserving every populated time window', async () => {
    const snapshot = { sections: {
      topStories: Array.from({ length: 2000 }, (_, index) => story(`top-${index}`, 1)),
      india: Array.from({ length: 300 }, (_, index) => story(`in-${index}`, 6)),
      world: [story('twelve',18),story('older',30),story('expired',40)],
    } };
    const pool = buildSectionsAuthorityInsightPool(snapshot);
    expect(pool).toHaveLength(300);
    expect(pool.map(item=>item.id)).toEqual(expect.arrayContaining(['twelve','older']));
    expect(pool.some(item=>item.id==='expired'||item.id==='top-300')).toBe(false);
    const fetcher = createSectionsAuthorityInsightRawFetcher(snapshot);
    const slots = await Promise.all(['now','minus4h','minus12h','minus24h'].map(fetcher));
    expect(slots.flat()).toHaveLength(300);
    expect((await fetcher('minus24h')).map(item=>item.id)).toEqual(['older']);
  });

  it('expires an item when observation reaches the end of the 36h slot', async () => {
    const snapshot = { sections: { world: [story('older', 35, 'world')] } };
    const fetcher = createSectionsAuthorityInsightRawFetcher(snapshot);
    expect((await fetcher('minus24h')).map(item => item.id)).toEqual(['older']);
    vi.setSystemTime(NOW + H);
    expect(await fetcher('minus24h')).toEqual([]);
  });
});
