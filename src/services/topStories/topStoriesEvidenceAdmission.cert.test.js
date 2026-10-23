import { describe, expect, it } from 'vitest';
import {
  getMatureEvidenceDecision,
} from './topStoriesEvidenceAdmission.js';
import { scoreTopStoryCandidate } from './topStoriesRanker.js';

const NOW = Date.UTC(2026, 6, 8, 8, 0, 0);
const HOUR_MS = 60 * 60 * 1000;

function signals(overrides = {}) {
  return {
    locationRelevanceScore: 0.42,
    sourceQualityScore: 0.48,
    sourceCount: 1,
    topFeedCorroborationHits: 0,
    hasIndependentEvidence: false,
    ...overrides,
  };
}

function decision(overrides = {}) {
  return getMatureEvidenceDecision({
    ageBand: 'secondary',
    eventType: 'public_safety',
    signals: signals(),
    ...overrides,
  });
}

function seattleStory(overrides = {}) {
  return {
    id: 'seattle-shooting',
    title: 'Seattle food festival shooting leaves 2 killed and 5 people injured',
    source: 'Times of India',
    sourceGroup: 'toi',
    sourceCount: 1,
    publishedAt: NOW - 4.81 * HOUR_MS,
    timestampConfidence: 'high',
    ...overrides,
  };
}

describe('non-local critical-event evidence policy', () => {
  it('rejects a weak single-source mature non-local critical event', () => {
    expect(decision()).toEqual({
      allowed: false,
      applies: true,
      evidenceClass: 'missing',
      reason: 'mature_nonlocal_critical_without_evidence',
    });
  });

  it('accepts independent or authoritative evidence', () => {
    expect(decision({ signals: signals({ sourceCount: 2 }) }).evidenceClass)
      .toBe('independent');
    expect(decision({ signals: signals({ sourceQualityScore: 1 }) }).evidenceClass)
      .toBe('authoritative');
  });

  it.each([
    {
      label: 'local event',
      overrides: { signals: signals({ locationRelevanceScore: 0.82 }) },
    },
    { label: 'non-critical event', overrides: { eventType: 'governance' } },
  ])('does not apply to $label', ({ overrides }) => {
    expect(decision(overrides)).toEqual({
      allowed: true,
      applies: false,
      evidenceClass: 'not_required',
    });
  });

  it('rejects a weak single-source non-local critical event inside the primary window', () => {
    expect(decision({
      ageBand: 'primary',
      signals: signals({ ageMinutes: 90 }),
    })).toEqual({
      allowed: false,
      applies: true,
      evidenceClass: 'missing',
      reason: 'nonlocal_critical_without_evidence',
    });
  });

  it('keeps a trusted <=15 minute cold-start critical report eligible', () => {
    expect(decision({
      ageBand: 'primary',
      signals: signals({
        ageMinutes: 10,
        sourceQualityScore: 0.8,
      }),
    })).toEqual({
      allowed: true,
      applies: true,
      evidenceClass: 'cold_start',
    });
  });

  it('rejects the Seattle regression through the production ranker', () => {
    const scored = scoreTopStoryCandidate(seattleStory(), { nowMs: NOW });

    expect(scored._topStoryRank.eventType).toBe('public_safety');
    expect(scored._topStoryRank.ageBand).toBe('secondary');
    // No registry tier is available: preserve the legacy TOI family score.
    expect(scored._topStoryRank.sourceQualityScore).toBe(0.48);
    expect(scored._topStoryRank.independentEvidenceCount).toBe(0);
    expect(scored._topStoryRank.slotBand).toBe('rejected');
    expect(scored._topStoryRank.admissionReason)
      .toBe('mature_nonlocal_critical_without_evidence');
  });

  it('keeps corroborated and authoritative Seattle variants eligible', () => {
    const corroborated = scoreTopStoryCandidate(seattleStory({
      sourceCount: 2,
      allSources: ['Times of India', 'Reuters'],
    }), { nowMs: NOW });
    const authoritative = scoreTopStoryCandidate(seattleStory({
      source: 'Reuters',
      sourceGroup: 'Reuters',
    }), { nowMs: NOW });

    expect(corroborated._topStoryRank.slotBand).toBe('secondary');
    expect(authoritative._topStoryRank.slotBand).toBe('secondary');
  });
});
