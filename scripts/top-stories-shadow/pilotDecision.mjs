import { buildTopStoriesPilotMetrics } from './pilotMetrics.mjs';
import {
  buildPilotEvidenceGaps,
  buildPilotRecommendation,
  buildPilotSignals,
  TOP_STORIES_PILOT_THRESHOLDS,
} from './pilotRecommendation.mjs';
import {
  buildTopStoriesVersionSegmentKey,
  TOP_STORIES_NORMALIZATION_VERSION,
} from '../../src/services/topStories/topStoriesVersionSegment.js';

export const TOP_STORIES_PILOT_DECISION_SCHEMA =
  'nw-top-stories-seven-day-pilot-decision/v1';

function addDays(date, days) {
  const start = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(start)) throw new Error('pilotStartDate must be valid');
  return new Date(start + (days * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

export function validatePilotConfiguration(config = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(config.pilotStartDate || ''))) {
    throw new Error('pilotStartDate must use YYYY-MM-DD');
  }
  const days = Number(config.pilotWindowDays);
  if (!Number.isInteger(days) || days !== TOP_STORIES_PILOT_THRESHOLDS.expectedDays) {
    throw new Error('pilotWindowDays must equal the fixed seven-day study window');
  }
  if (config.normalizationVersion !== TOP_STORIES_NORMALIZATION_VERSION) {
    throw new Error('normalizationVersion must match the executable normalization contract');
  }
  const decisionNotBefore = Date.parse(config.pilotDecisionNotBefore);
  if (!Number.isFinite(decisionNotBefore)) {
    throw new Error('pilotDecisionNotBefore must be a valid timestamp');
  }
  const windowEndExclusive = Date.parse(`${addDays(config.pilotStartDate, days)}T00:00:00.000Z`);
  if (decisionNotBefore < windowEndExclusive) {
    throw new Error('pilotDecisionNotBefore cannot precede the completed UTC study window');
  }
  return {
    ...config,
    pilotWindowDays: days,
    pilotEndDate: addDays(config.pilotStartDate, days - 1),
  };
}

export function getPilotExpectedDates(config) {
  const valid = validatePilotConfiguration(config);
  return Array.from({ length: valid.pilotWindowDays }, (_, index) =>
    addDays(valid.pilotStartDate, index));
}

function mapArtifacts(records, type, studyId) {
  return new Map(records
    .filter(record => record.type === type && record.studyId === studyId)
    .map(record => [record.date, record]));
}

function normalizationDayErrors(report, config) {
  if (report?.status !== 'OBSERVED') return [];
  const errors = [];
  const expectedKey = buildTopStoriesVersionSegmentKey(config);
  const segments = Array.isArray(report.versionSegments) ? report.versionSegments : [];
  const coverage = report.normalizationEvidenceCoverage ||
    report.coverage?.normalizationEvidence || {};
  const summaries = Array.isArray(report.segmentSummaries) ? report.segmentSummaries : [];
  if (segments.length !== 1 || segments[0] !== expectedKey) {
    errors.push(segments.length > 1
      ? 'normalization_version_boundary' : 'normalization_version_mismatch');
  }
  const defects = [
    ['normalizationVersionMissingCount', 'normalization_version_missing'],
    ['normalizationVersionUnsupportedCount', 'normalization_version_unsupported'],
    ['normalizationVersionMismatchCount', 'normalization_version_mismatch'],
    ['normalizationDigestMissingCount', 'normalization_digest_missing'],
    ['normalizationDigestInvalidCount', 'normalization_digest_invalid'],
  ];
  defects.forEach(([field, reason]) => {
    if (Number(coverage[field] || 0) > 0) errors.push(reason);
  });
  const total = Number(coverage.totalCanonicalObservations);
  const valid = Number(coverage.validNormalizationEvidenceCount);
  if (!Number.isFinite(total) || total <= 0 || valid !== total) {
    errors.push('normalization_evidence_incomplete');
  }
  if (summaries.length !== 1 || summaries[0]?.segmentKey !== expectedKey ||
    summaries[0]?.headlineKpiEligible !== true) {
    errors.push(summaries.length > 1
      ? 'normalization_version_boundary' : 'normalization_segment_ineligible');
  }
  if (report.headlineKpiEligibility?.eligible !== true) {
    errors.push(report.headlineKpiEligibility?.reasonCodes?.[0] ||
      'normalization_headline_ineligible');
  }
  return [...new Set(errors)].sort();
}

