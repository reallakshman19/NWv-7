import { describe, expect, it } from 'vitest';
import { validateTopStoriesOperationalDay } from '../../../scripts/top-stories-shadow/operationalValidation.mjs';

const STUDY = 'nw-rank-011-shadow-pilot-2026-07';
const DATE = '2026-07-17';
const CONFIG = Object.freeze({
  schemaVersion: 'nw-top-stories-shadow-study/v1',
  studyId: STUDY,
  rankerVersion: 'nw-top-stories-ranker-observed-v1',
  identityVersion: 'nw-top-stories-identity-v1',
  periodClassifierVersion: 'nw-top-stories-period-classifier-v1',
});
const SEGMENT = [
  CONFIG.studyId,
  CONFIG.rankerVersion,
  CONFIG.identityVersion,
  CONFIG.periodClassifierVersion,
].join('|');

function acquisitionRows(count, offset = 0) {
  const start = Date.parse(`${DATE}T00:07:00.000Z`);
  return Array.from({ length: count }, (_, index) => ({
    runId: String(1000 + offset + index),
    runAttempt: 1,
    runCreatedAt: new Date(start + (index * 15 * 60 * 1000)).toISOString(),
  }));
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

function dailyReport(overrides = {}) {
  const coverageOverrides = overrides.coverage || {};
  return {
    schemaVersion: 'nw-top-stories-daily-stability-report/v1',
    studyId: STUDY,
    date: DATE,
    status: 'OBSERVED',
    coverage: {
      scheduledRuns: 96,
      scheduledSlots: 96,
      scheduleSlotCoverage: 0.9583333333,
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
      ...coverageOverrides,
    },
    versionSegments: [SEGMENT],
    stability: {
      fifteenMinute: {
        overlapping: {
          calm: { incumbentRetention: { median: 0.92 } },
        },
      },
      sixtyMinute: {
        overlapping: {
          calm: { incumbentRetention: { median: 0.84 } },
        },
      },
    },
    ...overrides,
    coverage: {
      scheduledRuns: 96,
      scheduledSlots: 96,
      scheduleSlotCoverage: 0.9583333333,
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
      ...coverageOverrides,
    },
  };
}

function inputs({ report = dailyReport(), downloaded = 92, excluded = 0 } = {}) {
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
    studyConfig: CONFIG,
    integrity: { ok: true, errors: [] },
  };
}

describe('Top Stories 24-hour operational validation', () => {
  it('passes complete and internally consistent operational evidence', () => {
    const result = validateTopStoriesOperationalDay(inputs());
    expect(result.decision).toBe('PASS');
    expect(result.failureReasonCodes).toEqual([]);
    expect(result.insufficiencyReasonCodes).toEqual([]);
    expect(result.metrics.artifactEmissionRate).toBe(1);
    expect(result.productionChangeAuthorized).toBe(false);
  });

  it('returns PASS_WITH_WARNINGS for usable but degraded evidence', () => {
    const report = dailyReport({
      coverage: {
        scheduleSlotCoverage: 0.80,
        successfulRuns: 80,
        completeRuns: 64,
        analyticallyEligibleRuns: 64,
        valid15mPairs: 60,
        canonical15mPairs: 25,
        valid60mPairs: 50,
        canonical60mPairs: 13,
        scheduleDelaySeconds: { p90: 900 },
      },
    });
    const result = validateTopStoriesOperationalDay(inputs({
      report,
      downloaded: 76,
      excluded: 4,
    }));
    expect(result.decision).toBe('PASS_WITH_WARNINGS');
    expect(result.warningReasonCodes).toContain('schedule_slot_coverage_degraded');
    expect(result.warningReasonCodes).toContain('complete_run_rate_degraded');
  });

  it('does not fail a partial day and reports insufficient evidence', () => {
    const report = dailyReport({
      status: 'INSUFFICIENT',
      coverage: {
        scheduleSlotCoverage: 0.25,
        successfulRuns: 24,
        completeRuns: 24,
        analyticallyEligibleRuns: 24,
        valid15mPairs: 20,
        canonical15mPairs: 10,
        valid60mPairs: 10,
        canonical60mPairs: 4,
      },
      versionSegments: [SEGMENT],
    });
    const result = validateTopStoriesOperationalDay(inputs({
      report,
      downloaded: 24,
    }));
    expect(result.decision).toBe('INSUFFICIENT');
    expect(result.failureReasonCodes).toEqual([]);
    expect(result.insufficiencyReasonCodes.length).toBeGreaterThan(0);
  });

  it('fails closed for artifact corruption and version fragmentation', () => {
    const report = dailyReport({
      coverage: { invalidArtifacts: 1 },
      versionSegments: [SEGMENT, `${SEGMENT}-changed`],
    });
    const result = validateTopStoriesOperationalDay({
      ...inputs({ report }),
      integrity: { ok: false, errors: ['sha256_mismatch:daily_report.json'] },
    });
    expect(result.decision).toBe('FAIL');
    expect(result.failureReasonCodes).toContain('input_integrity_failure');
    expect(result.failureReasonCodes).toContain('invalid_artifact_detected');
    expect(result.failureReasonCodes).toContain('version_segment_mismatch');
  });

  it('uses null rather than fabricated zero ratios when denominators are absent', () => {
    const report = dailyReport({
      status: 'INSUFFICIENT',
      coverage: {
        scheduleSlotCoverage: 0,
        successfulRuns: 0,
        completeRuns: 0,
        analyticallyEligibleRuns: 0,
        valid15mPairs: 0,
        canonical15mPairs: 0,
        valid60mPairs: 0,
        canonical60mPairs: 0,
        scheduleDelaySeconds: { p90: null },
      },
      versionSegments: [],
    });
    const result = validateTopStoriesOperationalDay(inputs({
      report,
      downloaded: 0,
    }));
    expect(result.decision).toBe('INSUFFICIENT');
    expect(result.metrics.artifactEmissionRate).toBeNull();
    expect(result.metrics.completeRunRate).toBeNull();
    expect(result.metrics.p90ScheduleDelaySeconds).toBeNull();
  });

  it('keeps the operational verdict independent of editorial retention', () => {
    const high = validateTopStoriesOperationalDay(inputs());
    const lowReport = dailyReport();
    lowReport.stability.fifteenMinute.overlapping.calm.incumbentRetention.median = 0;
    lowReport.stability.sixtyMinute.overlapping.calm.incumbentRetention.median = 0;
    const low = validateTopStoriesOperationalDay(inputs({ report: lowReport }));
    expect(low.decision).toBe(high.decision);
    expect(low.checks).toEqual(high.checks);
    expect(low.editorialObservations.calm15mMedianIncumbentRetention).toBe(0);
  });
});
