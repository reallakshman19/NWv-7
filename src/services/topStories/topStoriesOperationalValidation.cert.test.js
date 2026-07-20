import { describe, expect, it } from 'vitest';
import { validateTopStoriesOperationalDay } from '../../../scripts/top-stories-shadow/operationalValidation.mjs';
import {
  buildTopStoriesVersionSegmentKey,
  TOP_STORIES_NORMALIZATION_VERSION,
} from './topStoriesVersionSegment.js';

const STUDY = 'nw-rank-011-shadow-pilot-2026-07';
const DATE = '2026-07-17';
const CONFIG = Object.freeze({
  schemaVersion: 'nw-top-stories-shadow-study/v1',
  studyId: STUDY,
  rankerVersion: 'nw-top-stories-ranker-observed-v1',
  identityVersion: 'nw-top-stories-identity-v1',
  periodClassifierVersion: 'nw-top-stories-period-classifier-v1',
  normalizationVersion: TOP_STORIES_NORMALIZATION_VERSION,
});
const SEGMENT = buildTopStoriesVersionSegmentKey(CONFIG);

function slotKey(time) {
  return `${time.toISOString().slice(0, 16).replace(/[-:]/g, '')}Z`;
}

function acquisitionRows(count, offset = 0) {
  const start = Date.parse(`${DATE}T00:07:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const time = new Date(start + (index * 15 * 60 * 1000));
    const runId = String(1000 + offset + index);
    return {
      runId,
      runAttempt: 1,
      runCreatedAt: time.toISOString(),
      artifactName: `top-stories-shadow-${STUDY}-${slotKey(time)}-${runId}-attempt-1`,
    };
  });
}

function excludedRows(count, offset = 0) {
  const start = Date.parse(`${DATE}T00:12:00.000Z`);
  return Array.from({ length: count }, (_, index) => ({
    runId: String(9000 + offset + index),
    runAttempt: 1,
    createdAt: new Date(start + (index * 15 * 60 * 1000)).toISOString(),
    reason: 'no_matching_artifact',
  }));
}

function baseCoverage() {
  return {
    scheduledRuns: 96,
    scheduledSlots: 96,
    scheduleSlotCoverage: 0.9583333333,
    startedRuns: 92,
    successfulRuns: 92,
    completeRuns: 91,
    analyticallyEligibleRuns: 90,
    failureRuns: 0,
    failedInputRuns: 0,
    invalidArtifacts: 0,
    unassignedInvalidArtifacts: 0,
    valid15mPairs: 88,
    canonical15mPairs: 43,
    valid60mPairs: 80,
    canonical60mPairs: 20,
    scheduleDelaySeconds: { p90: 240 },
  };
}

function normalizationCoverage(overrides = {}) {
  return {
    totalCanonicalObservations: 92,
    validNormalizationEvidenceCount: 92,
    normalizationVersionMissingCount: 0,
    normalizationVersionUnsupportedCount: 0,
    normalizationVersionMismatchCount: 0,
    normalizationDigestMissingCount: 0,
    normalizationDigestInvalidCount: 0,
    complete: true,
    ...overrides,
  };
}

function dailyReport(overrides = {}) {
  const coverage = { ...baseCoverage(), ...(overrides.coverage || {}) };
  const normalization = normalizationCoverage(overrides.normalizationEvidenceCoverage);
  coverage.normalizationEvidence = normalization;
  const report = {
    schemaVersion: 'nw-top-stories-daily-stability-report/v1',
    studyId: STUDY,
    date: DATE,
    status: 'OBSERVED',
    coverage,
    normalizationEvidenceCoverage: normalization,
    versionSegments: [SEGMENT],
    segmentSummaries: [{
      segmentKey: SEGMENT,
      observationCount: 92,
      validNormalizationEvidenceCount: 92,
      eligibleComparisonCounts: { fifteenMinute: 88, sixtyMinute: 80 },
      headlineKpiEligible: true,
    }],
    headlineKpiEligibility: { eligible: true, reasonCodes: [] },
    stability: {
      fifteenMinute: { overlapping: { calm: { incumbentRetention: { median: 0.92 } } } },
      sixtyMinute: { overlapping: { calm: { incumbentRetention: { median: 0.84 } } } },
    },
    ...overrides,
  };
  report.coverage = coverage;
  report.normalizationEvidenceCoverage = normalization;
  return report;
}

function inputs({ report = dailyReport(), downloaded = 92, excluded = 0,
  config = CONFIG } = {}) {
  return {
    dailyReport: report,
    aggregationManifest: {
      schemaVersion: 'nw-top-stories-shadow-aggregation-manifest/v1',
      studyId: STUDY,
      date: DATE,
    },
    downloadManifest: {
      schemaVersion: 'nw-top-stories-shadow-download-manifest/v1',
      studyId: STUDY,
      date: DATE,
      downloaded: acquisitionRows(downloaded),
      excludedRuns: excludedRows(excluded),
    },
    studyConfig: config,
    integrity: { ok: true, errors: [] },
  };
}

function expectNormalizationFailure(report, reason, config = CONFIG) {
  const result = validateTopStoriesOperationalDay(inputs({ report, config }));
  expect(result.decision).toBe('FAIL');
  expect(result.failureReasonCodes).toContain(reason);
  return result;
}

describe('Top Stories 24-hour operational validation', () => {
  it('passes complete and internally consistent normalized evidence', () => {
    const result = validateTopStoriesOperationalDay(inputs());
    expect(result.decision).toBe('PASS');
    expect(result.failureReasonCodes).toEqual([]);
    expect(result.metrics.artifactEmissionRate).toBe(1);
    expect(result.productionChangeAuthorized).toBe(false);
  });

  it('returns PASS_WITH_WARNINGS for usable but degraded evidence', () => {
    const report = dailyReport({
      coverage: {
        scheduleSlotCoverage: 0.7916666667,
        startedRuns: 76,
        successfulRuns: 76,
        completeRuns: 61,
        analyticallyEligibleRuns: 61,
        valid15mPairs: 60,
        canonical15mPairs: 25,
        valid60mPairs: 50,
        canonical60mPairs: 13,
        scheduleDelaySeconds: { p90: 900 },
      },
    });
    const result = validateTopStoriesOperationalDay(inputs({ report, downloaded: 76, excluded: 4 }));
    expect(result.decision).toBe('PASS_WITH_WARNINGS');
    expect(result.warningReasonCodes).toContain('schedule_slot_coverage_degraded');
    expect(result.warningReasonCodes).toContain('complete_run_rate_degraded');
  });

  it('fails every normalization defect class and never emits a pass', () => {
    const cases = [
      ['normalization_version_missing', 'normalizationVersionMissingCount'],
      ['normalization_version_unsupported', 'normalizationVersionUnsupportedCount'],
      ['normalization_version_mismatch', 'normalizationVersionMismatchCount'],
      ['normalization_digest_missing', 'normalizationDigestMissingCount'],
      ['normalization_digest_invalid', 'normalizationDigestInvalidCount'],
    ];
    cases.forEach(([reason, field]) => {
      const report = dailyReport({
        normalizationEvidenceCoverage: {
          validNormalizationEvidenceCount: 91,
          [field]: 1,
          complete: false,
        },
        headlineKpiEligibility: { eligible: false, reasonCodes: [reason] },
      });
      expectNormalizationFailure(report, reason);
    });
  });

  it('fails mixed segments and headline-ineligible daily evidence', () => {
    const other = SEGMENT.replace(TOP_STORIES_NORMALIZATION_VERSION, 'normalization-v2');
    const mixed = dailyReport({
      versionSegments: [SEGMENT, other],
      segmentSummaries: [
        { segmentKey: SEGMENT, headlineKpiEligible: false },
        { segmentKey: other, headlineKpiEligible: false },
      ],
      headlineKpiEligibility: {
        eligible: false,
        reasonCodes: ['normalization_version_boundary'],
      },
    });
    expectNormalizationFailure(mixed, 'normalization_version_boundary');
    const ineligible = dailyReport({
      headlineKpiEligibility: {
        eligible: false,
        reasonCodes: ['normalization_digest_missing'],
      },
    });
    expectNormalizationFailure(ineligible, 'normalization_digest_missing');
  });

  it('fails missing or incompatible configured normalization versions', () => {
    expectNormalizationFailure(dailyReport(), 'normalization_version_missing', {
      ...CONFIG, normalizationVersion: '',
    });
    expectNormalizationFailure(dailyReport(), 'normalization_version_mismatch', {
      ...CONFIG, normalizationVersion: 'normalization-v2',
    });
  });

  it('does not fail a valid partial day and reports insufficient evidence', () => {
    const report = dailyReport({
      status: 'INSUFFICIENT',
      coverage: {
        scheduleSlotCoverage: 0.25,
        startedRuns: 24,
        successfulRuns: 24,
        completeRuns: 24,
        analyticallyEligibleRuns: 24,
        valid15mPairs: 20,
        canonical15mPairs: 10,
        valid60mPairs: 10,
        canonical60mPairs: 4,
      },
    });
    const result = validateTopStoriesOperationalDay(inputs({ report, downloaded: 24 }));
    expect(result.decision).toBe('INSUFFICIENT');
    expect(result.failureReasonCodes).toEqual([]);
  });

  it('fails closed for artifact corruption while preserving editorial independence', () => {
    const corrupt = validateTopStoriesOperationalDay({
      ...inputs(),
      integrity: { ok: false, errors: ['sha256_mismatch:daily_report.json'] },
    });
    expect(corrupt.decision).toBe('FAIL');
    expect(corrupt.failureReasonCodes).toContain('input_integrity_failure');
    const high = validateTopStoriesOperationalDay(inputs());
    const lowReport = dailyReport();
    lowReport.stability.fifteenMinute.overlapping.calm.incumbentRetention.median = 0;
    lowReport.stability.sixtyMinute.overlapping.calm.incumbentRetention.median = 0;
    const low = validateTopStoriesOperationalDay(inputs({ report: lowReport }));
    expect(low.decision).toBe(high.decision);
    expect(low.checks).toEqual(high.checks);
  });
});
