import { describe, expect, it } from 'vitest';
import { analyzeTopStoriesSequence } from './topStoriesSequentialReplay.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function observation(index) {
  const runAt = Date.UTC(2026, 6, 16, 0, 7 + index * 15);
  const story = {
    id: `row-${index}`,
    canonicalId: 'stable-event',
    title: 'Flood warning remains active across the district',
    sourceGroup: 'publisher',
    _topStoryRank: {
      eventType: 'public_safety',
      eventQualified: true,
      slotBand: 'primary',
      independentEvidenceCount: 1,
      sourceCount: 2,
      normalizedScore: 0.7,
    },
  };
  return {
    studyId: 'immutable-study',
    observationId: `observation-${index}`,
    scheduledAt: new Date(runAt).toISOString(),
    runAt,
    completenessState: 'COMPLETE',
    analyticalEligibility: 'ELIGIBLE',
    identityVersion: 'identity-v1',
    rankerVersion: 'ranker-v1',
    periodClassifierVersion: 'period-v1',
    sourceHealth: { ok: true, complete: true, failedSourceCount: 0 },
    displayed: [story],
    scoredCandidates: [story],
  };
}

describe('NW-RANK-011B replay immutability', () => {
  it('accepts deeply frozen observations without mutating them', () => {
    const input = deepFreeze([observation(0), observation(1)]);
    const before = JSON.stringify(input);
    const result = analyzeTopStoriesSequence(input);
    expect(result.canonicalObservations).toHaveLength(2);
    expect(JSON.stringify(input)).toBe(before);
  });
});