function classifyDay(date, daily, validation, config) {
  const errors = [];
  if (!daily) errors.push('missing_daily_artifact');
  if (!validation) errors.push('missing_validation_artifact');
  if (daily && !daily.schemaValid) errors.push('invalid_daily_artifact');
  if (validation && !validation.schemaValid) errors.push('invalid_validation_artifact');
  if (daily?.dailyReport?.date && daily.dailyReport.date !== date) {
    errors.push('daily_date_mismatch');
  }
  if (validation?.validation?.date && validation.validation.date !== date) {
    errors.push('validation_date_mismatch');
  }
  errors.push(...normalizationDayErrors(daily?.dailyReport, config));
  const validationDecision = validation?.validation?.decision || null;
  const technical = errors.some(code =>
    code.startsWith('invalid_') || code.endsWith('_mismatch') ||
    code.startsWith('normalization_'));
  let status = 'MISSING';
  if (technical || validationDecision === 'FAIL') status = 'TECHNICAL_FAILURE';
  else if (validationDecision === 'PASS') {
    status = daily?.dailyReport?.status === 'OBSERVED' ? 'USABLE_PASS' : 'INSUFFICIENT';
  } else if (validationDecision === 'PASS_WITH_WARNINGS') {
    status = daily?.dailyReport?.status === 'OBSERVED' ? 'USABLE_WARNING' : 'INSUFFICIENT';
  } else if (validationDecision === 'INSUFFICIENT' || daily || validation) {
    status = 'INSUFFICIENT';
  }
  return {
    date,
    status,
    usable: ['USABLE_PASS', 'USABLE_WARNING'].includes(status),
    errors: [...new Set(errors)].sort(),
    dailyReport: daily?.dailyReport || null,
    validation: validation?.validation || null,
    dailyArtifactId: daily?.artifactId || null,
    validationArtifactId: validation?.artifactId || null,
  };
}

export function buildPilotDayRecords(canonicalArtifacts = [], config = {}) {
  const validConfig = validatePilotConfiguration(config);
  const dailyByDate = mapArtifacts(canonicalArtifacts, 'daily', validConfig.studyId);
  const validationByDate = mapArtifacts(canonicalArtifacts, 'validation', validConfig.studyId);
  return getPilotExpectedDates(validConfig).map(date => classifyDay(
    date,
    dailyByDate.get(date),
    validationByDate.get(date),
    validConfig,
  ));
}

function daySummary(day) {
  const calm15 = day.dailyReport?.stability?.fifteenMinute
    ?.canonicalNonOverlapping?.calm?.incumbentRetention;
  const calm60 = day.dailyReport?.stability?.sixtyMinute
    ?.canonicalNonOverlapping?.calm?.incumbentRetention;
  return {
    date: day.date,
    status: day.status,
    usable: day.usable,
    validationDecision: day.validation?.decision || null,
    dailyStatus: day.dailyReport?.status || null,
    errors: day.errors,
    scheduleSlotCoverage: day.dailyReport?.coverage?.scheduleSlotCoverage ?? null,
    calm15mCanonicalCount: calm15?.count ?? 0,
    calm15mMedianRetention: calm15?.median ?? null,
    calm60mCanonicalCount: calm60?.count ?? 0,
    calm60mMedianRetention: calm60?.median ?? null,
    displayedMedian: day.dailyReport?.railAndFunnel?.displayedCount?.median ?? null,
    belowSoftDepthFraction:
      day.dailyReport?.railAndFunnel?.belowSoftReviewDepth?.fraction ?? null,
  };
}

