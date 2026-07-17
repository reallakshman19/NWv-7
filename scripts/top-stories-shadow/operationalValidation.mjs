export const TOP_STORIES_OPERATIONAL_VALIDATION_SCHEMA =
  'nw-top-stories-24h-operational-validation/v1';

export const TOP_STORIES_OPERATIONAL_THRESHOLDS = Object.freeze({
  pass: Object.freeze({
    scheduleSlotCoverage: 0.90,
    artifactEmissionRate: 0.90,
    completeRunRate: 0.90,
    analyticalEligibilityRate: 0.90,
    valid15mPairs: 70,
    canonical15mPairs: 30,
    valid60mPairs: 60,
    canonical60mPairs: 16,
    p90ScheduleDelaySeconds: 600,
  }),
  sufficient: Object.freeze({
    scheduleSlotCoverage: 0.75,
    artifactEmissionRate: 0.75,
    completeRunRate: 0.75,
    analyticalEligibilityRate: 0.75,
    valid15mPairs: 53,
    canonical15mPairs: 23,
    valid60mPairs: 45,
    canonical60mPairs: 12,
    p90ScheduleDelaySeconds: 1200,
  }),
});

const EXPECTED_SCHEMAS = Object.freeze({
  report: 'nw-top-stories-daily-stability-report/v1',
  aggregationManifest: 'nw-top-stories-shadow-aggregation-manifest/v1',
  downloadManifest: 'nw-top-stories-shadow-download-manifest/v1',
  studyConfig: 'nw-top-stories-shadow-study/v1',
});

