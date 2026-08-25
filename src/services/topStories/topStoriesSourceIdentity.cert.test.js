import { describe, expect, it } from 'vitest';
import { getTopStoriesPolicy } from './topStoriesPolicy.js';
import { selectTopStorySlotsWithTrace } from './topStoriesSelection.js';
import {
  extractTopStorySignals,
  getSourceQualityScore,
} from './topStoriesSignals.js';
import { normalizeTopFeedSnapshotRows } from './topStoriesTopFeedSignals.js';
import {
  getSourceFamily,
  getStorySourceFamilies,
  getStorySourceFamily,
} from './topStoriesSourceIdentity.js';

const NOW = Date.parse('2026-08-25T12:00:00Z');

function context() {
  return { policy: getTopStoriesPolicy(), nowMs: NOW, topFeedSignalMap: new Map() };
}

function candidate(id, sourceGroup) {
  return {
    id,
    title: `Flood warning ${id}`,
    source: sourceGroup,
    sourceGroup,
    section: `section-${id}`,
    region: `region-${id}`,
    _topStoryRank: {
      slotBand: 'primary',
      clusterKey: `cluster-${id}`,
      normalizedScore: 0.8,
    },
  };
}

describe('NW-RANK-SRC-001 canonical publisher-family identity', () => {
  it('canonicalizes common Live and Hybrid aliases without changing display fields', () => {
    expect(getSourceFamily('TOI')).toBe('times_of_india');
    expect(getSourceFamily('Times of India')).toBe('times_of_india');
    expect(getSourceFamily('timesofindia.indiatimes.com')).toBe('times_of_india');
    expect(getSourceFamily('Google News Oman')).toBe('google_news');
    expect(getSourceFamily('google_news_alt')).toBe('google_news');
    expect(getSourceFamily('BBC World')).toBe('bbc');
  });

  it('prefers an original publisher over a Google News acquisition wrapper', () => {
    const story = { source: 'Reuters', sourceGroup: 'google_news_oman' };
    expect(getStorySourceFamily(story)).toBe('reuters');
    expect(getStorySourceFamily({ source: 'Reuters', sourceGroup: 'Unknown' })).toBe('reuters');
  });

  it('does not count aliases of one publisher as independent evidence', () => {
    const story = {
      source: 'TOI',
      sourceGroup: 'toi',
      allSources: ['TOI', 'Times of India'],
      sourceCount: 2,
      publishedAt: NOW - (5 * 60 * 60 * 1000),
    };
    expect(getStorySourceFamilies(story)).toEqual(['times_of_india']);
    const signals = extractTopStorySignals(story, context());
    expect(signals.sourceCount).toBe(1);
    expect(signals.independentEvidenceCount).toBe(0);
  });

  it('retains genuinely independent publisher evidence', () => {
    const story = {
      source: 'TOI',
      sourceGroup: 'toi',
      allSources: ['Times of India', 'Reuters'],
      sourceCount: 2,
      publishedAt: NOW - (5 * 60 * 60 * 1000),
    };
    const signals = extractTopStorySignals(story, context());
    expect(signals.sourceCount).toBe(2);
    expect(signals.independentEvidenceCount).toBe(1);
  });

  it('resolves existing source-quality tiers across source-group forms', () => {
    expect(getSourceQualityScore({ sourceGroup: 'the_hindu' })).toBe(1);
    expect(getSourceQualityScore({ source: 'AP News' })).toBe(1);
    expect(getSourceQualityScore({ sourceGroup: 'economic_times' })).toBe(0.72);
    expect(getSourceQualityScore({ source: 'TOI' })).toBe(0.48);
  });

  it('does not treat Google News lane variants as top-feed corroboration', () => {
    const rows = ['google_news', 'google_news_oman', 'google_news_alt'].map((sourceGroup, index) => ({
      id: 'same-story',
      title: 'Same story',
      source: sourceGroup,
      sourceGroup,
      topFeedSource: `snapshot-${index}`,
      topFeedRank: index + 1,
    }));
    const [signal] = normalizeTopFeedSnapshotRows(rows);
    expect(signal.topFeedSourceCount).toBe(1);
    expect(signal.topFeedCorroborationHits).toBe(0);
    expect(signal.topFeedSources).toEqual(['google_news']);
  });

  it('applies one selection diversity budget to Google News lane variants', () => {
    const policy = getTopStoriesPolicy({ primaryLimit: 10 });
    const ranked = [
      candidate('one', 'google_news'),
      candidate('two', 'Google News Oman'),
      candidate('three', 'google_news_alt'),
      candidate('four', 'Google News TN'),
      candidate('five', 'google_news_business'),
      candidate('six', 'Reuters'),
    ];
    const { selected } = selectTopStorySlotsWithTrace(ranked, {
      policy,
      limit: 10,
      displayDepth: 10,
    });
    expect(selected.filter(item => getStorySourceFamily(item) === 'google_news')).toHaveLength(4);
    expect(selected.map(item => item.id)).not.toContain('five');
    expect(selected.map(item => item.id)).toContain('six');
  });
});
