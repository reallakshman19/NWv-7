import { describe, expect, it } from 'vitest';
import {
  classifyTopStoryEvent,
  TOP_STORY_EVENT_TYPES,
} from './topStoriesEventClassifier.js';
import {
  rankTopStories,
  scoreTopStoryCandidate,
} from './topStoriesRanker.js';

const NOW = Date.UTC(2026, 6, 14, 4, 0, 0);
const HOUR = 60 * 60 * 1000;

function story(id, ageHours, extra = {}) {
  return {
    id,
    title: id,
    section: 'india',
    source: 'Google News TN',
    sourceGroup: 'google_news',
    publishedAt: NOW - ageHours * HOUR,
    timestampConfidence: 'high',
    ...extra,
  };
}

function rank(items) {
  return rankTopStories({
    sectionItems: { india: items },
    nowMs: NOW,
  }, { limit: 10 });
}

describe('NW-RANK-009 contextual keyword safety', () => {
  it.each([
    'Election update',
    'Budget update',
    'Summit update',
    'Treaty update',
    'Verdict update',
    'Minister update',
  ])('does not qualify a bare keyword: %s', title => {
    const event = classifyTopStoryEvent({ title });
    expect(event.eventType).toBe(TOP_STORY_EVENT_TYPES.UNKNOWN);
    expect(event.qualified).toBe(false);
  });

  it('qualifies election only with corroborating election context', () => {
    const event = classifyTopStoryEvent({
      title: 'Election commission reports voter turnout after polling',
    });
    expect(event.eventType).toBe(TOP_STORY_EVENT_TYPES.GOVERNANCE);
    expect(event.qualified).toBe(true);
  });

  it('rejects a 9h single-source aggregator election row from fallback', () => {
    const ranked = rank([
      story('old-election', 9, {
        title: 'Tamil Nadu records voter turnout in single-phase election',
      }),
    ]);
    expect(ranked).toHaveLength(0);
  });

  it('allows corroborated fallback governance from independent sources', () => {
    const ranked = rank([
      story('confirmed-election', 9, {
        title: 'Election commission confirms voter turnout after polling',
        source: 'Reuters',
        sourceGroup: 'reuters',
        sourceCount: 2,
        allSources: ['Reuters', 'The Hindu'],
      }),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]._topStoryRank.slotBand).toBe('fallback');
  });

  it('rejects fetch-time fallback timestamps even when the keyword is qualified', () => {
    const row = story('fallback-time', 0, {
      title: 'Election commission confirms voter turnout after polling',
      timestampConfidence: undefined,
      publishedAtSource: undefined,
      fetchedAt: NOW,
      publishedAt: NOW,
    });
    const scored = scoreTopStoryCandidate(row, { nowMs: NOW });
    expect(scored._topStoryRank.timestampConfidence).toBe('low');
    expect(scored._topStoryRank.slotBand).toBe('rejected');
  });

  it('does not count source and sourceGroup aliases as two sources', () => {
    const scored = scoreTopStoryCandidate(story('single-google', 1, {
      title: 'Election commission confirms voter turnout after polling',
    }), { nowMs: NOW });
    expect(scored._topStoryRank.sourceCount).toBe(1);
  });

  it('ranks qualified public-safety evidence above a bare high-impact word', () => {
    const ranked = rank([
      story('keyword-only', 0.1, { title: 'Election update' }),
      story('public-safety', 1, {
        title: 'Explosion injures residents near railway station',
        source: 'Reuters',
        sourceGroup: 'reuters',
      }),
    ]);
    expect(ranked[0].id).toBe('public-safety');
  });
});
