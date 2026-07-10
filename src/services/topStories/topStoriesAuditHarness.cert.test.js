import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildTopStoriesAuditSnapshot,
  buildTopStoriesGoldenReviewSnapshot,
  compareTopStoriesAuditSnapshots,
  summarizeTopStoriesAuditSnapshot,
} from './topStoriesAuditHarness.js';
import {
  TOP_STORIES_REGRESSION_INPUT,
  TOP_STORIES_REGRESSION_STORIES,
  TOP_STORIES_REGRESSION_TOP_FEED,
} from './fixtures/topStoriesRegressionFixtures.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe('NW-RANK-004 Top Stories audit harness', () => {
  it('generates deterministic golden and actual snapshots', () => {
    expect(buildTopStoriesGoldenReviewSnapshot()).toEqual(buildTopStoriesGoldenReviewSnapshot());
    expect(buildTopStoriesAuditSnapshot()).toEqual(buildTopStoriesAuditSnapshot());
  });

  it('matches the committed golden review snapshot', () => {
    const actual = buildTopStoriesAuditSnapshot();
    const expected = buildTopStoriesGoldenReviewSnapshot();
    const result = compareTopStoriesAuditSnapshots(actual, expected);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports ok=true for matching snapshots', () => {
    const actual = buildTopStoriesAuditSnapshot();
    const result = compareTopStoriesAuditSnapshots(actual, clone(actual));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports ok=false for ranked-order drift', () => {
    const actual = buildTopStoriesAuditSnapshot();
    const expected = clone(buildTopStoriesGoldenReviewSnapshot());
    expected.rankedIdsInOrder = [...expected.rankedIdsInOrder].reverse();
    const result = compareTopStoriesAuditSnapshots(actual, expected);
    expect(result.ok).toBe(false);
    expect(result.errors.some(error => error.includes('ranked ID order'))).toBe(true);
  });

  it('reports ok=false for missing required explanation fields', () => {
    const actual = clone(buildTopStoriesAuditSnapshot());
    const expected = buildTopStoriesGoldenReviewSnapshot();
    delete actual.explanationRows[0].score;
    const result = compareTopStoriesAuditSnapshots(actual, expected);
    expect(result.ok).toBe(false);
    expect(result.errors.some(error => error.includes('missing fields'))).toBe(true);
  });

  it('includes stale/expired and low-confidence evidence', () => {
    const snapshot = buildTopStoriesAuditSnapshot();
    expect(snapshot.rejectedExpiredIds).toContain('stale-expired-story');
    expect(snapshot.rejectedExpiredIds).toContain('low-confidence-story');
    expect(snapshot.penalizedIds).toContain('stale-expired-story');
    expect(snapshot.penalizedIds).toContain('low-confidence-story');
  });

  it('includes entertainment promo, top-feed, duplicate-cluster, and local public alert evidence', () => {
    const snapshot = buildTopStoriesAuditSnapshot();
    expect(snapshot.penalizedIds).toContain('god-of-war-promo');
    expect(snapshot.topFeedBoostedIds).toContain('source-diverse-top-feed');
    expect(snapshot.topFeedBoostedIds).toContain('same-source-top-feed-spam');
    expect(snapshot.duplicateClusterRepresentatives).toEqual([
      {
        clusterKey: 'cyclone-alert-cluster',
        representativeId: 'clustered-duplicate-a',
        candidateIds: ['clustered-duplicate-a', 'clustered-duplicate-b'],
      },
    ]);
    expect(snapshot.rankedIdsInOrder).toContain('local-public-alert');
  });

  it('does not mutate input fixtures', () => {
    const storiesBefore = JSON.stringify(TOP_STORIES_REGRESSION_STORIES);
    const topFeedBefore = JSON.stringify(TOP_STORIES_REGRESSION_TOP_FEED);
    const inputBefore = JSON.stringify(TOP_STORIES_REGRESSION_INPUT);
    buildTopStoriesAuditSnapshot(TOP_STORIES_REGRESSION_INPUT);
    expect(JSON.stringify(TOP_STORIES_REGRESSION_STORIES)).toBe(storiesBefore);
    expect(JSON.stringify(TOP_STORIES_REGRESSION_TOP_FEED)).toBe(topFeedBefore);
    expect(JSON.stringify(TOP_STORIES_REGRESSION_INPUT)).toBe(inputBefore);
  });

  it('summarizes the snapshot without explanation-row noise', () => {
    const snapshot = buildTopStoriesAuditSnapshot();
    expect(summarizeTopStoriesAuditSnapshot(snapshot)).toEqual({
      fixtureVersion: snapshot.fixtureVersion,
      rankedIdsInOrder: snapshot.rankedIdsInOrder,
      slotBandCounts: snapshot.slotBandCounts,
      eventTypeCounts: snapshot.eventTypeCounts,
      topFeedBoostedIds: snapshot.topFeedBoostedIds,
      penalizedIds: snapshot.penalizedIds,
      rejectedExpiredIds: snapshot.rejectedExpiredIds,
    });
  });

  it('keeps audit harness and golden snapshot local', () => {
    const harnessSource = readFileSync(new URL('./topStoriesAuditHarness.js', import.meta.url), 'utf8');
    const goldenSource = readFileSync(new URL('./fixtures/topStoriesGoldenReviewSnapshot.js', import.meta.url), 'utf8');
    expect(harnessSource).not.toMatch(/\bfetch\s*\(/);
    expect(harnessSource).not.toMatch(/XMLHttpRequest|WebSocket/);
    expect(goldenSource).not.toMatch(/\bfetch\s*\(/);
    expect(goldenSource).not.toMatch(/XMLHttpRequest|WebSocket/);
  });
});
