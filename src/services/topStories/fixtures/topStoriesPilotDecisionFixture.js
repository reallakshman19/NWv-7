import { getPilotExpectedDates } from '../../../../scripts/top-stories-shadow/pilotDecision.mjs';
import {
  buildTopStoriesVersionSegmentKey,
  TOP_STORIES_NORMALIZATION_VERSION,
} from '../topStoriesVersionSegment.js';

export const PILOT_STUDY_ID = 'nw-rank-011-shadow-pilot-2026-07';
export const PILOT_READY_NOW = Date.parse('2026-07-24T03:00:00.000Z');
export const PILOT_CONFIG = Object.freeze({
  schemaVersion: 'nw-top-stories-shadow-study/v1',
  studyId: PILOT_STUDY_ID,
  observationMode: 'repository-snapshot-replay',
  runnerVersion: 'nw-top-stories-shadow-runner-v1',
  rankerVersion: 'nw-top-stories-ranker-observed-v1',
  identityVersion: 'nw-top-stories-identity-v1',
  periodClassifierVersion: 'nw-top-stories-period-classifier-v1',
  normalizationVersion: TOP_STORIES_NORMALIZATION_VERSION,
  inputContractVersion: 'nw-top-stories-repository-input/v1',
  displayDepth: 10,
  rankerLimit: 25,
  pilotStartDate: '2026-07-17',
  pilotWindowDays: 7,
  pilotDecisionNotBefore: '2026-07-24T02:30:00.000Z',
  expiryAt: '2026-08-31T23:59:59.000Z',
  owner: 'owner',
  approver: 'reviewer',
});

const SEGMENT = buildTopStoriesVersionSegmentKey(PILOT_CONFIG);

function fixtureDigest(date, index) {
  const seed = `${date.replaceAll('-', '')}${String(index).padStart(2, '0')}`;
  return seed.padEnd(64, 'a').slice(0, 64);
}

function identityList(count) {
  return Array.from({ length: count }, (_, index) => `story-${index + 1}`);
}

function observationRows(date, displayedCount) {
  const start = Date.parse(`${date}T00:07:00.000Z`);
  const identities = identityList(displayedCount);
  return Array.from({ length: 96 }, (_, index) => ({
    observationId: `${date}-${index}`,
    scheduledAt: new Date(start + (index * 15 * 60 * 1000)).toISOString(),
    runAt: new Date(start + (index * 15 * 60 * 1000)).toISOString(),
    inputDigest: `digest-${date}-${Math.floor(index / 4)}`,
    normalizationVersion: TOP_STORIES_NORMALIZATION_VERSION,
    normalizationDigest: fixtureDigest(date, index),
    displayedCount,
    rankedCount: displayedCount,
    displayDepth: 10,
    displayedEditorialIdentities: identities,
    displayedResolvedIdentityCount: displayedCount,
    displayedUnresolvedIdentityCount: 0,
  }));
}

function inputPopulation(comparisonCount, median) {
  return {
    comparisonCount,
    eligibleComparisonCount: comparisonCount,
    incumbentRetention: { median },
    jaccard: { median },
    normalizedWeightedRankDisplacement: {
      median: Number.isFinite(median) ? 1 - median : null,
    },
  };
}

function normalizationEvidence(overrides = {}) {
  return {
    totalCanonicalObservations: 96,
    validNormalizationEvidenceCount: 96,
    normalizationVersionMissingCount: 0,
    normalizationVersionUnsupportedCount: 0,
    normalizationVersionMismatchCount: 0,
    normalizationDigestMissingCount: 0,
    normalizationDigestInvalidCount: 0,
    complete: true,
    ...overrides,
  };
}

