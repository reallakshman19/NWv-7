import { describe, expect, it } from 'vitest';
import { validateTopStoriesOperationalDay } from '../../../scripts/top-stories-shadow/operationalValidation.mjs';
import {
  getTopStoriesComparisonRecords,
  summarizeTopStoriesComparisons,
  summarizeTopStoriesInputChange,
} from '../../../scripts/top-stories-shadow/comparisonEvidence.mjs';
import {
  buildPilotArtifacts,
  PILOT_CONFIG,
  PILOT_STUDY_ID,
} from './fixtures/topStoriesPilotDecisionFixture.js';

const DATE = '2026-07-17';
const CONFIG = PILOT_CONFIG;

function acquisitionRows(count, offset = 0) {
  const start = Date.parse(`${DATE}T00:07:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const time = new Date(start + (index * 15 * 60 * 1000));
    const runId = String(1000 + offset + index);
    const slot = `${time.toISOString().slice(0, 16).replace(/[-:]/g, '')}Z`;
    return { runId, runAttempt: 1, runCreatedAt: time.toISOString(),
      artifactName: `top-stories-shadow-${PILOT_STUDY_ID}-${slot}-${runId}-attempt-1` };
  });
}

function excludedRows(count, offset = 0) {
  const start = Date.parse(`${DATE}T00:12:00.000Z`);
  return Array.from({ length: count }, (_, index) => ({
    runId: String(9000 + offset + index), runAttempt: 1,
    createdAt: new Date(start + (index * 15 * 60 * 1000)).toISOString(),
    reason: 'no_matching_artifact',
  }));
}

function selectEvidence(report, counts) {
  const evidence = report.comparisonEvidence;
  const canonicalIds = new Set(evidence.canonicalComparisonIds);
  const choose = (horizon, total, canonicalCount) => {
    const rows = evidence.comparisonRecords.filter(row => row.horizon === horizon);
    const canonical = rows.filter(row => canonicalIds.has(row.comparisonId)).slice(0, canonicalCount);
    const descriptive = rows.filter(row => !canonicalIds.has(row.comparisonId))
      .slice(0, Math.max(0, total - canonical.length));
    return { rows: [...canonical, ...descriptive], canonical };
  };
  const f15 = choose('fifteenMinute', counts.valid15mPairs, counts.canonical15mPairs);
  const f60 = choose('sixtyMinute', counts.valid60mPairs, counts.canonical60mPairs);
  const rows = [...f15.rows, ...f60.rows].sort((left, right) =>
    (left.horizon === right.horizon ? 0 : left.horizon === 'fifteenMinute' ? -1 : 1) ||
    left.anchorAt - right.anchorAt || left.comparisonId.localeCompare(right.comparisonId));
  report.comparisonEvidence = {
    ...evidence,
    comparisonRecords: rows,
    canonicalComparisonIds: [...f15.canonical, ...f60.canonical]
      .map(row => row.comparisonId).sort(),
    horizonCounts: {
      fifteenMinute: { overlapping: f15.rows.length,
        canonicalNonOverlapping: f15.canonical.length },
      sixtyMinute: { overlapping: f60.rows.length,
        canonicalNonOverlapping: f60.canonical.length },
    },
  };
  report.coverage = { ...report.coverage, ...counts };
  const build = (horizon, threshold) => ({
    overlapping: summarizeTopStoriesComparisons(
      getTopStoriesComparisonRecords(report.comparisonEvidence, horizon), threshold,
    ),
    canonicalNonOverlapping: summarizeTopStoriesComparisons(
      getTopStoriesComparisonRecords(report.comparisonEvidence, horizon, true), threshold,
    ),
  });
  const input = horizon => ({
    overlapping: summarizeTopStoriesInputChange(
      getTopStoriesComparisonRecords(report.comparisonEvidence, horizon),
    ),
    canonicalNonOverlapping: summarizeTopStoriesInputChange(
      getTopStoriesComparisonRecords(report.comparisonEvidence, horizon, true),
    ),
  });
  report.stability = { fifteenMinute: build('fifteenMinute', 0.9),
    sixtyMinute: build('sixtyMinute', 0.8) };
  report.inputChange = { fifteenMinute: input('fifteenMinute'),
    sixtyMinute: input('sixtyMinute') };
  report.segmentSummaries[0].eligibleComparisonCounts = {
    fifteenMinute: counts.valid15mPairs, sixtyMinute: counts.valid60mPairs,
  };
  return report;
}

function dailyReport(overrides = {}) {
  const source = buildPilotArtifacts().find(row => row.type === 'daily').dailyReport;
  const report = structuredClone(source);
  const counts = { valid15mPairs: 80, canonical15mPairs: 40,
    valid60mPairs: 70, canonical60mPairs: 20, ...(overrides.coverage || {}) };
  selectEvidence(report, counts);
  report.coverage = { ...report.coverage, scheduledRuns: 96, scheduledSlots: 96,
    scheduleSlotCoverage: 0.9583333333, startedRuns: 92, successfulRuns: 92,
    completeRuns: 91, analyticallyEligibleRuns: 90, failureRuns: 0,
    failedInputRuns: 0, invalidArtifacts: 0, unassignedInvalidArtifacts: 0,
    scheduleDelaySeconds: { p90: 240 }, ...(overrides.coverage || {}) };
  const { coverage: ignoredCoverage, ...reportOverrides } = overrides;
  void ignoredCoverage;
  Object.assign(report, reportOverrides);
  return report;
}

function inputs({ report = dailyReport(), downloaded = 92, excluded = 0,
  config = CONFIG } = {}) {
  return {
    dailyReport: report,
    aggregationManifest: { schemaVersion: 'nw-top-stories-shadow-aggregation-manifest/v1',
      studyId: PILOT_STUDY_ID, date: DATE },
    downloadManifest: { schemaVersion: 'nw-top-stories-shadow-download-manifest/v1',
      studyId: PILOT_STUDY_ID, date: DATE, downloaded: acquisitionRows(downloaded),
      excludedRuns: excludedRows(excluded) },
    studyConfig: config,
    integrity: { ok: true, errors: [] },
  };
}

function expectFailure(report, reason, config = CONFIG) {
  const result = validateTopStoriesOperationalDay(inputs({ report, config }));
  expect(result.decision).toBe('FAIL');
  expect(result.failureReasonCodes).toContain(reason);
  return result;
}

describe('Top Stories 24-hour operational validation', () => {
  it('passes complete and internally consistent comparison evidence', () => {
    const result = validateTopStoriesOperationalDay(inputs());
    expect(result.decision).toBe('PASS');
    expect(result.failureReasonCodes).toEqual([]);
    expect(result.metrics.artifactEmissionRate).toBe(1);
    expect(result.productionChangeAuthorized).toBe(false);
  });

  it('returns PASS_WITH_WARNINGS for usable but degraded evidence', () => {
    const report = dailyReport({ coverage: { scheduleSlotCoverage: 0.7916666667,
      startedRuns: 76, successfulRuns: 76, completeRuns: 61,
      analyticallyEligibleRuns: 61, valid15mPairs: 60, canonical15mPairs: 25,
      valid60mPairs: 50, canonical60mPairs: 13, scheduleDelaySeconds: { p90: 900 } } });
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
      const report = dailyReport();
      report.normalizationEvidenceCoverage = { ...report.normalizationEvidenceCoverage,
        validNormalizationEvidenceCount: 95, [field]: 1, complete: false };
      report.coverage.normalizationEvidence = report.normalizationEvidenceCoverage;
      report.headlineKpiEligibility = { eligible: false, reasonCodes: [reason] };
      expectFailure(report, reason);
    });
  });

  it('fails each comparison-evidence defect class', () => {
    const missing = dailyReport();
    delete missing.comparisonEvidence;
    delete missing.comparisonEvidenceSchemaVersion;
    expectFailure(missing, 'comparison_evidence_missing');
    const unknown = dailyReport();
    unknown.comparisonEvidence.canonicalComparisonIds[0] = '0'.repeat(64);
    expectFailure(unknown, 'canonical_comparison_reference_unknown');
    const drift = dailyReport();
    drift.coverage.canonical15mPairs += 1;
    expectFailure(drift, 'comparison_evidence_summary_mismatch');
  });

  it('does not fail a valid partial day and reports insufficient evidence', () => {
    const report = dailyReport({ status: 'INSUFFICIENT', coverage: {
      scheduleSlotCoverage: 0.25, startedRuns: 24, successfulRuns: 24,
      completeRuns: 24, analyticallyEligibleRuns: 24, valid15mPairs: 20,
      canonical15mPairs: 10, valid60mPairs: 10, canonical60mPairs: 4 } });
    const result = validateTopStoriesOperationalDay(inputs({ report, downloaded: 24 }));
    expect(result.decision).toBe('INSUFFICIENT');
    expect(result.failureReasonCodes).toEqual([]);
  });

  it('fails artifact corruption but remains independent of reconciled editorial values', () => {
    const corrupt = validateTopStoriesOperationalDay({ ...inputs(),
      integrity: { ok: false, errors: ['sha256_mismatch:daily_report.json'] } });
    expect(corrupt.decision).toBe('FAIL');
    expect(corrupt.failureReasonCodes).toContain('input_integrity_failure');
    const highReport = dailyReport();
    const lowReport = dailyReport();
    lowReport.comparisonEvidence.comparisonRecords.forEach(row => {
      row.metrics.incumbentRetention = 0;
    });
    selectEvidence(lowReport, { valid15mPairs: 80, canonical15mPairs: 40,
      valid60mPairs: 70, canonical60mPairs: 20 });
    const high = validateTopStoriesOperationalDay(inputs({ report: highReport }));
    const low = validateTopStoriesOperationalDay(inputs({ report: lowReport }));
    expect(low.decision).toBe(high.decision);
    expect(low.checks).toEqual(high.checks);
  });
});
