import { describe, expect, it } from 'vitest';
import { buildStandardTopStoriesPairSets } from './topStoriesObservationPairing.js';
import { classifyTopStoriesPeriod } from './topStoriesPeriodClassifier.js';
import { compareDisplayedTopStories } from './topStoriesStabilityMetrics.js';
import { TOP_STORIES_NORMALIZATION_VERSION } from './topStoriesVersionSegment.js';

const FIXTURE_NORMALIZATION_DIGEST = 'a'.repeat(64);

function resolved(identity) {
  return {
    _studyIdentity: {
      editorialIdentity: identity,
      identityState: 'IDENTITY_RESOLVED',
    },
  };
}

function observation(id, runAt, extra = {}) {
  return {
    observationId: id,
    studyId: 'study-1',
    runAt,
    completenessState: 'COMPLETE',
    analyticalEligibility: 'ELIGIBLE',
    identityVersion: 'identity-v1',
    rankerVersion: 'ranker-v1',
    periodClassifierVersion: 'period-v1',
    normalizationVersion: TOP_STORIES_NORMALIZATION_VERSION,
    normalizationDigest: FIXTURE_NORMALIZATION_DIGEST,
    ...extra,
  };
}

function criticalCandidate(id, extraRank = {}) {
  return {
    id,
    canonicalId: id,
    title: `Flood evacuation alert ${id}`,
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

describe('NW-RANK-011B stability metrics', () => {
  it('does not hide a 10-to-3 rail collapse', () => {
    const prior = Array.from({ length: 10 }, (_, index) => resolved(`story-${index}`));
    const current = prior.slice(0, 3);
    const metrics = compareDisplayedTopStories(prior, current);
    expect(metrics.incumbentRetention).toBe(0.3);
    expect(metrics.newListContinuity).toBe(1);
    expect(metrics.jaccard).toBe(0.3);
    expect(metrics.countDelta).toBe(-7);
    expect(metrics.entrantCount).toBe(0);
    expect(metrics.exitCount).toBe(7);
  });

  it('uses explicit null semantics for zero denominators', () => {
    const empty = compareDisplayedTopStories([], []);
    expect(empty.incumbentRetention).toBeNull();
    expect(empty.newListContinuity).toBeNull();
    expect(empty.jaccard).toBeNull();
    expect(empty.numberOneContinuity).toBeNull();
    expect(empty.normalizedWeightedRankDisplacement).toBeNull();

    const populated = compareDisplayedTopStories([], [resolved('new')]);
    expect(populated.incumbentRetention).toBeNull();
    expect(populated.newListContinuity).toBe(0);
    expect(populated.jaccard).toBe(0);
    expect(populated.numberOneContinuity).toBeNull();
  });

  it('excludes ambiguous identity from headline metrics', () => {
    const metrics = compareDisplayedTopStories(
      [resolved('stable')],
      [
        resolved('stable'),
        {
          _studyIdentity: {
            editorialIdentity: 'title:ambiguous',
            identityState: 'IDENTITY_AMBIGUOUS',
          },
        },
      ],
    );
    expect(metrics.currentCount).toBe(1);
    expect(metrics.excludedCurrentItems).toHaveLength(1);
    expect(metrics.incumbentRetention).toBe(1);
  });

  it('reports rank displacement independently from membership retention', () => {
    const prior = ['a', 'b', 'c', 'd'].map(resolved);
    const same = compareDisplayedTopStories(prior, prior);
    const reversed = compareDisplayedTopStories(prior, [...prior].reverse());
    expect(same.normalizedWeightedRankDisplacement).toBe(0);
    expect(reversed.incumbentRetention).toBe(1);
    expect(reversed.normalizedWeightedRankDisplacement).toBeGreaterThan(0);
    expect(reversed.numberOneContinuity).toBe(false);
  });
});

describe('NW-RANK-011B observation pairing', () => {
  it('builds overlapping and canonical non-overlapping pair sets', () => {
    const start = Date.UTC(2026, 6, 16, 12, 7);
    const rows = Array.from({ length: 8 }, (_, index) =>
      observation(`run-${index}`, start + index * 15 * 60 * 1000));
    const result = buildStandardTopStoriesPairSets(rows);
    expect(result.fifteenMinute.pairs.length).toBe(7);
    expect(result.fifteenMinute.canonicalPairs.length).toBeLessThanOrEqual(7);
    expect(result.sixtyMinute.pairs.length).toBeGreaterThan(0);
    expect(result.sixtyMinute.canonicalPairs.length)
      .toBeLessThan(result.sixtyMinute.pairs.length);
    expect(result.sixtyMinute.serialCorrelationNotice).toContain('serially correlated');
  });

  it('excludes incomplete anchors and version-crossing candidates', () => {
    const start = Date.UTC(2026, 6, 16, 12, 7);
    const rows = [
      observation('failed', start, { completenessState: 'FAILED' }),
      observation('v1', start + 15 * 60 * 1000),
      observation('v2', start + 30 * 60 * 1000, { identityVersion: 'identity-v2' }),
    ];
    const result = buildStandardTopStoriesPairSets(rows);
    expect(result.fifteenMinute.pairs).toHaveLength(0);
    expect(result.fifteenMinute.exclusions.map(item => item.reason))
      .toContain('incomplete_observation');
  });
});

describe('NW-RANK-011B period classification', () => {
  const sourceHealth = { ok: true, complete: true, failedSourceCount: 0 };
  const transitions = { versionBoundary: false, currentStateCounts: {} };

  it('classifies a newly corroborated critical candidate as active', () => {
    const current = criticalCandidate('critical-1');
    const result = classifyTopStoriesPeriod({
      priorSnapshot: observation('prior', 1, { scoredCandidates: [] }),
      currentSnapshot: observation('current', 2, { scoredCandidates: [current] }),
      sourceHealth,
      identityTransitions: transitions,
    });
    expect(result.periodClass).toBe('active');
    expect(result.reasonCodes)
      .toContain('new_independently_qualified_critical_candidate');
    expect(result.evidenceIds).toEqual(['canonical_id:critical-1']);
  });

  it('accepts an admitted cold-start critical candidate without corroboration', () => {
    const current = criticalCandidate('cold-start', {
      independentEvidenceCount: 0,
      sourceCount: 1,
      coldStartCritical: true,
    });
    const result = classifyTopStoriesPeriod({
      priorSnapshot: observation('prior', 1, { scoredCandidates: [] }),
      currentSnapshot: observation('current', 2, { scoredCandidates: [current] }),
      sourceHealth,
      identityTransitions: transitions,
    });
    expect(result.periodClass).toBe('active');
    expect(result.reasonCodes).toContain('new_cold_start_critical_candidate');
  });

  it('classifies ordinary candidate changes as calm', () => {
    const ordinary = criticalCandidate('ordinary', {
      eventType: 'unknown',
      eventQualified: false,
      slotBand: 'rejected',
    });
    const result = classifyTopStoriesPeriod({
      priorSnapshot: observation('prior', 1, { scoredCandidates: [] }),
      currentSnapshot: observation('current', 2, { scoredCandidates: [ordinary] }),
      sourceHealth,
      identityTransitions: transitions,
    });
    expect(result.periodClass).toBe('calm');
    expect(result.reasonCodes).toEqual(['no_new_qualified_critical_event']);
  });

  it('classifies incomplete source evidence as uncertain before metrics', () => {
    const result = classifyTopStoriesPeriod({
      priorSnapshot: observation('prior', 1, { scoredCandidates: [] }),
      currentSnapshot: observation('current', 2, { scoredCandidates: [] }),
      sourceHealth: { ok: false, complete: false },
      identityTransitions: transitions,
    });
    expect(result.periodClass).toBe('uncertain');
    expect(result.reasonCodes).toContain('source_health_incomplete');
  });
});
