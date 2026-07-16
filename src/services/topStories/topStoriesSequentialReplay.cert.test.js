import { describe, expect, it } from 'vitest';
import { analyzeTopStoriesSequence } from './topStoriesSequentialReplay.js';

const START = Date.UTC(2026, 6, 16, 0, 7);
const INTERVAL = 15 * 60 * 1000;

function rank(extra = {}) {
  return {
    eventType: 'unknown',
    eventQualified: false,
    slotBand: 'rejected',
    independentEvidenceCount: 0,
    sourceCount: 1,
    normalizedScore: 0.35,
    priorityBucket: 1,
    ...extra,
  };
}

function story(identity, index, extra = {}) {
  const sourceGroup = extra.sourceGroup || `publisher-${identity}`;
  return {
    canonicalId: identity,
    id: extra.id || `${sourceGroup}-${identity}-${index}`,
    title: extra.title || `Public update for ${identity}`,
    sourceGroup,
    identityMembers: extra.identityMembers,
    clusterId: extra.clusterId,
    _topStoryRank: rank(extra._topStoryRank),
  };
}

function stableRail(index) {
  return Array.from({ length: 10 }, (_, itemIndex) =>
    story(`stable-${itemIndex}`, index));
}

function goodSourceHealth() {
  return { ok: true, complete: true, failedSourceCount: 0 };
}

function makeObservation(index, extra = {}) {
  const scheduledAt = START + index * INTERVAL;
  const runAt = scheduledAt + Number(extra.delayMs || 0);
  const displayed = extra.displayed ?? stableRail(index);
  return {
    studyId: 'pilot-1',
    observationId: extra.observationId || `observation-${index}`,
    scheduledAt: new Date(scheduledAt).toISOString(),
    runAt,
    workflowRunId: extra.workflowRunId || index + 1000,
    workflowRunAttempt: extra.workflowRunAttempt || 1,
    schemaValid: extra.schemaValid !== false,
    completenessState: extra.completenessState || 'COMPLETE',
    analyticalEligibility: extra.analyticalEligibility || 'ELIGIBLE',
    identityVersion: extra.identityVersion || (index >= 70 ? 'identity-v2' : 'identity-v1'),
    rankerVersion: extra.rankerVersion || (index >= 80 ? 'ranker-v2' : 'ranker-v1'),
    periodClassifierVersion: 'period-v1',
    sourceHealth: extra.sourceHealth || goodSourceHealth(),
    displayed,
    scoredCandidates: extra.scoredCandidates || displayed,
  };
}

function buildReplaySequence() {
  const rows = [];
  for (let index = 0; index < 104; index += 1) {
    if (index === 25) continue;
    if (index === 10) {
      const critical = story('critical-event', index, {
        sourceGroup: 'trusted-publisher',
        _topStoryRank: {
          eventType: 'public_safety',
          eventQualified: true,
          slotBand: 'primary',
          independentEvidenceCount: 2,
          sourceCount: 3,
          normalizedScore: 0.82,
          priorityBucket: 2,
        },
      });
      rows.push(makeObservation(index, {
        displayed: [critical, ...stableRail(index).slice(0, 9)],
        scoredCandidates: [critical, ...stableRail(index)],
      }));
      continue;
    }
    if (index === 20) {
      rows.push(makeObservation(index, { displayed: [], scoredCandidates: [] }));
      continue;
    }
    if (index === 30) {
      rows.push(makeObservation(index, {
        displayed: stableRail(index).slice(0, 4),
        sourceHealth: { ok: false, complete: false, failedSourceCount: 3 },
      }));
      continue;
    }
    if (index === 35) {
      rows.push(makeObservation(index, { delayMs: 10 * 60 * 1000 }));
      continue;
    }
    if (index === 40 || index === 42) {
      const combined = story('combined-event', index, {
        clusterId: 'combined-cluster',
        identityMembers: ['member-a', 'member-b'],
      });
      rows.push(makeObservation(index, {
        displayed: [combined, ...stableRail(index).slice(0, 9)],
      }));
      continue;
    }
    if (index === 41) {
      const splitA = story('split-a', index, {
        clusterId: 'part-a',
        identityMembers: ['member-a'],
      });
      const splitB = story('split-b', index, {
        clusterId: 'part-b',
        identityMembers: ['member-b'],
      });
      rows.push(makeObservation(index, {
        displayed: [splitA, splitB, ...stableRail(index).slice(0, 8)],
      }));
      continue;
    }
    if (index === 50) {
      const conflictA = story('canonical-a', index, { clusterId: 'shared-cluster' });
      const conflictB = story('canonical-b', index, { clusterId: 'shared-cluster' });
      rows.push(makeObservation(index, {
        displayed: [conflictA, conflictB, ...stableRail(index).slice(0, 8)],
      }));
      continue;
    }
    if (index === 60) {
      const changed = story('stable-0', index, {
        id: 'replacement-row',
        sourceGroup: 'replacement-publisher',
        title: 'Materially revised public update for stable zero',
      });
      rows.push(makeObservation(index, {
        displayed: [changed, ...stableRail(index).slice(1)],
      }));
      continue;
    }
    rows.push(makeObservation(index));
  }
  rows.push(makeObservation(5, {
    observationId: 'observation-5-rerun',
    workflowRunId: 9005,
    workflowRunAttempt: 2,
  }));
  return rows;
}

