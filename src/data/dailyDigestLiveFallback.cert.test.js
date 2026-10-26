import { describe, expect, it } from 'vitest';
import {
  buildLiveDigestCandidatePool,
  selectLiveDigestCards,
} from './dailyDigestLiveFallback.js';

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

  it('builds a diverse deterministic live digest from ranked Sections authority stories', () => {
    const snapshot = {
      schemaVersion: 2,
      fetchedAt: NOW,
      sections: {
        topStories: [
          story('top-a', 1, 'wire-a', 'topStories', 0.95),
          story('top-b', 1.2, 'wire-a', 'topStories', 0.90),
          story('top-c', 1.4, 'wire-a', 'topStories', 0.85),
        ],
        india: [story('india-a', 2, 'india-pub', 'india', 0.80)],
        world: [story('world-a', 2.2, 'world-pub', 'world', 0.78)],
        business: [story('business-a', 2.4, 'biz-pub', 'business', 0.76)],
        technology: [story('tech-a', 2.6, 'tech-pub', 'technology', 0.74)],
      },
    };

    const result = selectLiveDigestCards(snapshot, { nowMs: NOW });

    expect(result.cards).toHaveLength(6);
    expect(result.sourceGroupCount).toBeGreaterThanOrEqual(2);
    expect(result.cards[0].deliveryMode).toBe('LIVE');
    expect(result.cards.some(card => card.section === 'india')).toBe(true);
    expect(result.cards.some(card => card.section === 'world')).toBe(true);
    expect(result.cards.some(card => card.section === 'business')).toBe(true);

    const wireCards = result.cards.filter(card => card.sourceGroup === 'wire-a');
    expect(wireCards.length).toBeLessThanOrEqual(2);
  });

  it('shares the per-source budget across Google News lane aliases', () => {
    const snapshot = {
      fetchedAt: NOW,
      sections: {
        topStories: [
          story('google-a', 1, 'google_news', 'topStories'),
          story('google-b', 1.1, 'Google News Oman', 'topStories'),
          story('google-c', 1.2, 'google_news_alt', 'topStories'),
        ],
        india: [story('independent', 2, 'Reuters', 'india')],
        world: [story('google-d', 2.2, 'Google News TN', 'world')],
      },
    };

    const result = selectLiveDigestCards(snapshot, { nowMs: NOW });
    expect(result.cards).toHaveLength(3);
    expect(result.cards.filter(card => card.sourceGroup.toLowerCase().includes('google')))
      .toHaveLength(2);
    expect(result.sourceGroupCount).toBe(2);
  });

  it('never relaxes the per-publisher cap to fill the six-card rail', () => {
    const snapshot = {
      fetchedAt: NOW,
      sections: {
        topStories: [
          story('wire-1', 1, 'wire-a', 'topStories'),
          story('wire-2', 1.1, 'wire-a', 'topStories'),
          story('wire-3', 1.2, 'wire-a', 'topStories'),
        ],
        india: [story('independent', 2, 'publisher-b', 'india')],
        world: [story('wire-4', 2.2, 'wire-a', 'world')],
        business: [story('wire-5', 2.3, 'wire-a', 'business')],
      },
    };

    const result = selectLiveDigestCards(snapshot, { nowMs: NOW });
    expect(result.cards).toHaveLength(3);
    expect(result.cards.filter(card => card.sourceGroup === 'wire-a')).toHaveLength(2);
    expect(result.sourceGroupCount).toBe(2);
  });

  it('chooses a later eligible section candidate when the first publisher is capped', () => {
    const snapshot = {
      fetchedAt: NOW,
      sections: {
        topStories: [
          story('wire-1', 1, 'wire-a', 'topStories'),
          story('wire-2', 1.1, 'wire-a', 'topStories'),
        ],
        india: [
          story('india-capped', 1.2, 'wire-a', 'india'),
          story('india-eligible', 1.3, 'publisher-b', 'india'),
        ],
        world: [story('world-other', 1.4, 'publisher-c', 'world')],
      },
    };

    const result = selectLiveDigestCards(snapshot, { nowMs: NOW, limit: 3 });
    expect(result.cards.map(card => card.canonicalId)).toEqual([
      'wire-1', 'wire-2', 'india-eligible',
    ]);
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
