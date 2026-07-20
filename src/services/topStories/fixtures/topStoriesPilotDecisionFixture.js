import { getPilotExpectedDates } from '../../../../scripts/top-stories-shadow/pilotDecision.mjs';
import {
  buildTopStoriesComparisonId,
  summarizeTopStoriesComparisons,
  summarizeTopStoriesInputChange,
  TOP_STORIES_COMPARISON_EVIDENCE_SCHEMA,
} from '../../../../scripts/top-stories-shadow/comparisonEvidence.mjs';
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
const MINUTE = 60 * 1000;
function fixtureDigest(date, index) {
  const seed = `${date.replaceAll('-', '')}${String(index).padStart(2, '0')}`;
  return seed.padEnd(64, 'a').slice(0, 64);
}
const identityList = count => Array.from({ length: count }, (_, index) => `story-${index + 1}`);
function observationRows(date, displayedCount) {
  const start = Date.parse(`${date}T00:07:00.000Z`);
  const identities = identityList(displayedCount);
  return Array.from({ length: 96 }, (_, index) => ({
    observationId: `${date}-${index}`,
    scheduledAt: new Date(start + (index * 15 * MINUTE)).toISOString(),
    runAt: new Date(start + (index * 15 * MINUTE)).toISOString(),
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
function metrics(retention) {
  return {
    incumbentRetention: retention,
    newListContinuity: retention,
    jaccard: retention,
    numberOneContinuity: true,
    normalizedWeightedRankDisplacement: Number.isFinite(retention) ? 1 - retention : null,
    countDelta: 0, entrantCount: 0, exitCount: 0,
  };
}
function comparisonRecord({ date, horizon, index, canonical, active, retention }) {
  const targetHorizonMs = horizon === 'fifteenMinute' ? 15 * MINUTE : 60 * MINUTE;
  const stepMs = horizon === 'fifteenMinute' ? 30 * MINUTE :
    canonical ? 70 * MINUTE : 25 * MINUTE;
  const offsetMs = canonical ? 0 : 5 * MINUTE;
  const anchorAt = Date.parse(`${date}T00:07:00.000Z`) + (index * stepMs) + offsetMs;
  const currentAt = anchorAt + targetHorizonMs;
  const prefix = `${date}-${horizon}-${canonical ? 'canonical' : 'overlap'}-${index}`;
  const record = {
    horizon,
    anchorObservationId: `${prefix}-anchor`,
    currentObservationId: `${prefix}-current`,
    anchorScheduledAt: new Date(anchorAt).toISOString(),
    currentScheduledAt: new Date(currentAt).toISOString(),
    anchorAt,
    currentAt,
    ownerDate: date,
    intervalMs: targetHorizonMs,
    targetHorizonMs,
    intervalErrorMs: 0,
    segmentKey: SEGMENT,
    periodClass: active ? 'active' : 'calm',
    inputClass: 'unchanged',
    eligibleForHeadlineKpi: true,
    comparisonEligibilityReasons: [],
    metrics: metrics(retention),
  };
  return { comparisonId: buildTopStoriesComparisonId({
    studyId: PILOT_STUDY_ID, ...record,
  }), ...record };
}
function comparisonEvidence(date, options) {
  const active = Boolean(options.active);
  const retention15 = options.unchanged15 ?? options.calm15 ?? 0.95;
  const retention60 = options.unchanged60 ?? options.calm60 ?? 0.90;
  const canonical15 = Array.from({ length: 40 }, (_, index) => comparisonRecord({
    date, horizon: 'fifteenMinute', index, canonical: true,
    active: active && index < 2, retention: retention15,
  }));
  const descriptive15 = Array.from({ length: 40 }, (_, index) => comparisonRecord({
    date, horizon: 'fifteenMinute', index, canonical: false,
    active: false, retention: retention15,
  }));
  const canonical60 = Array.from({ length: 20 }, (_, index) => comparisonRecord({
    date, horizon: 'sixtyMinute', index, canonical: true,
    active: active && index < 1, retention: retention60,
  }));
  const descriptive60 = Array.from({ length: 50 }, (_, index) => comparisonRecord({
    date, horizon: 'sixtyMinute', index, canonical: false,
    active: false, retention: retention60,
  }));
  const comparisonRecords = [...canonical15, ...descriptive15, ...canonical60, ...descriptive60]
    .sort((left, right) =>
      (left.horizon === right.horizon ? 0 : left.horizon === 'fifteenMinute' ? -1 : 1) ||
      left.anchorAt - right.anchorAt || left.currentAt - right.currentAt ||
      left.comparisonId.localeCompare(right.comparisonId));
  const canonicalComparisonIds = [...canonical15, ...canonical60]
    .map(row => row.comparisonId).sort();
  return {
    schemaVersion: TOP_STORIES_COMPARISON_EVIDENCE_SCHEMA,
    studyId: PILOT_STUDY_ID,
    ownerDate: date,
    comparisonRecords,
    canonicalComparisonIds,
    horizonCounts: {
      fifteenMinute: { overlapping: 80, canonicalNonOverlapping: 40 },
      sixtyMinute: { overlapping: 70, canonicalNonOverlapping: 20 },
    },
    crossHorizonPooled: false,
    accountingDelta: 0,
    accountingConserved: true,
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
  const evidence = comparisonEvidence(date, options);
  const rows = horizon => evidence.comparisonRecords.filter(row => row.horizon === horizon);
  const canonicalIds = new Set(evidence.canonicalComparisonIds);
  const canonical = horizon => rows(horizon).filter(row => canonicalIds.has(row.comparisonId));
  const buildStability = horizon => ({
    overlapping: summarizeTopStoriesComparisons(rows(horizon), horizon === 'fifteenMinute' ? 0.9 : 0.8),
    canonicalNonOverlapping: summarizeTopStoriesComparisons(
      canonical(horizon), horizon === 'fifteenMinute' ? 0.9 : 0.8,
    ),
  });
  const buildInput = horizon => ({
    overlapping: summarizeTopStoriesInputChange(rows(horizon)),
    canonicalNonOverlapping: summarizeTopStoriesInputChange(canonical(horizon)),
  });
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
    date, status: 'OBSERVED',
    comparisonEvidenceSchemaVersion: TOP_STORIES_COMPARISON_EVIDENCE_SCHEMA,
    comparisonEvidence: evidence,
    coverage: {
      scheduleSlotCoverage: 0.96,
      valid15mPairs: 80,
      canonical15mPairs: 40,
      valid60mPairs: 70,
      canonical60mPairs: 20,
      normalizationEvidence: coverage,
    },
    normalizationEvidenceCoverage: coverage,
    versionSegments: segments,
    segmentSummaries: segments.map(segmentKey => ({
      segmentKey,
      observationCount: options.mixedNormalization ? 48 : 96,
      validNormalizationEvidenceCount: options.mixedNormalization ? 48 : 96,
      eligibleComparisonCounts: segmentKey === SEGMENT
        ? { fifteenMinute: 80, sixtyMinute: 70 }
        : { fifteenMinute: 0, sixtyMinute: 0 },
      headlineKpiEligible: headlineEligible && segmentKey === SEGMENT,
    })),
    headlineKpiEligibility: {
      eligible: headlineEligible,
      reasonCodes: headlineEligible ? [] : [options.normalizationReason ||
        (options.mixedNormalization
          ? 'normalization_version_boundary' : 'normalization_evidence_incomplete')],
    },
    stability: {
      fifteenMinute: buildStability('fifteenMinute'),
      sixtyMinute: buildStability('sixtyMinute'),
    },
    inputChange: {
      fifteenMinute: buildInput('fifteenMinute'),
      sixtyMinute: buildInput('sixtyMinute'),
    },
    reviewThresholds: { fifteenMinute: 0.9, sixtyMinute: 0.8 },
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
  };
}
function validation(date, decision) {
  return {
    schemaVersion: 'nw-top-stories-24h-operational-validation/v1',
    studyId: PILOT_STUDY_ID,
    date, decision,
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
      const report = dailyReport(date, {
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
      });
      records.push({
        type: 'daily',
        artifactId: 100 + index,
        studyId: PILOT_STUDY_ID,
        date,
        schemaValid: true,
        comparisonEvidenceStatus: 'VALID',
        comparisonEvidenceReasonCodes: [],
        dailyReport: report,
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
      comparisonEvidenceStatus: 'NOT_APPLICABLE',
      validation: validation(date, decision),
    });
  });
  return records;
}
