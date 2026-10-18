import { describe, expect, it } from 'vitest';
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
});
