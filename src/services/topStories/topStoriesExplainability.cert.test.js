import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getTopStoriesPolicy } from './topStoriesPolicy.js';
import { rankTopStories, scoreTopStoryCandidate } from './topStoriesRanker.js';
import { buildTopFeedSignalMap } from './topStoriesSignals.js';
import {
  explainRankedTopStory,
  explainTopStoriesList,
  getTopStoryAuditFields,
  summarizeTopStoriesRegressionRun,
} from './topStoriesExplainability.js';
import {
  TOP_STORIES_FIXTURE_NOW,
  TOP_STORIES_REGRESSION_INPUT,
  TOP_STORIES_REGRESSION_STORIES,
  TOP_STORIES_REGRESSION_TOP_FEED,
} from './fixtures/topStoriesRegressionFixtures.js';

const ids = rows => rows.map(row => row.id);

function rankFixture() {
  return rankTopStories(TOP_STORIES_REGRESSION_INPUT, { limit: 25 });
}

function fixtureById(id) {
  return TOP_STORIES_REGRESSION_STORIES.find(story => story.id === id);
}

function scoreFixture(id) {
  const policy = getTopStoriesPolicy();
  return scoreTopStoryCandidate(fixtureById(id), {
    policy,
    nowMs: TOP_STORIES_FIXTURE_NOW,
    topFeedSignalMap: buildTopFeedSignalMap(TOP_STORIES_REGRESSION_TOP_FEED),
  });
}

describe('NW-RANK-003 Top Stories explainability', () => {
  it('returns deterministic explanations for the same ranked input', () => {
    const ranked = rankFixture();
    expect(explainTopStoriesList(ranked)).toEqual(explainTopStoriesList(ranked));
    expect(summarizeTopStoriesRegressionRun(ranked)).toEqual(summarizeTopStoriesRegressionRun(ranked));
  });

  it('includes auditor-facing rank metadata fields', () => {
    const [first] = explainTopStoriesList(rankFixture());
    expect(first).toMatchObject({
      rank: 1,
      id: expect.any(String),
      title: expect.any(String),
      score: expect.any(Number),
      slotBand: expect.any(String),
      eventType: expect.any(String),
      freshnessScore: expect.any(Number),
      consensusScore: expect.any(Number),
      penalties: expect.any(Number),
      sourceCount: expect.any(Number),
      topFeedHits: expect.any(Number),
      explanation: expect.any(String),
    });
    expect(first.explanation).toContain('score=');
    expect(first.explanation).toContain('sourceCount=');
    expect(first.explanation).toContain('topFeedHits=');
  });

  it('does not mutate ranked story input', () => {
    const ranked = rankFixture();
    const before = JSON.stringify(ranked);
    const explained = explainTopStoriesList(ranked);
    expect(JSON.stringify(ranked)).toBe(before);
    expect(explained[0]).not.toBe(ranked[0]);
  });

  it('explains stale and low-confidence stories as non-primary', () => {
    const stale = explainRankedTopStory(scoreFixture('stale-expired-story'));
    const low = explainRankedTopStory(scoreFixture('low-confidence-story'));
    expect(stale.slotBand).toBe('expired');
    expect(stale.nonPrimaryReason).toBe('older-than-fallback-window');
    expect(low.slotBand).toBe('rejected');
    expect(low.timestampConfidence).toBe('low');
    expect(low.nonPrimaryReason).toBe('low-timestamp-confidence');
  });

  it('explains entertainment promo classification and penalty', () => {
    const promo = explainRankedTopStory(scoreFixture('god-of-war-promo'));
    expect(promo.eventType).toBe('entertainment_promo');
    expect(promo.penalties).toBeGreaterThan(0);
    expect(promo.highlights).toContain('entertainment-promo-guard');
    expect(promo.highlights).toContain('penalty-applied');
  });

  it('shows bounded top-feed contribution for boosted hard news', () => {
    const boosted = explainTopStoriesList(rankFixture())
      .find(item => item.id === 'source-diverse-top-feed');
    expect(boosted).toBeTruthy();
    expect(boosted.topFeedHits).toBeGreaterThan(0);
    expect(boosted.consensusScore).toBeLessThanOrEqual(1);
    expect(boosted.highlights).toContain('bounded-top-feed-signal');
  });

  it('shows capped consensus for same-source top-feed spam fixture', () => {
    const spam = explainTopStoriesList(rankFixture())
      .find(item => item.id === 'same-source-top-feed-spam');
    expect(spam).toBeTruthy();
    expect(spam.topFeedHits).toBeGreaterThan(0);
    expect(spam.topFeedHits).toBeLessThan(3);
    expect(spam.consensusScore).toBeLessThanOrEqual(1);
  });

  it('keeps clustered duplicate fixture to one ranked explanation', () => {
    const explained = explainTopStoriesList(rankFixture());
    const clustered = explained.filter(item => item.clusterKey === 'cyclone-alert-cluster');
    expect(clustered).toHaveLength(1);
    expect(['clustered-duplicate-a', 'clustered-duplicate-b']).toContain(clustered[0].id);
  });

  it('preserves rankTopStories order in list explanations and summaries', () => {
    const ranked = rankFixture();
    const explained = explainTopStoriesList(ranked);
    const summary = summarizeTopStoriesRegressionRun(ranked);
    expect(ids(explained)).toEqual(ids(ranked));
    expect(summary.idsInOrder).toEqual(ids(ranked));
  });

  it('exposes local public alert fixture explanation', () => {
    const local = explainTopStoriesList(rankFixture())
      .find(item => item.id === 'local-public-alert');
    expect(local).toBeTruthy();
    expect(local.title).toContain('Muscat public closure alert');
    expect(local.slotBand).toBe('primary');
  });

  it('keeps explainability module local and fixtures static', () => {
    const explainabilitySource = readFileSync(new URL('./topStoriesExplainability.js', import.meta.url), 'utf8');
    const fixtureSource = readFileSync(new URL('./fixtures/topStoriesRegressionFixtures.js', import.meta.url), 'utf8');
    expect(explainabilitySource).not.toMatch(/\bfetch\s*\(/);
    expect(explainabilitySource).not.toMatch(/XMLHttpRequest|WebSocket/);
    expect(fixtureSource).not.toMatch(/^import\s/m);
    expect(fixtureSource).not.toMatch(/\bfetch\s*\(/);
    expect(fixtureSource).not.toMatch(/XMLHttpRequest|WebSocket/);
  });

  it('returns stable audit fields for single stories', () => {
    const story = rankFixture()[0];
    expect(getTopStoryAuditFields(story)).toEqual(getTopStoryAuditFields(story));
  });
});
