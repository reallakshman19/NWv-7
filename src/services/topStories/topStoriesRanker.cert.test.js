import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyTopStoryEvent, TOP_STORY_EVENT_TYPES } from './topStoriesEventClassifier.js';
import { rankTopStories } from './topStoriesRanker.js';
import { __mainViewModelInternalsForTest } from '../../viewModels/useMainTabViewModel.js';

const NOW = Date.UTC(2026, 6, 8, 8, 0, 0);
const hour = 60 * 60 * 1000;
const ids = rows => rows.map(row => row.id);

function story(id, ageHours, extra = {}) {
  return {
    id,
    title: id,
    section: extra.section || 'world',
    source: extra.source || `Source ${id}`,
    sourceGroup: extra.sourceGroup || `source-${id}`,
    publishedAt: ageHours == null ? undefined : NOW - ageHours * hour,
    timestampConfidence: extra.timestampConfidence || 'high',
    ...extra,
  };
}

function rank(items, options = {}) {
  return rankTopStories({ sectionItems: { world: items }, nowMs: NOW, topFeedItems: options.topFeedItems || [] }, options);
}

describe('NW-RANK-001 Top Stories ranker', () => {
  it('keeps top 10 in the 0-4h band when primary stories are available', () => {
    const items = Array.from({ length: 14 }, (_, i) => story(`p${i}`, 1, { title: `Cyclone warning ${i}` }))
      .concat([story('old', 7, { title: 'Fresh old conflict update' })]);
    expect(rank(items).slice(0, 10).every(item => item._topStoryRank.slotBand === 'primary')).toBe(true);
  });

  it('keeps slots 11-25 in 0-8h before fallback when enough current stories exist', () => {
    const primary = Array.from({ length: 10 }, (_, i) => story(`p${i}`, 1, { title: `Court verdict ${i}` }));
    const secondary = Array.from({ length: 15 }, (_, i) => story(`s${i}`, 6, { title: `Flood alert ${i}` }));
    expect(rank([...primary, ...secondary]).slice(10).every(item => item._topStoryRank.slotBand === 'secondary')).toBe(true);
  });

  it('uses 8-12h fallback only when fewer than 25 current stories exist', () => {
    const current = Array.from({ length: 12 }, (_, i) => story(`c${i}`, 2, { title: `Public safety alert ${i}` }));
    const fallback = Array.from({ length: 20 }, (_, i) => story(`f${i}`, 10, { title: `Government warning ${i}` }));
    const ranked = rank([...current, ...fallback]);
    expect(ranked.some(item => item._topStoryRank.slotBand === 'fallback')).toBe(true);
    expect(ranked.findIndex(item => item._topStoryRank.slotBand === 'fallback')).toBeGreaterThanOrEqual(12);
  });

  it('places a fresh breaking story into primary slots', () => {
    const ranked = rank([
      story('plain', 1, { title: 'Routine business update' }),
      story('breaking', 0.5, { title: 'Cyclone landfall alert', isBreaking: true, breakingScore: 3 }),
    ]);
    expect(ranked[0].id).toBe('breaking');
    expect(ranked[0]._topStoryRank.slotBand).toBe('primary');
  });

  it('rejects stale or low-confidence breaking stories from primary slots', () => {
    const ranked = rank([
      story('low-breaking', 0.5, { isBreaking: true, timestampConfidence: 'low', title: 'Breaking blast' }),
      story('fresh', 1, { title: 'Blast injures residents' }),
    ]);
    expect(ranked[0].id).toBe('fresh');
    expect(ranked.find(item => item.id === 'low-breaking')?._topStoryRank.slotBand).not.toBe('primary');
  });

  it('boosts LIVE only with fresh update evidence or consensus', () => {
    const ranked = rank([
      story('live-fresh', 5, { title: 'LIVE cyclone updates', updatedAt: NOW - hour }),
      story('live-old', 5, { title: 'LIVE old blog' }),
    ]);
    expect(ranked[0].id).toBe('live-fresh');
  });

  it('does not let old live blogs persist indefinitely', () => {
    const ranked = rank([story('live-expired', 25, { title: 'LIVE updates: old conflict blog' })]);
    expect(ranked).toHaveLength(0);
  });

  it('ranks stronger source/cluster/top-feed consensus above weak consensus', () => {
    const ranked = rank([
      story('weak', 1, { title: 'Government alert', sourceCount: 1 }),
      story('strong', 1, { title: 'Government alert confirmed', sourceCount: 3, clusteredItems: 4 }),
    ], { topFeedItems: [story('strong', 1, { topFeedHits: 3 })] });
    expect(ranked[0].id).toBe('strong');
  });

  it('caps consensus so duplicate volume alone cannot dominate', () => {
    const ranked = rank([
      story('duplicate-volume', 1, { title: 'Routine business launch', sourceCount: 99, clusteredItems: 99 }),
      story('public-alert', 1, { title: 'Flood alert evacuations ordered', sourceCount: 2 }),
    ]);
    expect(ranked[0].id).toBe('public-alert');
  });

  it('collapses clustered duplicates while retaining metadata', () => {
    const ranked = rank([
      story('dup-a', 1, { title: 'Cyclone alert', clusterId: 'storm-1', sourceCount: 3 }),
      story('dup-b', 1, { title: 'Cyclone alert update', clusterId: 'storm-1', sourceCount: 4 }),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]._topStoryRank.sourceCount).toBeGreaterThanOrEqual(3);
  });

  it('ranks active public-interest hard news above fresher entertainment promo', () => {
    const ranked = rank([
      story('promo', 0.1, { title: 'God of War gameplay trailer released' }),
      story('conflict', 1, { title: 'Missile attack injures civilians' }),
    ]);
    expect(ranked[0].id).toBe('conflict');
  });

  it('does not classify God of War as real war/conflict', () => {
    const event = classifyTopStoryEvent({ title: 'God of War gameplay trailer revealed' });
    expect(event.eventType).toBe(TOP_STORY_EVENT_TYPES.ENTERTAINMENT_PROMO);
  });

  it('keeps unknown classification as a non-zero safe fallback', () => {
    const ranked = rank([story('unknown', 1, { title: 'Community update' })]);
    expect(ranked[0]._topStoryRank.publicInterestScore).toBeGreaterThan(0);
  });

  it('limits one source/section/geography dominance when alternatives exist', () => {
    const dominant = Array.from({ length: 10 }, (_, i) => story(`dom${i}`, 1, { sourceGroup: 'same', title: `Alert ${i}` }));
    const alternatives = Array.from({ length: 5 }, (_, i) => story(`alt${i}`, 1, { sourceGroup: `alt${i}`, title: `Alert ${i}` }));
    const ranked = rank([...dominant, ...alternatives], { limit: 10 });
    expect(ranked.filter(item => item.sourceGroup === 'same').length).toBeLessThanOrEqual(4);
  });

  it('allows qualified local public alerts with weak global consensus', () => {
    const ranked = rank([story('local', 1, { title: 'Muscat public closure alert', section: 'local', sourceCount: 1 })]);
    expect(ranked[0].id).toBe('local');
  });

  it('produces stable ordering for the same fixture', () => {
    const fixture = [
      story('a', 1, { title: 'Flood evacuation alert' }),
      story('b', 2, { title: 'Court verdict announced' }),
      story('c', 1, { title: 'Routine earnings report' }),
    ];
    expect(ids(rank(fixture))).toEqual(ids(rank(fixture)));
  });

  it('preserves supplied frontPage order except viewed/read demotion', () => {
    const { filterLatestStories } = __mainViewModelInternalsForTest;
    const rows = [story('first', 3), story('second', 1), story('third', 2)];
    expect(ids(filterLatestStories(rows, false))).toEqual(['first', 'second', 'third']);
  });

  it('keeps topStories modules local and non-mutating', () => {
    const frozen = Object.freeze(story('frozen', 1, { title: 'Flood warning' }));
    expect(() => rank([frozen])).not.toThrow();
    const signals = readFileSync(new URL('./topStoriesSignals.js', import.meta.url), 'utf8');
    const classifier = readFileSync(new URL('./topStoriesEventClassifier.js', import.meta.url), 'utf8');
    expect(`${signals}\n${classifier}`).not.toMatch(/\bfetch\s*\(/);
    expect(`${signals}\n${classifier}`).not.toMatch(/XMLHttpRequest|WebSocket/);
  });
});
