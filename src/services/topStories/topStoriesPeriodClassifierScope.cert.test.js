import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  classifyTopStoriesPeriod,
  DEFAULT_TOP_STORIES_PERIOD_POLICY,
  TOP_STORIES_PERIOD_CLASSIFIER_SCOPE_VERSION,
  TOP_STORIES_PERIOD_CLASSIFIER_VERSION,
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
const CLASSIFIER_SOURCE = readFileSync(
  new URL('./topStoriesPeriodClassifier.js', import.meta.url),
  'utf8',
);
const STUDY_CONFIG = JSON.parse(readFileSync(
  new URL('../../../config/top_stories_shadow_study.json', import.meta.url),
  'utf8',
));
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
function classify({
  prior,
  current,
  candidateTrace,
  version,
  includeOutsideRankerLimit,
}) {
  const classifierPolicy = {};
  if (version !== undefined) classifierPolicy.version = version;
  if (includeOutsideRankerLimit !== undefined) {
    classifierPolicy.includeOutsideRankerLimit = includeOutsideRankerLimit;
  }
  return classifyTopStoriesPeriod({
    priorSnapshot: prior,
    currentSnapshot: current,
    candidateTrace,
    sourceHealth: SOURCE_HEALTH,
    identityTransitions: IDENTITY_TRANSITIONS,
    classifierPolicy,
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
    periodClassifierVersion: TOP_STORIES_PERIOD_CLASSIFIER_SCOPE_VERSION,
    sourceHealth: SOURCE_HEALTH,
    displayed: [],
    scoredCandidates: [],
    ranked: [],
    ...extra,
  };
}
describe('NW-RANK-011M executable ranker-limit classifier scope', () => {
  it('preserves the default v1 all-scored-candidates behavior', () => {
    const critical = criticalCandidate('default-v1');
    const result = classify({
      prior: snapshot(),
      current: snapshot({ scoredCandidates: [critical], ranked: [] }),
    });
    expect(DEFAULT_TOP_STORIES_PERIOD_POLICY).toMatchObject({
      version: TOP_STORIES_PERIOD_CLASSIFIER_VERSION,
      includeOutsideRankerLimit: true,
    });
    expect(result).toMatchObject({
      periodClass: 'active',
      policyVersion: TOP_STORIES_PERIOD_CLASSIFIER_VERSION,
      evidenceIds: ['canonical_id:default-v1'],
    });
  });
  it('fails closed when v1 requests executable within-limit scope', () => {
    const result = classify({
      prior: snapshot(),
      current: snapshot(),
      version: TOP_STORIES_PERIOD_CLASSIFIER_VERSION,
      includeOutsideRankerLimit: false,
    });
    expect(result).toMatchObject({
      periodClass: 'uncertain',
      policyVersion: TOP_STORIES_PERIOD_CLASSIFIER_VERSION,
      evidenceIds: [],
    });
    expect(result.reasonCodes).toContain('period_classifier_scope_requires_v2');
  });
  it('supports explicit v2 all-scored behavior', () => {
    const critical = criticalCandidate('v2-all-scored');
    const result = classify({
      prior: snapshot(),
      current: snapshot({ scoredCandidates: [critical], ranked: [] }),
      version: TOP_STORIES_PERIOD_CLASSIFIER_SCOPE_VERSION,
      includeOutsideRankerLimit: true,
    });
    expect(result).toMatchObject({
      periodClass: 'active',
      policyVersion: TOP_STORIES_PERIOD_CLASSIFIER_SCOPE_VERSION,
      evidenceIds: ['canonical_id:v2-all-scored'],
    });
  });
  it('excludes an outside-limit critical candidate under v2', () => {
    const critical = criticalCandidate('outside-limit');
    const result = classify({
      prior: snapshot(),
      current: snapshot({ scoredCandidates: [critical], ranked: [] }),
      version: TOP_STORIES_PERIOD_CLASSIFIER_SCOPE_VERSION,
      includeOutsideRankerLimit: false,
    });
    expect(result.periodClass).toBe('calm');
    expect(result.reasonCodes).toEqual(['no_new_qualified_critical_event']);
    expect(result.evidenceIds).toEqual([]);
  });
  it('detects an inside-limit critical candidate under v2', () => {
    const critical = criticalCandidate('inside-limit');
    const result = classify({
      prior: snapshot(),
      current: snapshot({
        scoredCandidates: [critical],
        ranked: [critical],
      }),
      version: TOP_STORIES_PERIOD_CLASSIFIER_SCOPE_VERSION,
      includeOutsideRankerLimit: false,
    });
    expect(result.periodClass).toBe('active');
    expect(result.reasonCodes)
      .toContain('new_independently_qualified_critical_candidate');
    expect(result.evidenceIds).toEqual(['canonical_id:inside-limit']);
  });
  it('uses explicit ranked candidate-trace evidence', () => {
    const critical = criticalCandidate('trace-ranked');
    const result = classify({
      prior: snapshot(),
      current: snapshot({ ranked: undefined }),
      candidateTrace: { rankedCandidates: [critical] },
      version: TOP_STORIES_PERIOD_CLASSIFIER_SCOPE_VERSION,
      includeOutsideRankerLimit: false,
    });
    expect(result.periodClass).toBe('active');
    expect(result.evidenceIds).toEqual(['canonical_id:trace-ranked']);
  });
  it('fails closed for missing prior and current ranked populations', () => {
    const result = classify({
      prior: snapshot({ ranked: undefined }),
      current: snapshot({ ranked: undefined }),
      version: TOP_STORIES_PERIOD_CLASSIFIER_SCOPE_VERSION,
      includeOutsideRankerLimit: false,
    });
    expect(result.periodClass).toBe('uncertain');
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'prior_ranked_candidate_population_missing',
      'current_ranked_candidate_population_missing',
    ]));
  });
  it('accepts explicit empty ranked populations as valid evidence', () => {
    const result = classify({
      prior: snapshot({ ranked: [] }),
      current: snapshot({ ranked: [] }),
      version: TOP_STORIES_PERIOD_CLASSIFIER_SCOPE_VERSION,
      includeOutsideRankerLimit: false,
    });
    expect(result.periodClass).toBe('calm');
    expect(result.reasonCodes).toEqual(['no_new_qualified_critical_event']);
  });
  it('does not substitute selected or displayed evidence for ranked evidence', () => {
    const critical = criticalCandidate('not-ranked');
    const result = classify({
      prior: snapshot({ ranked: undefined, selected: [] }),
      current: snapshot({
        ranked: undefined,
        selected: [critical],
        displayed: [critical],
      }),
      version: TOP_STORIES_PERIOD_CLASSIFIER_SCOPE_VERSION,
      includeOutsideRankerLimit: false,
    });
    expect(result.periodClass).toBe('uncertain');
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'prior_ranked_candidate_population_missing',
      'current_ranked_candidate_population_missing',
    ]));
  });
  it('distinguishes policy versions and scope settings by digest', () => {
    const prior = snapshot();
    const current = snapshot();
    const v1 = classify({ prior, current });
    const v2All = classify({
      prior,
      current,
      version: TOP_STORIES_PERIOD_CLASSIFIER_SCOPE_VERSION,
      includeOutsideRankerLimit: true,
    });
    const v2Ranked = classify({
      prior,
      current,
      version: TOP_STORIES_PERIOD_CLASSIFIER_SCOPE_VERSION,
      includeOutsideRankerLimit: false,
    });
    expect(new Set([
      v1.policyDigest,
      v2All.policyDigest,
      v2Ranked.policyDigest,
    ])).toHaveProperty('size', 3);
  });
  it('applies explicit v2 scope during immutable sequential replay', () => {
    const critical = criticalCandidate('replay-outside-limit');
    const observations = [
      replayObservation(0),
      replayObservation(1, {
        scoredCandidates: [critical],
        ranked: [],
      }),
    ];
    const before = JSON.stringify(observations);
    const allScored = analyzeTopStoriesSequence(observations, {
      classifierPolicy: {
        version: TOP_STORIES_PERIOD_CLASSIFIER_SCOPE_VERSION,
        includeOutsideRankerLimit: true,
      },
    });
    const withinLimit = analyzeTopStoriesSequence(observations, {
      classifierPolicy: {
        version: TOP_STORIES_PERIOD_CLASSIFIER_SCOPE_VERSION,
        includeOutsideRankerLimit: false,
      },
    });
    expect(allScored.adjacentComparisons[0].period.periodClass).toBe('active');
    expect(withinLimit.adjacentComparisons[0].period.periodClass).toBe('calm');
    expect(JSON.stringify(observations)).toBe(before);
  });
  it('guards the active pilot version and strict ranked source list', () => {
    const rankedPopulationFunction = CLASSIFIER_SOURCE.match(
      /function getRankedCandidatePopulation[\s\S]*?\n}\n/,
    )?.[0] || '';
    expect(STUDY_CONFIG.periodClassifierVersion)
      .toBe(TOP_STORIES_PERIOD_CLASSIFIER_VERSION);
    expect(rankedPopulationFunction).not.toMatch(/\bselected\b|\bdisplayed\b/);
  });
});