function buildReadiness(days, metrics, config, nowMs, inputManifest) {
  const failureReasonCodes = [];
  const insufficiencyReasonCodes = [];
  if (days.some(day => day.status === 'TECHNICAL_FAILURE')) {
    failureReasonCodes.push('technical_day_failure');
  }
  if (Number(inputManifest?.unassignedCount || 0) > 0) {
    failureReasonCodes.push('unassigned_artifact_evidence');
  }
  if (Number(inputManifest?.foreignStudyCount || 0) > 0) {
    failureReasonCodes.push('foreign_study_artifact');
  }
  if (days.some(day => day.validation?.decision === 'FAIL')) {
    failureReasonCodes.push('operational_validation_failure');
  }
  if (nowMs < Date.parse(config.pilotDecisionNotBefore)) {
    insufficiencyReasonCodes.push('pilot_window_not_complete');
  }
  if (metrics.operational.representedDayCount < config.pilotWindowDays) {
    insufficiencyReasonCodes.push('expected_dates_not_fully_represented');
  }
  if (metrics.operational.usableDayCount < TOP_STORIES_PILOT_THRESHOLDS.minimumUsableDays) {
    insufficiencyReasonCodes.push('insufficient_usable_days');
  }
  if (metrics.stability.calmEvidenceDayCount <
    TOP_STORIES_PILOT_THRESHOLDS.minimumCalmEvidenceDays) {
    insufficiencyReasonCodes.push('insufficient_calm_evidence_days');
  }
  if (metrics.stability.calm15mCanonicalComparisonCount <
    TOP_STORIES_PILOT_THRESHOLDS.minimumCalm15mCanonicalComparisons) {
    insufficiencyReasonCodes.push('insufficient_calm_15m_comparisons');
  }
  if (metrics.stability.calm60mCanonicalComparisonCount <
    TOP_STORIES_PILOT_THRESHOLDS.minimumCalm60mCanonicalComparisons) {
    insufficiencyReasonCodes.push('insufficient_calm_60m_comparisons');
  }
  return {
    decision: failureReasonCodes.length
      ? 'FAIL' : insufficiencyReasonCodes.length ? 'INSUFFICIENT' : 'READY_FOR_EXPERT_REVIEW',
    failureReasonCodes: [...new Set(failureReasonCodes)].sort(),
    insufficiencyReasonCodes: [...new Set(insufficiencyReasonCodes)].sort(),
  };
}

export function buildTopStoriesPilotDecision({
  canonicalArtifacts = [],
  inputManifest = {},
  studyConfig = {},
  nowMs = Date.now(),
} = {}) {
  const config = validatePilotConfiguration(studyConfig);
  const days = buildPilotDayRecords(canonicalArtifacts, config);
  const metrics = buildTopStoriesPilotMetrics(days);
  const readiness = buildReadiness(days, metrics, config, nowMs, inputManifest);
  const signals = buildPilotSignals(metrics);
  const recommendation = buildPilotRecommendation(readiness, signals);
  return {
    schemaVersion: TOP_STORIES_PILOT_DECISION_SCHEMA,
    studyId: config.studyId,
    pilotStartDate: config.pilotStartDate,
    pilotEndDate: config.pilotEndDate,
    pilotWindowDays: config.pilotWindowDays,
    generatedAt: new Date(nowMs).toISOString(),
    ...readiness,
    ...recommendation,
    signals,
    evidenceGaps: buildPilotEvidenceGaps(signals, metrics),
    thresholds: TOP_STORIES_PILOT_THRESHOLDS,
    days: days.map(daySummary),
    metrics,
    reviewChecklist: {
      sevenDatesRepresented: metrics.operational.representedDayCount === config.pilotWindowDays,
      minimumUsableDaysMet: metrics.operational.usableDayCount >=
        TOP_STORIES_PILOT_THRESHOLDS.minimumUsableDays,
      calm15mEvidenceMet: metrics.stability.calm15mCanonicalComparisonCount >=
        TOP_STORIES_PILOT_THRESHOLDS.minimumCalm15mCanonicalComparisons,
      calm60mEvidenceMet: metrics.stability.calm60mCanonicalComparisonCount >=
        TOP_STORIES_PILOT_THRESHOLDS.minimumCalm60mCanonicalComparisons,
      activeResponsivenessAssessed: signals.activeReady,
      expertApprovalRecorded: false,
    },
    productionChangeAuthorized: false,
    automaticPolicyChangeAuthorized: false,
  };
}