describe('NW-RANK-011B offline sequential replay', () => {
  it('replays 100+ observations deterministically with operational evidence', () => {
    const input = buildReplaySequence();
    const first = analyzeTopStoriesSequence(input);
    const second = analyzeTopStoriesSequence(input);

    expect(input.length).toBeGreaterThan(100);
    expect(first.canonicalObservations.length).toBeGreaterThan(100);
    expect(first).toEqual(second);
    expect(first.operationalRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'SUPERSEDED_DUPLICATE_SLOT' }),
    ]));
    expect(first.pairSets.fifteenMinute.pairs.length).toBeGreaterThan(80);
    expect(first.pairSets.sixtyMinute.canonicalPairs.length)
      .toBeLessThan(first.pairSets.sixtyMinute.pairs.length);
  });

  it('identifies active, uncertain, collapse, and identity transition intervals', () => {
    const result = analyzeTopStoriesSequence(buildReplaySequence());
    const active = result.adjacentComparisons.find(comparison =>
      comparison.period.periodClass === 'active');
    const sourceOutage = result.adjacentComparisons.find(comparison =>
      comparison.replacementPrimaryClass === 'INPUT_LOSS');
    const collapse = result.adjacentComparisons.find(comparison =>
      comparison.metrics.currentCount === 0);
    const split = result.adjacentComparisons.find(comparison =>
      comparison.identityTransitions.transitions.some(item => item.type === 'cluster_split'));
    const merge = result.adjacentComparisons.find(comparison =>
      comparison.identityTransitions.transitions.some(item => item.type === 'cluster_merge'));
    const conflict = result.adjacentComparisons.find(comparison =>
      comparison.period.reasonCodes.includes('identity_conflict'));
    const mutation = result.adjacentComparisons.find(comparison =>
      comparison.identityTransitions.transitions.some(item =>
        item.type === 'representative_source_substitution'));

    expect(active.period.reasonCodes).toContain(
      'new_independently_qualified_critical_candidate',
    );
    expect(sourceOutage.period.periodClass).toBe('uncertain');
    expect(collapse.metrics.incumbentRetention).toBe(0);
    expect(collapse.metrics.newListContinuity).toBeNull();
    expect(split.replacementPrimaryClass).toBe('IDENTITY_RESOLUTION');
    expect(merge.replacementPrimaryClass).toBe('IDENTITY_RESOLUTION');
    expect(conflict.eligibleForHeadlineKpi).toBe(false);
    expect(mutation.identityTransitions.transitions.map(item => item.type))
      .toEqual(expect.arrayContaining([
        'representative_source_substitution',
        'headline_mutation',
      ]));
  });

  it('segments residence across gaps, exits, re-entry, and version boundaries', () => {
    const result = analyzeTopStoriesSequence(buildReplaySequence());
    const stableEpisodes = result.residenceEpisodes.filter(episode =>
      episode.editorialIdentity && episode.editorialIdentity.includes('canonical_id'));
    const versionBoundaries = result.adjacentComparisons.filter(comparison =>
      comparison.identityTransitions.versionBoundary);

    expect(stableEpisodes.length).toBeGreaterThan(10);
    expect(stableEpisodes.some(episode => episode.leftCensored)).toBe(true);
    expect(stableEpisodes.some(episode => episode.rightCensored)).toBe(true);
    expect(stableEpisodes.some(episode => episode.episodeNumber > 1)).toBe(true);
    expect(versionBoundaries.length).toBeGreaterThan(0);
    expect(versionBoundaries.every(comparison =>
      comparison.eligibleForHeadlineKpi === false,
    )).toBe(true);
  });
});
