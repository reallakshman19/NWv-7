import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyTopStoryEvent, TOP_STORY_EVENT_TYPES } from './topStoriesEventClassifier.js';
import { evaluateTopStories, rankTopStories, scoreTopStoryCandidate, TOP_STORIES_RANKER_VERSION } from './topStoriesRanker.js';
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
    sourceTier: extra.sourceTier === undefined ? 'A' : extra.sourceTier,
    publishedAt: ageHours == null ? undefined : NOW - ageHours * hour,
    timestampConfidence: extra.timestampConfidence || 'high',
    ...extra,
  };
}

function rank(items, options = {}) {
  return rankTopStories({ sectionItems: { world: items }, nowMs: NOW, topFeedItems: options.topFeedItems || [] }, options);
}

function score(item) {
  return scoreTopStoryCandidate(item, { nowMs: NOW });
}

function trustedSingleSource(id, ageHours, extra = {}) {
  return story(id, ageHours, {
    source: 'Reuters',
    sourceGroup: 'Reuters',
    sourceCount: 1,
    clusteredItems: 1,
    ...extra,
  });
}

function establishedCompetitors() {
  return Array.from({ length: 5 }, (_, i) => story(`established-${i}`, 1, {
    title: `Court verdict announced in public case ${i}`,
    source: `Trusted Source ${i}`,
    sourceGroup: `trusted-source-${i}`,
    sourceCount: 4,
    clusteredItems: 4,
    section: `established-section-${i}`,
  }));
}

function topFeedRows(id, count = 3, extra = {}) {
  return Array.from({ length: count }, (_, index) => story(id, 1, {
    source: `Top Feed ${index}`,
    sourceGroup: `top-feed-${index}`,
    topFeedSource: `snapshot-${index}`,
    topFeedRank: index + 1,
    ...extra,
  }));
}

