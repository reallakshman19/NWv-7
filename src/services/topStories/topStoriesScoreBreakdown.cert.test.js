import { describe, expect, it } from 'vitest';
import { getTopStoriesPolicy } from './topStoriesPolicy.js';
import {
  evaluateTopStories,
  scoreTopStoryCandidate,
} from './topStoriesRanker.js';
import {
  buildTopStoryScoreBreakdown,
  getThresholdMargin,
} from './topStoriesScoreBreakdown.js';

const NOW = Date.UTC(2026, 6, 8, 8, 0, 0);
const HOUR_MS = 60 * 60 * 1000;

function seattleStory(overrides = {}) {
  return {
    id: 'seattle-shooting',
    title: 'Seattle food festival shooting leaves 2 killed and 5 people injured',
    source: 'Times of India',
    sourceGroup: 'toi',
    sourceCount: 1,
    sourceSection: 'india',
    publishedAt: NOW - 4.81 * HOUR_MS,
    timestampConfidence: 'high',
    ...overrides,
  };
}

describe('Top Stories score and evidence provenance', () => {
  it('uses one exact arithmetic result for score diagnostics', () => {
    const policy = getTopStoriesPolicy();
    const result = buildTopStoryScoreBreakdown({
      freshnessScore: 0.599,
      publicInterestScore: 0.96,
      consensusScore: 0,
      breakingLiveScore: 0,
      sourceQualityScore: 0.48,
      locationRelevanceScore: 0.42,
      penalties: 0,
      policy,
    });
    const contributionSum = Object.values(result.contributions)
      .reduce((sum, value) => sum + value, 0);

    expect(result.contributionTotal).toBe(contributionSum);
    expect(result.rawScore).toBe(contributionSum - result.penalties);
    expect(result.normalizedScore)
      .toBe(result.rawScore / result.maxWeightedScore);
    expect(getThresholdMargin(result.normalizedScore, 0.4))
      .toBe(result.normalizedScore - 0.4);
  });

  it('exposes the Seattle score, margin, and story-only geography evidence', () => {
    const scored = scoreTopStoryCandidate(seattleStory(), { nowMs: NOW });
    const rank = scored._topStoryRank;

    expect(rank.scoreBreakdown.rawScore).toBe(rank.score);
    expect(rank.scoreBreakdown.normalizedScore).toBe(rank.normalizedScore);
    expect(rank.locationRelevanceScore).toBe(0.42);
    expect(rank.locationRelevanceTarget).toBe('generic');
    expect(rank.locationRelevanceEvidence.map(item => item.field))
      .not.toContain('sourceSection');
    expect(rank.thresholdMargin).toBe(rank.normalizedScore - 0.4);
    expect(rank.thresholdMargin).toBeGreaterThan(0);
    expect(rank.admissionReason)
      .toBe('mature_nonlocal_critical_without_evidence');
  });

  it('assigns authoritative rank after comparator sorting', () => {
    const evaluation = evaluateTopStories({
      nowMs: NOW,
      sectionItems: {
        world: [
          seattleStory(),
          seattleStory({
            id: 'fresh-cyclone',
            title: 'Cyclone landfall warning orders public evacuations',
            source: 'Reuters',
            sourceGroup: 'Reuters',
            publishedAt: NOW - HOUR_MS,
          }),
        ],
      },
    });

    expect(evaluation.scoredCandidates.map(item => (
      item._topStoryRank.authoritativeRank
    ))).toEqual([1, 2]);
  });
});