function finiteMetric(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function ratio(numerator, denominator) {
  const top = finiteMetric(numerator);
  const bottom = finiteMetric(denominator);
  return top !== null && bottom !== null && bottom > 0 ? top / bottom : null;
}

function inReportDay(value, date) {
  const start = Date.parse(`${date}T00:00:00.000Z`);
  const time = Date.parse(value || 0);
  return Number.isFinite(start) && Number.isFinite(time) &&
    time >= start && time < start + (24 * 60 * 60 * 1000);
}

function uniqueRunKeys(rows = [], timeField) {
  return new Set(rows
    .filter(row => inReportDay(row?.[timeField], row?._reportDate))
    .map(row => `${row.runId || 'run'}:${row.runAttempt || 1}`));
}

function buildAcquisitionMetrics(downloadManifest, date) {
  const downloaded = (downloadManifest?.downloaded || [])
    .map(row => ({ ...row, _reportDate: date }));
  const excluded = (downloadManifest?.excludedRuns || [])
    .map(row => ({ ...row, _reportDate: date }));
  const downloadedRuns = uniqueRunKeys(downloaded, 'runCreatedAt');
  const excludedRuns = uniqueRunKeys(excluded, 'createdAt');
  const missingRuns = new Set([...excludedRuns].filter(key => !downloadedRuns.has(key)));
  const workflowRuns = new Set([...downloadedRuns, ...missingRuns]);
  return {
    workflowRunCount: workflowRuns.size,
    downloadedRunCount: downloadedRuns.size,
    missingArtifactRunCount: missingRuns.size,
    artifactEmissionRate: ratio(downloadedRuns.size, workflowRuns.size),
  };
}

function expectedVersionSegment(config = {}) {
  return [
    config.studyId,
    config.rankerVersion,
    config.identityVersion,
    config.periodClassifierVersion,
  ].join('|');
}

function addCheck(checks, id, status, actual, threshold, reasonCode) {
  checks.push({ id, status, actual, threshold, reasonCode });
}

function schemaChecks(checks, report, aggregationManifest, downloadManifest, config) {
  const rows = [
    ['daily_report_schema', report?.schemaVersion, EXPECTED_SCHEMAS.report],
    ['aggregation_manifest_schema', aggregationManifest?.schemaVersion,
      EXPECTED_SCHEMAS.aggregationManifest],
    ['download_manifest_schema', downloadManifest?.schemaVersion,
      EXPECTED_SCHEMAS.downloadManifest],
    ['study_config_schema', config?.schemaVersion, EXPECTED_SCHEMAS.studyConfig],
  ];
  rows.forEach(([id, actual, expected]) => addCheck(
    checks,
    id,
    actual === expected ? 'PASS' : 'FAIL',
    actual || null,
    expected,
    actual === expected ? null : 'unsupported_schema',
  ));
}

function identityChecks(checks, report, aggregationManifest, downloadManifest, config) {
  const studyIds = [
    report?.studyId,
    aggregationManifest?.studyId,
    downloadManifest?.studyId,
    config?.studyId,
  ].filter(Boolean);
  const dates = [report?.date, aggregationManifest?.date, downloadManifest?.date]
    .filter(Boolean);
  const studyConsistent = new Set(studyIds).size === 1 && studyIds.length === 4;
  const dateConsistent = new Set(dates).size === 1 && dates.length === 3;
  addCheck(checks, 'study_identity_consistency', studyConsistent ? 'PASS' : 'FAIL',
    [...new Set(studyIds)], config?.studyId || null,
    studyConsistent ? null : 'study_identity_mismatch');
  addCheck(checks, 'report_date_consistency', dateConsistent ? 'PASS' : 'FAIL',
    [...new Set(dates)], report?.date || null,
    dateConsistent ? null : 'report_date_mismatch');
}

function hardIntegrityChecks(checks, report, config, integrity) {
  const coverage = report?.coverage || {};
  const expectedSegment = expectedVersionSegment(config);
  const segments = Array.isArray(report?.versionSegments) ? report.versionSegments : [];
  const versionOkay = segments.length === 0
    ? report?.status !== 'OBSERVED'
    : segments.length === 1 && segments[0] === expectedSegment;
  const rows = [
    ['input_file_integrity', integrity?.ok === true, integrity?.errors || [], true,
      'input_integrity_failure'],
    ['invalid_artifacts', finiteMetric(coverage.invalidArtifacts) === 0,
      finiteMetric(coverage.invalidArtifacts), 0, 'invalid_artifact_detected'],
    ['unassigned_invalid_artifacts', finiteMetric(coverage.unassignedInvalidArtifacts) === 0,
      finiteMetric(coverage.unassignedInvalidArtifacts), 0,
      'unassigned_invalid_artifact_detected'],
    ['version_segment', versionOkay, segments, expectedSegment, 'version_segment_mismatch'],
  ];
  rows.forEach(([id, passed, actual, threshold, reasonCode]) => addCheck(
    checks, id, passed ? 'PASS' : 'FAIL', actual, threshold,
    passed ? null : reasonCode));
}

function thresholdCheck(checks, id, actual, passThreshold, sufficientThreshold, higherIsBetter = true) {
  if (!Number.isFinite(actual)) {
    addCheck(checks, id, 'INSUFFICIENT', null, passThreshold, 'metric_unavailable');
    return;
  }
  const passes = higherIsBetter ? actual >= passThreshold : actual <= passThreshold;
  const sufficient = higherIsBetter
    ? actual >= sufficientThreshold
    : actual <= sufficientThreshold;
  addCheck(
    checks,
    id,
    passes ? 'PASS' : sufficient ? 'WARN' : 'INSUFFICIENT',
    actual,
    { pass: passThreshold, sufficient: sufficientThreshold },
    passes ? null : sufficient ? `${id}_degraded` : `${id}_insufficient`,
  );
}

function operationalChecks(checks, report, acquisition) {
  const coverage = report?.coverage || {};
  const completeRunRate = ratio(coverage.completeRuns, coverage.successfulRuns);
  const eligibilityRate = ratio(
    coverage.analyticallyEligibleRuns,
    coverage.successfulRuns,
  );
  const pass = TOP_STORIES_OPERATIONAL_THRESHOLDS.pass;
  const sufficient = TOP_STORIES_OPERATIONAL_THRESHOLDS.sufficient;
  thresholdCheck(checks, 'schedule_slot_coverage', finiteMetric(coverage.scheduleSlotCoverage),
    pass.scheduleSlotCoverage, sufficient.scheduleSlotCoverage);
  thresholdCheck(checks, 'artifact_emission_rate', acquisition.artifactEmissionRate,
    pass.artifactEmissionRate, sufficient.artifactEmissionRate);
  thresholdCheck(checks, 'complete_run_rate', completeRunRate,
    pass.completeRunRate, sufficient.completeRunRate);
  thresholdCheck(checks, 'analytical_eligibility_rate', eligibilityRate,
    pass.analyticalEligibilityRate, sufficient.analyticalEligibilityRate);
  thresholdCheck(checks, 'valid_15m_pairs', finiteMetric(coverage.valid15mPairs),
    pass.valid15mPairs, sufficient.valid15mPairs);
  thresholdCheck(checks, 'canonical_15m_pairs', finiteMetric(coverage.canonical15mPairs),
    pass.canonical15mPairs, sufficient.canonical15mPairs);
  thresholdCheck(checks, 'valid_60m_pairs', finiteMetric(coverage.valid60mPairs),
    pass.valid60mPairs, sufficient.valid60mPairs);
  thresholdCheck(checks, 'canonical_60m_pairs', finiteMetric(coverage.canonical60mPairs),
    pass.canonical60mPairs, sufficient.canonical60mPairs);
  thresholdCheck(checks, 'p90_schedule_delay_seconds',
    finiteMetric(coverage.scheduleDelaySeconds?.p90),
    pass.p90ScheduleDelaySeconds,
    sufficient.p90ScheduleDelaySeconds,
    false);
  if (finiteMetric(coverage.failureRuns) > 0) {
    addCheck(checks, 'failure_runs', 'WARN', finiteMetric(coverage.failureRuns), 0,
      'failure_runs_present');
  }
  if (finiteMetric(coverage.failedInputRuns) > 0) {
    addCheck(checks, 'failed_input_runs', 'WARN', finiteMetric(coverage.failedInputRuns), 0,
      'degraded_input_runs_present');
  }
  if (acquisition.missingArtifactRunCount > 0) {
    addCheck(checks, 'missing_artifact_runs', 'WARN',
      acquisition.missingArtifactRunCount, 0, 'missing_artifact_runs_present');
  }
  return { completeRunRate, eligibilityRate };
}

function decide(checks, report) {
  if (checks.some(check => check.status === 'FAIL')) return 'FAIL';
  if (report?.status !== 'OBSERVED') return 'INSUFFICIENT';
  if (checks.some(check => check.status === 'INSUFFICIENT')) return 'INSUFFICIENT';
  if (checks.some(check => check.status === 'WARN')) return 'PASS_WITH_WARNINGS';
  return 'PASS';
}

function collectReasons(checks, status) {
  return [...new Set(checks
    .filter(check => check.status === status && check.reasonCode)
    .map(check => check.reasonCode))].sort();
}

export function validateTopStoriesOperationalDay({
  dailyReport,
  aggregationManifest,
  downloadManifest,
  studyConfig,
  integrity = { ok: true, errors: [] },
} = {}) {
  const checks = [];
  schemaChecks(checks, dailyReport, aggregationManifest, downloadManifest, studyConfig);
  identityChecks(checks, dailyReport, aggregationManifest, downloadManifest, studyConfig);
  hardIntegrityChecks(checks, dailyReport, studyConfig, integrity);
  const acquisition = buildAcquisitionMetrics(downloadManifest, dailyReport?.date);
  const rates = operationalChecks(checks, dailyReport, acquisition);
  const decision = decide(checks, dailyReport);
  return {
    schemaVersion: TOP_STORIES_OPERATIONAL_VALIDATION_SCHEMA,
    studyId: studyConfig?.studyId || dailyReport?.studyId || null,
    date: dailyReport?.date || null,
    decision,
    reportStatus: dailyReport?.status || null,
    checks,
    failureReasonCodes: collectReasons(checks, 'FAIL'),
    warningReasonCodes: collectReasons(checks, 'WARN'),
    insufficiencyReasonCodes: collectReasons(checks, 'INSUFFICIENT'),
    metrics: {
      ...acquisition,
      scheduleSlotCoverage: dailyReport?.coverage?.scheduleSlotCoverage ?? null,
      completeRunRate: rates.completeRunRate,
      analyticalEligibilityRate: rates.eligibilityRate,
      valid15mPairs: dailyReport?.coverage?.valid15mPairs ?? null,
      canonical15mPairs: dailyReport?.coverage?.canonical15mPairs ?? null,
      valid60mPairs: dailyReport?.coverage?.valid60mPairs ?? null,
      canonical60mPairs: dailyReport?.coverage?.canonical60mPairs ?? null,
      p90ScheduleDelaySeconds: dailyReport?.coverage?.scheduleDelaySeconds?.p90 ?? null,
    },
    editorialObservations: {
      calm15mMedianIncumbentRetention:
        dailyReport?.stability?.fifteenMinute?.overlapping?.calm?.incumbentRetention?.median ?? null,
      calm60mMedianIncumbentRetention:
        dailyReport?.stability?.sixtyMinute?.overlapping?.calm?.incumbentRetention?.median ?? null,
      operationalDecisionIndependentOfEditorialMetrics: true,
    },
    thresholds: TOP_STORIES_OPERATIONAL_THRESHOLDS,
    productionChangeAuthorized: false,
    editorialPolicyChangeAuthorized: false,
  };
}