describe('NW-RANK-001 Top Stories ranker', () => {
  it('versions the current ranking semantics independently from the historical v1 pilot', () => {
    expect(TOP_STORIES_RANKER_VERSION).toBe('nw-top-stories-ranker-observed-v2');
  });

  it('keeps top 10 in the 0-4h band when diverse primary stories are available', () => {
    const items = Array.from({ length: 14 }, (_, i) => story(`p${i}`, 1, {
      title: `Cyclone warning ${i}`,
      section: `primary-section-${i}`,
    })).concat([story('old', 7, { title: 'Fresh old conflict update' })]);
    const ranked = rank(items);
    expect(ranked.slice(0, 10)).toHaveLength(10);
    expect(ranked.slice(0, 10).every(item => item._topStoryRank.slotBand === 'primary')).toBe(true);
  });

  it('keeps slots 11-25 in 0-8h before fallback when enough diverse current stories exist', () => {
    const primary = Array.from({ length: 10 }, (_, i) => story(`p${i}`, 1, {
      title: `Court verdict announced in case ${i}`,
      section: `primary-${i}`,
    }));
    const secondary = Array.from({ length: 15 }, (_, i) => story(`s${i}`, 6, {
      title: `Flood evacuation alert ${i}`,
      section: `secondary-${i}`,
      sourceCount: 2,
    }));
    const ranked = rank([...primary, ...secondary]);
    expect(ranked).toHaveLength(25);
    expect(ranked.slice(10).every(item => item._topStoryRank.slotBand === 'secondary')).toBe(true);
  });

  it('uses 8-12h fallback only when fewer than 25 diverse current stories exist', () => {
    const current = Array.from({ length: 12 }, (_, i) => story(`c${i}`, 2, {
      title: `Public safety alert ${i}`,
      section: `current-${i}`,
    }));
    const fallback = Array.from({ length: 20 }, (_, i) => story(`f${i}`, 10, {
      title: `Public government warning ${i}`,
      section: `fallback-${i}`,
      sourceCount: 2,
      allSources: [`Fallback Source ${i}`, `Fallback Confirm ${i}`],
    }));
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
      story('live-fresh', 5, { title: 'LIVE cyclone warning updates', updatedAt: NOW - hour, sourceCount: 2 }),
      story('live-old', 5, { title: 'LIVE cyclone warning old blog', sourceCount: 2 }),
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

  it('collapses same-story duplicates while retaining merged source metadata', () => {
    const ranked = rank([
      story('', 1, { id: undefined, url: 'https://example.com/storm-1', title: 'Cyclone alert', source: 'Source A', sourceGroup: 'src-a', sourceCount: 3 }),
      story('', 1, { id: undefined, url: 'https://example.com/storm-1', title: 'Cyclone alert update', source: 'Source B', sourceGroup: 'src-b' }),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]._topStoryRank.sourceCount).toBeGreaterThanOrEqual(3);
  });

  it('collapses clustered duplicates to a single Top Stories slot', () => {
    const ranked = rank([
      story('dup-a', 1, { title: 'Cyclone alert', clusterId: 'storm-1', sourceCount: 3 }),
      story('dup-b', 1, { title: 'Cyclone alert update', clusterId: 'storm-1', sourceCount: 4 }),
    ]);
    expect(ranked).toHaveLength(1);
    expect(['dup-a', 'dup-b']).toContain(ranked[0].id);
    expect(ranked[0]._topStoryRank.clusterKey).toBe('storm-1');
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

  it('keeps unknown public interest low and rejects uncorroborated unknown stories', () => {
    const candidate = story('unknown', 1, { title: 'Community update' });
    const scored = score(candidate);
    expect(scored._topStoryRank.publicInterestScore).toBeGreaterThan(0);
    expect(scored._topStoryRank.publicInterestScore).toBeLessThanOrEqual(0.1);
    expect(scored._topStoryRank.slotBand).toBe('rejected');
    expect(scored._topStoryRank.admissionReason).toBe('unqualified_without_independent_evidence');
    expect(rank([candidate])).toHaveLength(0);
  });

  it('gives one source zero consensus', () => {
    const scored = score(story('single-source', 1, {
      title: 'Court verdict announced in public case',
      sourceCount: 1,
      clusteredItems: 1,
    }));
    expect(scored._topStoryRank.sourceCount).toBe(1);
    expect(scored._topStoryRank.consensusScore).toBe(0);
    expect(scored._topStoryRank.independentEvidenceCount).toBe(0);
  });

  it('excludes the generic iPhone screenshot regression', () => {
    const ranked = rank([story('iphone-preview', 4, {
      title: "With two months left for the Apple iPhone 18 Pro drop, here's what makes it a more lucrative option",
      source: 'Google News',
      sourceGroup: 'google_news',
      section: 'technology',
    })]);
    expect(ranked).toHaveLength(0);
  });

  it('excludes a single-source BBC human-interest top-feed row without corroboration', () => {
    const bbcFeature = story('bbc-iron-lung', 6, {
      title: 'Hours each day in an iron lung kept her breathing, her will to live kept her alive',
      source: 'BBC',
      sourceGroup: 'bbc',
      section: 'world',
      topFeedRank: 1,
      topFeedSource: 'bbc-top-feed',
    });
    const ranked = rank([bbcFeature], { topFeedItems: [bbcFeature] });
    expect(ranked).toHaveLength(0);
    const scored = scoreTopStoryCandidate(bbcFeature, {
      nowMs: NOW,
      topFeedSignalMap: new Map(),
    });
    expect(scored._topStoryRank.eventQualified).toBe(false);
  });

  it('limits one source/section/geography dominance when enough alternatives exist', () => {
    const sections = ['india', 'business', 'sports', 'technology', 'science', 'health', 'world', 'civic'];
    const dominant = Array.from({ length: 10 }, (_, i) => story(`dom${i}`, 1, { sourceGroup: 'same', title: `Public alert ${i}` }));
    const alternatives = Array.from({ length: 8 }, (_, i) => story(`alt${i}`, 1, { sourceGroup: `alt${i}`, section: sections[i], title: `Public alert ${i}` }));
    const ranked = rank([...dominant, ...alternatives], { limit: 10 });
    expect(ranked).toHaveLength(10);
    expect(ranked.filter(item => item.sourceGroup === 'same').length).toBeLessThanOrEqual(2);
  });

  it('under-fills rather than bypassing visible-rail diversity limits when alternatives run out', () => {
    const dominant = Array.from({ length: 10 }, (_, i) => story(`dom${i}`, 1, { sourceGroup: 'same', title: `Public alert ${i}` }));
    const alternatives = Array.from({ length: 5 }, (_, i) => story(`alt${i}`, 1, { sourceGroup: `alt${i}`, section: `alternative-${i}`, title: `Public alert ${i}` }));
    const ranked = rank([...dominant, ...alternatives], { limit: 10 });
    expect(ranked).toHaveLength(7);
    expect(ranked.filter(item => item.sourceGroup === 'same')).toHaveLength(2);
    expect(ranked.filter(item => item.sourceGroup !== 'same')).toHaveLength(5);
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

  it('lets a very fresh trusted single-source public_safety story enter Top-3', () => {
    const coldStart = trustedSingleSource('cold-public-safety', 0.1, {
      title: 'Explosion injures residents in city center',
    });
    const ranked = rank([...establishedCompetitors(), coldStart]);
    const placed = ranked.find(item => item.id === 'cold-public-safety');
    expect(ranked.findIndex(item => item.id === 'cold-public-safety')).toBeLessThan(3);
    expect(placed._topStoryRank.eventType).toBe(TOP_STORY_EVENT_TYPES.PUBLIC_SAFETY);
    expect(placed._topStoryRank.coldStartCritical).toBe(true);
    expect(placed._topStoryRank.priorityBucketLabel).toBe('cold-start-critical');
    expect(placed._topStoryRank.sourceCount).toBe(1);
    expect(placed._topStoryRank.topFeedHits).toBe(0);
  });

  it('lets a very fresh trusted single-source disaster story enter Top-3', () => {
    const coldStart = trustedSingleSource('cold-disaster', 0.1, {
      title: 'Cyclone landfall storm surge threatens coastal districts',
    });
    const ranked = rank([...establishedCompetitors(), coldStart]);
    const placed = ranked.find(item => item.id === 'cold-disaster');
    expect(ranked.findIndex(item => item.id === 'cold-disaster')).toBeLessThan(3);
    expect(placed._topStoryRank.eventType).toBe(TOP_STORY_EVENT_TYPES.DISASTER);
    expect(placed._topStoryRank.coldStartCritical).toBe(true);
  });

  it('does not require consensus or top-feed evidence for age <= 15 minute critical events', () => {
    const coldStart = trustedSingleSource('cold-critical-no-consensus', 0.2, {
      title: 'Hostage attack injures civilians at transit hub',
    });
    const ranked = rank([...establishedCompetitors(), coldStart], { topFeedItems: [] });
    const placed = ranked.find(item => item.id === 'cold-critical-no-consensus');
    expect(ranked.findIndex(item => item.id === 'cold-critical-no-consensus')).toBeLessThan(3);
    expect(placed._topStoryRank.coldStartCritical).toBe(true);
    expect(placed._topStoryRank.sourceCount).toBe(1);
    expect(placed._topStoryRank.topFeedHits).toBe(0);
    expect(placed._topStoryRank.clusterKey).toBe('cold-critical-no-consensus');
  });

  it('does not let low-confidence timestamp rows use the cold-start lane', () => {
    const scored = score(trustedSingleSource('low-confidence-cold', 0.1, {
      title: 'Explosion injures residents near refinery',
      timestampConfidence: 'low',
    }));
    expect(scored._topStoryRank.coldStartCritical).toBe(false);
    expect(scored._topStoryRank.priorityBucketLabel).toBe('standard');
    expect(scored._topStoryRank.slotBand).toBe('rejected');
  });

  it('does not let entertainment promo rows use the cold-start lane', () => {
    const scored = score(trustedSingleSource('promo-cold', 0.1, {
      title: 'God of War gameplay trailer released',
    }));
    expect(scored._topStoryRank.eventType).toBe(TOP_STORY_EVENT_TYPES.ENTERTAINMENT_PROMO);
    expect(scored._topStoryRank.coldStartCritical).toBe(false);
    expect(scored._topStoryRank.priorityBucketLabel).toBe('standard');
  });

  it('does not let routine business rows use the cold-start lane', () => {
    const scored = score(trustedSingleSource('routine-cold', 0.1, {
      title: 'Startup launch reports quarterly profit results',
    }));
    expect(scored._topStoryRank.eventType).toBe(TOP_STORY_EVENT_TYPES.ROUTINE_BUSINESS);
    expect(scored._topStoryRank.coldStartCritical).toBe(false);
    expect(scored._topStoryRank.priorityBucketLabel).toBe('standard');
  });

  it('does not let stale or older-than-window rows use the cold-start lane', () => {
    const scored = score(trustedSingleSource('stale-cold', 13, {
      title: 'Explosion injures residents in old incident',
    }));
    expect(scored._topStoryRank.coldStartCritical).toBe(false);
    expect(scored._topStoryRank.slotBand).toBe('expired');
  });

  it('uses dedicated top-feed rows as evidence without injecting them as duplicate ranking candidates', () => {
    const candidate = story('signal-only', 1, {
      title: 'Court verdict announced in public case',
      source: 'BBC',
      sourceGroup: 'bbc',
    });
    const evaluation = evaluateTopStories({
      sectionItems: { world: [candidate] },
      topFeedSignalItems: topFeedRows('signal-only', 3),
      nowMs: NOW,
    });

    expect(evaluation.rawInputCount).toBe(1);
    expect(evaluation.candidates).toHaveLength(1);
    expect(evaluation.scoredCandidates[0]._topStoryRank.topFeedCorroborationHits)
      .toBeGreaterThan(0);
  });

  it('uses strong top-feed corroboration as a bounded boost for equivalent hard news', () => {
    const ranked = rank([
      story('weak-feed', 1, { title: 'Court verdict announced in public case' }),
      story('strong-feed', 1, { title: 'Court verdict announced in public case update' }),
    ], { topFeedItems: topFeedRows('strong-feed', 4) });
    expect(ranked[0].id).toBe('strong-feed');
    expect(ranked[0]._topStoryRank.topFeedCorroborationHits).toBeGreaterThan(0);
  });

  it('does not treat one top-feed row as independent corroboration', () => {
    const direct = story('one-top-feed', 1, {
      title: 'Court verdict announced in public case',
      source: 'BBC',
      sourceGroup: 'bbc',
      topFeedRank: 1,
      topFeedSource: 'bbc',
    });
    const ranked = rank([direct], { topFeedItems: [direct] });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]._topStoryRank.topFeedHits).toBeGreaterThan(0);
    expect(ranked[0]._topStoryRank.topFeedCorroborationHits).toBe(0);
    expect(ranked[0]._topStoryRank.consensusScore).toBe(0);
  });

  it('does not let duplicate top-feed volume dominate by itself', () => {
    const spam = Array.from({ length: 30 }, () => story('duplicate-feed', 1, {
      title: 'Routine business product launch',
      source: 'Same Feed',
      sourceGroup: 'same-feed',
      topFeedSource: 'same-snapshot',
      topFeedRank: 1,
    }));
    const ranked = rank([
      story('duplicate-feed', 1, { title: 'Routine business product launch' }),
      story('public-alert', 1, { title: 'Flood evacuation alert ordered' }),
    ], { topFeedItems: spam });
    expect(ranked[0].id).toBe('public-alert');
  });

  it('does not resurrect stale or low-confidence stories into primary slots using top-feed alone', () => {
    const ranked = rank([
      story('stale-feed', 20, { title: 'Government alert old update' }),
      story('low-feed', 1, { title: 'Government alert low timestamp', timestampConfidence: 'low' }),
      story('fresh-alert', 1, { title: 'Government alert current closure' }),
    ], { topFeedItems: [...topFeedRows('stale-feed', 4), ...topFeedRows('low-feed', 4)] });
    expect(ranked[0].id).toBe('fresh-alert');
    expect(ranked.find(item => item.id === 'stale-feed')?._topStoryRank.slotBand).not.toBe('primary');
    expect(ranked.find(item => item.id === 'low-feed')?._topStoryRank.slotBand).not.toBe('primary');
  });

  it('does not let top-feed evidence make entertainment promo outrank active hard news', () => {
    const ranked = rank([
      story('promo-feed', 0.25, { title: 'God of War gameplay trailer released' }),
      story('hard-news', 1, { title: 'Flood evacuation alert ordered' }),
    ], { topFeedItems: topFeedRows('promo-feed', 6) });
    expect(ranked[0].id).toBe('hard-news');
  });

  it('keeps deterministic bounded output when topFeedItems is missing or empty', () => {
    const fixture = [
      story('a', 1, { title: 'Flood evacuation alert' }),
      story('b', 2, { title: 'Court verdict announced' }),
      story('c', 1, { title: 'Routine earnings report' }),
    ];
    const withoutTopFeed = rankTopStories({ sectionItems: { world: fixture }, nowMs: NOW });
    const emptyTopFeed = rankTopStories({ sectionItems: { world: fixture }, nowMs: NOW, topFeedItems: [] });
    expect(ids(emptyTopFeed)).toEqual(ids(withoutTopFeed));
    expect(emptyTopFeed.length).toBeLessThanOrEqual(25);
  });

  it('preserves supplied frontPage order except viewed/read demotion', () => {
    const { filterLatestStories } = __mainViewModelInternalsForTest;
    const rows = [story('first', 3), story('second', 1), story('third', 2)];
    expect(ids(filterLatestStories(rows, false))).toEqual(['first', 'second', 'third']);
  });

  it('rejects weak single-source non-local critical news even inside the 0-4h primary window', () => {
    const ranked = rank([
      story('weak-seattle', 3, {
        title: 'Seattle food festival shooting leaves 2 killed and 5 people injured',
        source: 'Times of India',
        sourceGroup: 'toi',
        sourceTier: null,
        sourceCount: 1,
      }),
      story('corroborated-court', 2, {
        title: 'Court verdict announced in public case',
        source: 'BBC',
        sourceGroup: 'bbc',
        sourceCount: 2,
        allSources: ['BBC', 'Reuters'],
      }),
    ]);

    expect(ranked.some(item => item.id === 'weak-seattle')).toBe(false);

    const scored = score(story('weak-seattle-score', 3, {
      title: 'Seattle food festival shooting leaves 2 killed and 5 people injured',
      source: 'Times of India',
      sourceGroup: 'toi',
      sourceTier: null,
      sourceCount: 1,
    }));
    expect(scored._topStoryRank.ageBand).toBe('primary');
    expect(scored._topStoryRank.slotBand).toBe('rejected');
    expect(scored._topStoryRank.admissionReason).toBe('nonlocal_critical_without_evidence');
  });

  it('keeps authoritative single-source non-local critical news eligible in the primary window', () => {
    const scored = score(story('reuters-critical', 3, {
      title: 'Seattle shooting leaves residents injured',
      source: 'Reuters',
      sourceGroup: 'Reuters',
      sourceCount: 1,
    }));

    expect(scored._topStoryRank.sourceQualityScore).toBe(1);
    expect(scored._topStoryRank.slotBand).toBe('primary');
  });

  it('uses the strongest independent publisher quality from a clustered event, not only the representative source', () => {
    const scored = score(story('cluster-source-quality', 2, {
      title: 'Court verdict announced in public case',
      source: 'Google News Top',
      sourceGroup: 'google_news',
      sourceTier: 'B',
      allSources: ['Google News Top', 'Reuters'],
      sourceCount: 2,
    }));

    expect(scored._topStoryRank.sourceQualityScore).toBe(1);
    // The Google News wrapper is not an independent publisher once
    // the underlying Reuters origin has been identified.
    expect(scored._topStoryRank.sourceCount).toBe(1);
    expect(scored._topStoryRank.consensusScore).toBe(0);
  });

  it('uses source tier metadata from the Sections registry when the publisher family is otherwise unknown', () => {
    const tierA = score(story('tier-a-regional', 1, {
      title: 'Court verdict announced in public case',
      source: 'Regional Authority Wire',
      sourceGroup: 'regional_authority_wire',
      sourceTier: 'A',
    }));
    const tierB = score(story('tier-b-regional', 1, {
      title: 'Court verdict announced in public case',
      source: 'Regional Daily',
      sourceGroup: 'regional_daily',
      sourceTier: 'B',
    }));

    expect(tierA._topStoryRank.sourceQualityScore).toBe(1);
    expect(tierB._topStoryRank.sourceQualityScore).toBe(0.72);
  });

  it('does not use legacy acquisition region codes as story-level geo diversity evidence', () => {
    const items = Array.from({ length: 10 }, (_, i) => story(`legacy-region-${i}`, 1, {
      title: `Court verdict announced in public case legacy region ${i}`,
      source: `Legacy Region Source ${i}`,
      sourceGroup: `legacy-region-source-${i}`,
      section: `legacy-region-section-${i}`,
      region: 'in',
    }));

    const ranked = rank(items, { limit: 10 });

    expect(ranked).toHaveLength(10);
  });

  it('reconsiders display-capped publisher stories below the visible top 10 under the broader rail cap', () => {
    const dominant = Array.from({ length: 4 }, (_, i) => story(`reuters-deferred-${i}`, 0.2 + i * 0.01, {
      title: `Court verdict announced in public case deferred ${i}`,
      source: 'Reuters',
      sourceGroup: 'Reuters',
      section: `dominant-deferred-${i}`,
    }));
    const alternatives = Array.from({ length: 12 }, (_, i) => story(`alt-deferred-${i}`, 0.5 + i * 0.02, {
      title: `Court verdict announced in public case alternative deferred ${i}`,
      source: `Alternative Deferred ${i}`,
      sourceGroup: `alternative-deferred-${i}`,
      section: `alternative-deferred-section-${i}`,
      sourceTier: 'A',
    }));

    const ranked = rank([...dominant, ...alternatives]);
    const displayed = ranked.slice(0, 10);
    const allReuters = ranked.filter(item => item.source === 'Reuters');

    expect(displayed.filter(item => item.source === 'Reuters')).toHaveLength(2);
    expect(allReuters).toHaveLength(4);
    expect(ranked.findIndex(item => item.id === 'reuters-deferred-2')).toBeGreaterThanOrEqual(10);
  });

  it('treats Google News lane aliases as one publisher family in the displayed top 10', () => {
    const googleRows = Array.from({ length: 6 }, (_, i) => story(`google-family-${i}`, 0.4 + i * 0.03, {
      title: `Court verdict announced in public case google family ${i}`,
      source: i % 2 === 0 ? 'Google News Top' : 'Google News Oman IN',
      sourceGroup: i % 2 === 0 ? 'google_news' : 'google_news_oman',
      sourceTier: 'B',
      section: `google-section-${i}`,
    }));
    const alternatives = Array.from({ length: 8 }, (_, i) => story(`google-alt-${i}`, 0.8 + i * 0.03, {
      title: `Court verdict announced in public case diverse family ${i}`,
      source: `Diverse Publisher ${i}`,
      sourceGroup: `diverse-publisher-${i}`,
      sourceTier: 'A',
      section: `diverse-section-${i}`,
    }));

    const displayed = rank([...googleRows, ...alternatives]).slice(0, 10);
    const googleCount = displayed.filter(item => (
      String(item.sourceGroup || '').startsWith('google_news')
    )).length;

    expect(displayed).toHaveLength(10);
    expect(googleCount).toBeLessThanOrEqual(2);
  });

  it('caps a single publisher family at two stories in the displayed top 10', () => {
    const dominant = Array.from({ length: 6 }, (_, i) => story(`reuters-${i}`, 0.5 + i * 0.05, {
      title: `Court verdict announced in public case ${i}`,
      source: 'Reuters',
      sourceGroup: 'Reuters',
      section: `dominant-${i}`,
    }));
    const alternatives = Array.from({ length: 10 }, (_, i) => story(`alt-${i}`, 1 + i * 0.02, {
      title: `Court verdict announced in public case alternative ${i}`,
      source: `Alternative Source ${i}`,
      sourceGroup: `alternative-${i}`,
      section: `alternative-section-${i}`,
      sourceTier: 'A',
    }));

    const ranked = rank([...dominant, ...alternatives]);
    const displayed = ranked.slice(0, 10);
    const reutersCount = displayed.filter(item => item.source === 'Reuters').length;

    expect(displayed).toHaveLength(10);
    expect(reutersCount).toBeLessThanOrEqual(2);
  });

  it('keeps topStories modules local and non-mutating', () => {
    const frozen = Object.freeze(story('frozen', 1, { title: 'Flood warning' }));
    expect(() => rank([frozen])).not.toThrow();
    const modules = [
      './topStoriesRanker.js',
      './topStoriesPolicy.js',
      './topStoriesSignals.js',
      './topStoriesEventClassifier.js',
      './topStoriesTopFeedSignals.js',
    ].map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
    expect(modules).not.toMatch(/\bfetch\s*\(/);
    expect(modules).not.toMatch(/XMLHttpRequest|WebSocket/);
  });
});