function dailyReport(date, options = {}) {
  const displayedCount = options.displayedCount ?? 10;
  const lowRail = displayedCount < 8;
  const active = options.active ? 2 : 0;
  const calm15 = options.calm15 ?? 0.95;
  const calm60 = options.calm60 ?? 0.90;
  const unchanged15 = options.unchanged15 ?? calm15;
  const unchanged60 = options.unchanged60 ?? calm60;
  const bucket = displayedCount <= 3 ? '1-3' : displayedCount <= 7 ? '4-7' :
    displayedCount <= 9 ? '8-9' : '10';
  const railBuckets = { '0': 0, '1-3': 0, '4-7': 0, '8-9': 0, '10': 0, other: 0 };
  railBuckets[bucket] = 96;
  const coverage = normalizationEvidence(options.normalizationCoverage);
  const segments = options.mixedNormalization
    ? [SEGMENT, SEGMENT.replace(TOP_STORIES_NORMALIZATION_VERSION, 'normalization-v2')]
    : [SEGMENT];
  const headlineEligible = options.headlineEligible ??
    (coverage.complete && !options.mixedNormalization);
  return {
    schemaVersion: 'nw-top-stories-daily-stability-report/v1',
    studyId: PILOT_STUDY_ID,
    date,
    status: 'OBSERVED',
    coverage: { scheduleSlotCoverage: 0.96, normalizationEvidence: coverage },
    normalizationEvidenceCoverage: coverage,
    versionSegments: segments,
    segmentSummaries: segments.map(segmentKey => ({
      segmentKey,
      observationCount: options.mixedNormalization ? 48 : 96,
      validNormalizationEvidenceCount: options.mixedNormalization ? 48 : 96,
      eligibleComparisonCounts: { fifteenMinute: 80, sixtyMinute: 70 },
      headlineKpiEligible: headlineEligible && segmentKey === SEGMENT,
    })),
    headlineKpiEligibility: {
      eligible: headlineEligible,
      reasonCodes: headlineEligible ? [] : [options.normalizationReason ||
        (options.mixedNormalization
          ? 'normalization_version_boundary' : 'normalization_evidence_incomplete')],
    },
    stability: {
      fifteenMinute: {
        canonicalNonOverlapping: {
          calm: { incumbentRetention: { count: 40, median: calm15 } },
          periodClassCounts: { calm: 40, active },
        },
      },
      sixtyMinute: {
        canonicalNonOverlapping: {
          calm: { incumbentRetention: { count: 20, median: calm60 } },
          periodClassCounts: { calm: 20, active: options.active ? 1 : 0 },
        },
      },
    },
    railAndFunnel: {
      observationCount: 96,
      displayedCount: { median: displayedCount, minimum: displayedCount },
      rankedCount: { median: displayedCount, minimum: displayedCount },
      railBuckets,
      belowSoftReviewDepth: { count: lowRail ? 96 : 0, fraction: lowRail ? 1 : 0 },
      underfilledAgainstDisplayDepth: {
        count: displayedCount < 10 ? 96 : 0,
        fraction: displayedCount < 10 ? 1 : 0,
      },
      finalReasonCounts: lowRail
        ? { unqualified_without_independent_evidence: 150 }
        : { displayed: 960 },
      candidateBuildReasonCounts: { candidate_created: 1200, duplicate_identity: 20 },
      categoryReasonCounts: lowRail ? { evidence: 150, duplicate: 20 } : { duplicate: 20 },
      observations: observationRows(date, displayedCount),
    },
    inputChange: {
      fifteenMinute: {
        canonicalNonOverlapping: {
          unchangedInput: inputPopulation(40, unchanged15),
          changedInput: inputPopulation(0, null),
          unknownInput: inputPopulation(0, null),
        },
      },
      sixtyMinute: {
        canonicalNonOverlapping: {
          unchangedInput: inputPopulation(20, unchanged60),
          changedInput: inputPopulation(0, null),
          unknownInput: inputPopulation(0, null),
        },
      },
    },
  };
}

function validation(date, decision) {
  return {
    schemaVersion: 'nw-top-stories-24h-operational-validation/v1',
    studyId: PILOT_STUDY_ID,
    date,
    decision,
    metrics: {
      artifactEmissionRate: 0.98,
      completeRunRate: 0.97,
      analyticalEligibilityRate: 0.96,
      p90ScheduleDelaySeconds: 240,
    },
  };
}

export function buildPilotArtifacts(options = {}) {
  const records = [];
  getPilotExpectedDates(PILOT_CONFIG).forEach((date, index) => {
    if (options.missingDailyIndex !== index) {
      const normalizationDefect = options.normalizationDefectIndex === index;
      records.push({
        type: 'daily',
        artifactId: 100 + index,
        studyId: PILOT_STUDY_ID,
        date,
        schemaValid: true,
        dailyReport: dailyReport(date, {
          displayedCount: options.displayedCount,
          calm15: options.calm15,
          calm60: options.calm60,
          unchanged15: options.unchanged15,
          unchanged60: options.unchanged60,
          active: (options.activeDays || []).includes(index),
          mixedNormalization: options.mixedNormalizationIndex === index,
          headlineEligible: normalizationDefect ? false : undefined,
          normalizationCoverage: normalizationDefect ? {
            validNormalizationEvidenceCount: 95,
            normalizationDigestMissingCount: 1,
            complete: false,
          } : undefined,
          normalizationReason: normalizationDefect
            ? 'normalization_digest_missing' : undefined,
        }),
      });
    }
    const decision = options.failIndex === index ? 'FAIL' :
      options.warningIndex === index ? 'PASS_WITH_WARNINGS' : 'PASS';
    records.push({
      type: 'validation',
      artifactId: 200 + index,
      studyId: PILOT_STUDY_ID,
      date,
      schemaValid: true,
      validation: validation(date, decision),
    });
  });
  return records;
}
