import { describe, expect, it } from 'vitest';
import { buildTopStoriesPilotDecisionPack } from '../../../scripts/top-stories-shadow/pilotDecisionPack.mjs';

const STUDY = 'nw-rank-011-shadow-pilot-2026-07';
const CONFIG = {
  schemaVersion: 'nw-top-stories-shadow-study/v1',
  studyId: STUDY,
  rankerVersion: 'nw-top-stories-ranker-observed-v1',
  identityVersion: 'nw-top-stories-identity-v1',
  periodClassifierVersion: 'nw-top-stories-period-classifier-v1',
};
const SEGMENT = [
  CONFIG.studyId,
  CONFIG.rankerVersion,
  CONFIG.identityVersion,
  CONFIG.periodClassifierVersion,
].join('|');

function entry(index, canonicalActivePairs = 0) {
  const date = `2026-07-${String(17 + index).padStart(2, '0')}`;
  return {
    sourceId: `day-${index}`,
    dailyReport: {
      schemaVersion: 'nw-top-stories-daily-stability-report/v1',
      studyId: STUDY,
      date,
      versionSegments: [SEGMENT],
      coverage: {
        scheduleSlotCoverage: 0.95,
        valid15mPairs: 80,
        unchangedInput15mPairs: 20,
        valid60mPairs: 70,
        unchangedInput60mPairs: 10,
      },
      stability: {
        fifteenMinute: {
          canonicalNonOverlapping: {
            calm: { incumbentRetention: { count: 6, median: 0.94 } },
            active: { incumbentRetention: { count: canonicalActivePairs, median: 0.6 } },
          },
          overlapping: {
            active: { incumbentRetention: { count: 20, median: 0.6 } },
          },
        },
        sixtyMinute: {
          canonicalNonOverlapping: {
            calm: { incumbentRetention: { count: 3, median: 0.86 } },
            active: { incumbentRetention: { count: 0, median: null } },
          },
          overlapping: { active: { incumbentRetention: { count: 10, median: 0.5 } } },
        },
      },
      residence: { episodeCount: 12 },
      railAndFunnel: {
        observationCount: 90,
        displayedCount: { median: 9 },
        belowSoftReviewDepth: { count: 9, fraction: 0.1 },
        railBuckets: { '0': 0, '1-3': 2, '4-7': 7, '8-9': 36, '10': 45, other: 0 },
        finalReasonCounts: {},
        candidateBuildReasonCounts: { candidate_created: 90 },
      },
    },
    operationalValidation: {
      schemaVersion: 'nw-top-stories-24h-operational-validation/v1',
      studyId: STUDY,
      date,
      decision: 'PASS',
      failureReasonCodes: [],
      insufficiencyReasonCodes: [],
    },
  };
}

function expectDiagnosticAuthority(result) {
  expect(result).toMatchObject({
    decisionAuthority: false,
    diagnosticOnly: true,
    governingWorkflow: 'top_stories_shadow_pilot_decision.yml',
    governingDecisionSchema: 'nw-top-stories-seven-day-pilot-decision/v1',
    productionChangeAuthorized: false,
    persistenceChangeAuthorized: false,
    automaticPolicyChangeAuthorized: false,
  });
}

describe('Top Stories canonical pilot diagnostic pack', () => {
  it('does not accept overlapping active pairs as canonical responsiveness evidence', () => {
    const result = buildTopStoriesPilotDecisionPack(
      Array.from({ length: 7 }, (_, index) => entry(index, 0)),
      { studyConfig: CONFIG },
    );
    expect(result.metrics.active.canonicalPairs).toBe(0);
    expect(result.activeEvidenceSufficient).toBe(false);
    expect(result.decision).toBe('CONTINUE_OBSERVATION');
    expectDiagnosticAuthority(result);
  });

  it('preserves unchanged and changed input pair populations separately', () => {
    const result = buildTopStoriesPilotDecisionPack(
      Array.from({ length: 7 }, (_, index) => entry(index, 1)),
      { studyConfig: CONFIG },
    );
    expect(result.activeEvidenceSufficient).toBe(true);
    expect(result.metrics.inputChange.fifteenMinute).toEqual({
      unchangedPairs: 140,
      changedPairs: 420,
    });
    expect(result.metrics.inputChange.sixtyMinute).toEqual({
      unchangedPairs: 70,
      changedPairs: 420,
    });
    expect(result.metrics.residence.episodeCount).toBe(84);
    expect(result.decision).toBe('RETAIN_POLICY');
    expectDiagnosticAuthority(result);
  });
});
