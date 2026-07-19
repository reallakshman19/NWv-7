import { describe, expect, it } from 'vitest';
import {
  classifyTopStoriesPeriod,
  DEFAULT_TOP_STORIES_PERIOD_POLICY,
} from './topStoriesPeriodClassifier.js';
import { analyzeTopStoriesSequence } from './topStoriesSequentialReplay.js';

const SOURCE_HEALTH = Object.freeze({
  ok: true,
  complete: true,
  failedSourceCount: 0,
});
const IDENTITY_TRANSITIONS = Object.freeze({
  versionBoundary: false,
  currentStateCounts: {},
});

function criticalCandidate(id, extraRank = {}) {
  return {
    id,
    canonicalId: id,
    title: `Flood evacuation alert ${id}`,
    source: 'Trusted Publisher',
    sourceGroup: 'trusted-publisher',
    _studyIdentity: {
      editorialIdentity: `canonical_id:${id}`,
      identityState: 'IDENTITY_RESOLVED',
    },
    _topStoryRank: {
      eventType: 'public_safety',
      eventQualified: true,
      slotBand: 'primary',
      independentEvidenceCount: 1,
      sourceCount: 2,
      normalizedScore: 0.7,
      priorityBucket: 1,
      ...extraRank,
    },
  };
}

function snapshot(extra = {}) {
  return {
    completenessState: 'COMPLETE',
    analyticalEligibility: 'ELIGIBLE',
    scoredCandidates: [],
    ranked: [],
    ...extra,
  };
}

function classify({ prior, current, candidateTrace, includeOutsideRankerLimit }) {
  return classifyTopStoriesPeriod({
    priorSnapshot: prior,
    currentSnapshot: current,
    candidateTrace,
    sourceHealth: SOURCE_HEALTH,
    identityTransitions: IDENTITY_TRANSITIONS,
    classifierPolicy: { includeOutsideRankerLimit },
  });
}

function replayObservation(index, extra = {}) {
  const scheduledAt = Date.UTC(2026, 6, 19, 0, index * 15);
  return {
    studyId: 'ranker-limit-scope-study',
    observationId: `observation-${index}`,
    scheduledAt: new Date(scheduledAt).toISOString(),
    runAt: scheduledAt,
    workflowRunId: `run-${index}`,
    workflowRunAttempt: 1,
    schemaValid: true,
    completenessState: 'COMPLETE',
    analyticalEligibility: 'ELIGIBLE',
    identityVersion: 'identity-v1',
    rankerVersion: 'ranker-v1',
    periodClassifierVersion: 'period-v1',
    sourceHealth: SOURCE_HEALTH,
    displayed: [],
    scoredCandidates: [],
    ranked: [],
    ...extra,
  };
}

describe('NW-RANK-011M executable ranker-limit classifier scope', () => {
  it('preserves the default all-scored-candidates behavior', () => {
    const critical = criticalCandidate('outside-limit');
    const result = classify({
      prior: snapshot(),
      current: snapshot({
        scoredCandidates: [critical],
        ranked: [],
      }),
      includeOutsideRankerLimit:
        DEFAULT_TOP_STORIES_PERIOD_POLICY.includeOutsideRankerLimit,
    });

    expect(DEFAULT_TOP_STORIES_PERIOD_POLICY.includeOutsideRankerLimit)
      .toBe(true);
    expect(result.periodClass).toBe('active');
    expect(result.evidenceIds).toEqual(['canonical_id:outside-limit']);
  });

  it('excludes critical candidates outside the ranker limit when configured false', () => {
    const critical = criticalCandidate('outside-limit');
    const result = classify({
      prior: snapshot(),
      current: snapshot({
        scoredCandidates: [critical],
        ranked: [],
      }),
      includeOutsideRankerLimit: false,
    });

    expect(result.periodClass).toBe('calm');
    expect(result.reasonCodes).toEqual(['no_new_qualified_critical_event']);
    expect(result.evidenceIds).toEqual([]);
  });

  it('still detects critical candidates retained inside the ranker limit', () => {
    const critical = criticalCandidate('inside-limit');
    const result = classify({
      prior: snapshot(),
      current: snapshot({
        scoredCandidates: [critical],
        ranked: [critical],
      }),
      includeOutsideRankerLimit: false,
    });

    expect(result.periodClass).toBe('active');
    expect(result.reasonCodes)
      .toContain('new_independently_qualified_critical_candidate');
    expect(result.evidenceIds).toEqual(['canonical_id:inside-limit']);
  });

  it('uses ranked candidate trace evidence when the current snapshot omits it', () => {
    const critical = criticalCandidate('trace-ranked');
    const result = classify({
      prior: snapshot(),
      current: snapshot({ ranked: undefined }),
      candidateTrace: {
        scoredCandidates: [critical],
        rankedCandidates: [critical],
      },
      includeOutsideRankerLimit: false,
    });

    expect(result.periodClass).toBe('active');
    expect(result.evidenceIds).toEqual(['canonical_id:trace-ranked']);
  });

  it('fails closed when ranked population evidence is unavailable', () => {
    const critical = criticalCandidate('missing-ranked-population');
    const result = classify({
      prior: snapshot({ ranked: undefined }),
      current: snapshot({
        scoredCandidates: [critical],
        ranked: undefined,
      }),
      includeOutsideRankerLimit: false,
    });

    expect(result.periodClass).toBe('uncertain');
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'prior_ranked_candidate_population_missing',
      'current_ranked_candidate_population_missing',
    ]));
    expect(result.evidenceIds).toEqual([]);
  });

  it('keeps true and false policies distinguishable by policy digest', () => {
    const critical = criticalCandidate('policy-digest');
    const prior = snapshot();
    const current = snapshot({
      scoredCandidates: [critical],
      ranked: [],
    });
    const allScored = classify({
      prior,
      current,
      includeOutsideRankerLimit: true,
    });
    const withinLimit = classify({
      prior,
      current,
      includeOutsideRankerLimit: false,
    });

    expect(allScored.policyVersion).toBe(withinLimit.policyVersion);
    expect(allScored.policyDigest).not.toBe(withinLimit.policyDigest);
  });

  it('applies the configured scope during sequential replay', () => {
    const critical = criticalCandidate('replay-outside-limit');
    const observations = [
      replayObservation(0),
      replayObservation(1, {
        scoredCandidates: [critical],
        ranked: [],
      }),
    ];
    const allScored = analyzeTopStoriesSequence(observations, {
      classifierPolicy: { includeOutsideRankerLimit: true },
    });
    const withinLimit = analyzeTopStoriesSequence(observations, {
      classifierPolicy: { includeOutsideRankerLimit: false },
    });

    expect(allScored.adjacentComparisons[0].period.periodClass).toBe('active');
    expect(withinLimit.adjacentComparisons[0].period.periodClass).toBe('calm');
  });
});
