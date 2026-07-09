import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildTopFeedSnapshotSignalMap,
  explainTopFeedSignal,
  getTopFeedIdentity,
  mergeTopFeedSignalsIntoStories,
  normalizeTopFeedSnapshotRows,
} from './topStoriesTopFeedSignals.js';

function row(id, extra = {}) {
  return {
    id,
    title: `Flood evacuation alert ${id}`,
    source: `Source ${id}`,
    sourceGroup: `source-${id}`,
    topFeedRank: 1,
    topFeedSource: 'snapshot-a',
    ...extra,
  };
}

describe('NW-RANK-002 top-feed snapshot signals', () => {
  it('normalizes the same snapshot input stably', () => {
    const input = [row('b', { topFeedRank: 2 }), row('a', { topFeedRank: 1 })];
    expect(normalizeTopFeedSnapshotRows(input)).toEqual(normalizeTopFeedSnapshotRows(input));
    expect(normalizeTopFeedSnapshotRows(input).map(item => item.id)).toEqual(['a', 'b']);
  });

  it('filters invalid rows safely', () => {
    const normalized = normalizeTopFeedSnapshotRows([null, {}, { title: '   ' }, row('valid')]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].id).toBe('valid');
  });

  it('caps duplicate rows instead of counting them linearly', () => {
    const spam = Array.from({ length: 20 }, () => row('same', { source: 'Same Source', sourceGroup: 'same', topFeedRank: 1 }));
    const [signal] = normalizeTopFeedSnapshotRows(spam);
    expect(signal.topFeedHits).toBeGreaterThan(1);
    expect(signal.topFeedHits).toBeLessThan(3);
    expect(signal.topFeedHits).toBeLessThan(20);
  });

  it('gives source-diverse evidence stronger bounded consensus than same-source spam', () => {
    const spam = normalizeTopFeedSnapshotRows(Array.from({ length: 12 }, () => row('alert', { sourceGroup: 'same' })))[0];
    const diverse = normalizeTopFeedSnapshotRows([
      row('alert', { sourceGroup: 'source-a', topFeedSource: 'feed-a' }),
      row('alert', { sourceGroup: 'source-b', topFeedSource: 'feed-b' }),
      row('alert', { sourceGroup: 'source-c', topFeedSource: 'feed-c' }),
    ])[0];
    expect(diverse.topFeedHits).toBeGreaterThan(spam.topFeedHits);
    expect(diverse.topFeedConsensusScore).toBeGreaterThan(spam.topFeedConsensusScore);
    expect(diverse.topFeedConsensusScore).toBeLessThanOrEqual(1);
  });

  it('does not mutate input rows or candidate stories', () => {
    const snapshotRows = Object.freeze([Object.freeze(row('immutable'))]);
    const stories = Object.freeze([Object.freeze(row('immutable', { topFeedRank: undefined }))]);
    const beforeRows = JSON.stringify(snapshotRows);
    const beforeStories = JSON.stringify(stories);
    const merged = mergeTopFeedSignalsIntoStories(stories, snapshotRows);
    expect(JSON.stringify(snapshotRows)).toBe(beforeRows);
    expect(JSON.stringify(stories)).toBe(beforeStories);
    expect(merged[0]).not.toBe(stories[0]);
    expect(merged[0].topFeedHits).toBeGreaterThan(0);
  });

  it('supports id, canonicalId, url/link, and title identity keys', () => {
    const map = buildTopFeedSnapshotSignalMap([
      row('id-story'),
      row('', { id: undefined, canonicalId: 'canonical-story' }),
      row('', { id: undefined, url: 'https://Example.com/path/story?utm=1' }),
      row('', { id: undefined, link: 'https://example.com/linked/story#frag' }),
      row('', { id: undefined, title: 'Unique Civic Alert' }),
    ]);
    expect(map.has('id-story')).toBe(true);
    expect(map.has('canonical-story')).toBe(true);
    expect(map.has('https://example.com/path/story')).toBe(true);
    expect(map.has('https://example.com/linked/story')).toBe(true);
    expect(map.has('Unique Civic Alert')).toBe(true);
    expect(map.has('unique civic alert')).toBe(true);
  });

  it('returns explainable bounded signal metadata', () => {
    const [signal] = normalizeTopFeedSnapshotRows([row('explainable')]);
    expect(getTopFeedIdentity(signal)).toBe('explainable');
    expect(explainTopFeedSignal(signal)).toContain('identity=explainable');
    expect(signal.topFeedRankScore).toBeGreaterThan(0);
    expect(signal.topFeedConsensusScore).toBeLessThanOrEqual(1);
  });

  it('keeps the top-feed signal module local', () => {
    const source = readFileSync(new URL('./topStoriesTopFeedSignals.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/XMLHttpRequest|WebSocket/);
  });
});
