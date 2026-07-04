import assert from 'node:assert/strict';
import { rankTopStoriesByRecency } from './topStoriesRecency.js';

const now = Date.UTC(2026, 6, 4, 12, 0, 0);
const hoursAgo = hours => now - hours * 60 * 60 * 1000;
const ids = rows => rows.map(row => row.id);

function story(id, hours, extra = {}) {
  return {
    id,
    title: id,
    url: `https://example.com/${id}`,
    impactScore: 10,
    publishedAt: hours === null ? undefined : hoursAgo(hours),
    ...extra,
  };
}

function testFreshStoriesBeatRawOrder() {
  const ranked = rankTopStoriesByRecency([
    story('old-first', 30, { impactScore: 80 }),
    story('fresh-second', 1, { impactScore: 5 }),
  ], { nowMs: now });
  assert.equal(ranked[0].id, 'fresh-second');
}

function testOldStoriesAreDemotedBehindFresh() {
  const ranked = rankTopStoriesByRecency([
    story('old-high-impact', 25, { impactScore: 100 }),
    story('fresh-low-impact', 2, { impactScore: 1 }),
  ], { nowMs: now });
  assert.deepEqual(ids(ranked), ['fresh-low-impact', 'old-high-impact']);
}

function testBreakingPinIsFreshnessBounded() {
  const ranked = rankTopStoriesByRecency([
    story('stale-breaking', 8, { isBreaking: true, breakingScore: 99 }),
    story('fresh-breaking', 1, { isBreaking: true, breakingScore: 2 }),
    story('fresh-plain', 2, { impactScore: 50 }),
  ], { nowMs: now });
  assert.equal(ranked[0].id, 'fresh-breaking');
  assert.ok(ids(ranked).indexOf('stale-breaking') > ids(ranked).indexOf('fresh-plain'));
}

function testUndatedStoriesDoNotOutrankFreshDatedStories() {
  const ranked = rankTopStoriesByRecency([
    story('undated-high-impact', null, { impactScore: 1000 }),
    story('fresh-dated', 1, { impactScore: 1 }),
  ], { nowMs: now });
  assert.deepEqual(ids(ranked), ['fresh-dated', 'undated-high-impact']);
}

function testLowConfidenceTimestampsBehaveAsUndated() {
  const ranked = rankTopStoriesByRecency([
    story('fallback-timestamp', 0, {
      impactScore: 1000,
      publishedAtSource: 'fetch_time_fallback',
      timestampConfidence: 'low',
    }),
    story('trusted-fresh', 2, { impactScore: 1 }),
  ], { nowMs: now });
  assert.deepEqual(ids(ranked), ['trusted-fresh', 'fallback-timestamp']);
}

testFreshStoriesBeatRawOrder();
testOldStoriesAreDemotedBehindFresh();
testBreakingPinIsFreshnessBounded();
testUndatedStoriesDoNotOutrankFreshDatedStories();
testLowConfidenceTimestampsBehaveAsUndated();

console.log('PASS: Main Top Stories recency guardrail');
