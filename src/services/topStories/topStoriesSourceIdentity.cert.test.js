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
  it.each([
    ['dw', 'https://www.dw.com/en/current-report/a-123'],
    ['ars_technica', 'https://arstechnica.com/tech-policy/current-report/'],
    ['the_arabian_stories', 'https://www.thearabianstories.com/2026/11/19/oman-report/'],
  ])('requires the actual domain for direct publisher %s', (sourceGroup, url) => {
    expect(getStorySourceFamily({ sourceGroup, url })).toBe(sourceGroup);
    expect(getStorySourceFamily({ sourceGroup, url: 'https://unrelated.example/report' })).toBe('unknown');
    expect(getStorySourceFamily({ sourceGroup, url: `https://${new URL(url).hostname}.example/report` })).toBe('unknown');
  });
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

  it('retains independent, distinctly dated publisher rows from genuine origins', () => {
    const story = {
      source: 'TOI',
      sourceGroup: 'toi',
      url: 'https://timesofindia.indiatimes.com/india/shelter-closures',
      publishedAt: NOW - (5 * 60 * 60 * 1000),
    };
    const other = {
      source: 'Reuters',
      url: 'https://www.reuters.com/world/evacuation-closures',
      publishedAt: NOW - (4 * 60 * 60 * 1000),
    };
    const signals = extractTopStorySignals({ ...story, newsEvidenceRows: [story, other] }, context());
    expect(signals.sourceCount).toBe(2);
    expect(signals.independentEvidenceCount).toBe(1);
  });

  it('requires a publisher domain boundary for evidence and source-quality credit', () => {
    const reutersLookalike = {
      id: 'reuters-lookalike', source: 'Reuters', url: 'https://reuters.example.test/news',
      publishedAt: NOW - 60_000,
    };
    const bbcLookalike = {
      id: 'bbc-lookalike', source: 'BBC News', url: 'https://bbc.co.uk.example.test/news',
      publishedAt: NOW - 60_000,
    };

    expect(getStorySourceFamily(reutersLookalike)).toBe('unknown');
    expect(getStorySourceFamily(bbcLookalike)).toBe('unknown');
    expect(getStorySourceFamily({ source: 'Reuters', canonicalUrl: reutersLookalike.url })).toBe('unknown');
    expect(getSourceQualityScore(reutersLookalike)).toBe(0.48);
    const signals = extractTopStorySignals({
      ...reutersLookalike, newsEvidenceRows: [reutersLookalike, bbcLookalike],
    }, context());
    expect(signals.independentEvidenceCount).toBe(0);

    expect(getStorySourceFamily({ source: 'Unknown', url: 'https://feeds.reuters.com/world' })).toBe('reuters');
    expect(getStorySourceFamily({ source: 'Unknown', url: 'https://www.bbc.co.uk/news' })).toBe('bbc');
    expect(getStorySourceFamily({
      source: 'Google News', url: 'https://news.google.com/rss/articles/opaque',
      title: 'An article - Reuters',
    })).toBe('google_news');
    expect(getStorySourceFamily({
      source: 'Google News', url: 'https://news.google.com/rss?url=https%3A%2F%2Fwww.bbc.co.uk%2Fnews',
    })).toBe('bbc');
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
