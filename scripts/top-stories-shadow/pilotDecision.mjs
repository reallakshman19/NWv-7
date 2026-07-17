import { buildTopStoriesPilotMetrics } from './pilotMetrics.mjs';

export const TOP_STORIES_PILOT_DECISION_SCHEMA =
  'nw-top-stories-seven-day-pilot-decision/v1';

export const TOP_STORIES_PILOT_THRESHOLDS = Object.freeze({
  expectedDays: 7,
  minimumUsableDays: 6,
  minimumCalmEvidenceDays: 4,
  minimumCalm15mCanonicalComparisons: 80,
  minimumCalm60mCanonicalComparisons: 30,
  minimumActiveEvidenceDays: 2,
  minimumActiveCanonicalComparisons: 3,
  calm15mRetention: 0.90,
  calm60mRetention: 0.80,
  softDisplayDepth: 8,
  maximumBelowSoftDepthFraction: 0.20,
  minimumUnchanged15mComparisons: 10,
  minimumUnchanged60mComparisons: 5,
});

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
  if (!Number.isInteger(days) || days <= 0 || days > 31) {
    throw new Error('pilotWindowDays must be an integer from 1 to 31');
  }
  if (!Number.isFinite(Date.parse(config.pilotDecisionNotBefore))) {
    throw new Error('pilotDecisionNotBefore must be a valid timestamp');
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

function expectedSegment(config) {
  return [
    config.studyId,
    config.rankerVersion,
    config.identityVersion,
    config.periodClassifierVersion,
  ].join('|');
}

function mapArtifacts(records, type, studyId) {
  return new Map(records
    .filter(record => record.type === type && record.studyId === studyId)
    .map(record => [record.date, record]));
}

function classifyDay(date, daily, validation, config) {
  const errors = [];
  if (!daily) errors.push('missing_daily_artifact');
  if (!validation) errors.push('missing_validation_artifact');
  if (daily && !daily.schemaValid) errors.push('invalid_daily_artifact');
  if (validation && !validation.schemaValid) errors.push('invalid_validation_artifact');
  if (daily?.dailyReport?.date && daily.dailyReport.date !== date) errors.push('daily_date_mismatch');
  if (validation?.validation?.date && validation.validation.date !== date) {
    errors.push('validation_date_mismatch');
  }
  const segments = daily?.dailyReport?.versionSegments || [];
  if (daily?.dailyReport?.status === 'OBSERVED' &&
    (segments.length !== 1 || segments[0] !== expectedSegment(config))) {
    errors.push('version_segment_mismatch');
  }
  const validationDecision = validation?.validation?.decision || null;
  let status = 'MISSING';
  if (errors.some(code => code.startsWith('invalid_') || code.endsWith('_mismatch'))) {
    status = 'TECHNICAL_FAILURE';
  } else if (validationDecision === 'FAIL') {
    status = 'TECHNICAL_FAILURE';
  } else if (validationDecision === 'PASS') {
    status = daily?.dailyReport?.status === 'OBSERVED' ? 'USABLE_PASS' : 'INSUFFICIENT';
  } else if (validationDecision === 'PASS_WITH_WARNINGS') {
    status = daily?.dailyReport?.status === 'OBSERVED' ? 'USABLE_WARNING' : 'INSUFFICIENT';
  } else if (validationDecision === 'INSUFFICIENT' || daily || validation) {
    status = 'INSUFFICIENT';
  }
  const usable = ['USABLE_PASS', 'USABLE_WARNING'].includes(status);
  return {
    date,
    status,
    usable,
    errors,
    dailyReport: daily?.dailyReport || null,
    validation: validation?.validation || null,
    dailyArtifactId: daily?.artifactId || null,
    validationArtifactId: validation?.artifactId || null,
  };
}

export function buildPilotDayRecords(canonicalArtifacts = [], config = {}) {
  const validConfig = validatePilotConfiguration(config);
  const expectedDates = getPilotExpectedDates(validConfig);
  const dailyByDate = mapArtifacts(canonicalArtifacts, 'daily', validConfig.studyId);
  const validationByDate = mapArtifacts(canonicalArtifacts, 'validation', validConfig.studyId);
  return expectedDates.map(date => classifyDay(
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
  const technicalDays = days.filter(day => day.status === 'TECHNICAL_FAILURE');
  if (technicalDays.length) failureReasonCodes.push('technical_day_failure');
  if (Number(inputManifest?.unassignedCount || 0) > 0) {
    failureReasonCodes.push('unassigned_artifact_evidence');
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
  const decision = failureReasonCodes.length
    ? 'FAIL'
    : insufficiencyReasonCodes.length ? 'INSUFFICIENT' : 'READY_FOR_EXPERT_REVIEW';
  return {
    decision,
    failureReasonCodes: [...new Set(failureReasonCodes)].sort(),
    insufficiencyReasonCodes: [...new Set(insufficiencyReasonCodes)].sort(),
  };
}

function buildSignals(metrics) {
  const belowSoft = metrics.railAndFunnel.belowSoftReviewDepth.fraction;
  const displayedMedian = metrics.railAndFunnel.displayedCount.median;
  const recallSignal = Number.isFinite(displayedMedian) &&
    displayedMedian < TOP_STORIES_PILOT_THRESHOLDS.softDisplayDepth ||
    Number.isFinite(belowSoft) &&
    belowSoft > TOP_STORIES_PILOT_THRESHOLDS.maximumBelowSoftDepthFraction;
  const calm15 = metrics.stability.calm15mDailyMedian.median;
  const calm60 = metrics.stability.calm60mDailyMedian.median;
  const stabilitySignal = Number.isFinite(calm15) &&
    calm15 < TOP_STORIES_PILOT_THRESHOLDS.calm15mRetention ||
    Number.isFinite(calm60) &&
    calm60 < TOP_STORIES_PILOT_THRESHOLDS.calm60mRetention;
  const unchanged15 = metrics.inputChange.fifteenMinute.unchangedInput;
  const unchanged60 = metrics.inputChange.sixtyMinute.unchangedInput;
  const unchangedInstability =
    unchanged15.comparisonCount >= TOP_STORIES_PILOT_THRESHOLDS.minimumUnchanged15mComparisons &&
      unchanged15.dailyMedianIncumbentRetention.median <
        TOP_STORIES_PILOT_THRESHOLDS.calm15mRetention ||
    unchanged60.comparisonCount >= TOP_STORIES_PILOT_THRESHOLDS.minimumUnchanged60mComparisons &&
      unchanged60.dailyMedianIncumbentRetention.median <
        TOP_STORIES_PILOT_THRESHOLDS.calm60mRetention;
  const activeComparisonCount = metrics.stability.active15mCanonicalComparisonCount +
    metrics.stability.active60mCanonicalComparisonCount;
  const activeReady = metrics.stability.activeEvidenceDays.length >=
    TOP_STORIES_PILOT_THRESHOLDS.minimumActiveEvidenceDays &&
    activeComparisonCount >= TOP_STORIES_PILOT_THRESHOLDS.minimumActiveCanonicalComparisons;
  return { recallSignal, stabilitySignal, unchangedInstability, activeReady };
}

function buildRecommendation(readiness, signals) {
  if (readiness.decision === 'FAIL') {
    return { recommendation: 'OPERATIONAL_REPAIR_REQUIRED', reasonCodes: ['technical_evidence_failure'] };
  }
  if (readiness.decision !== 'READY_FOR_EXPERT_REVIEW') {
    return { recommendation: 'CONTINUE_OBSERVATION', reasonCodes: ['minimum_evidence_not_met'] };
  }
  const persistenceReady = signals.stabilitySignal && signals.unchangedInstability && signals.activeReady;
  if (signals.recallSignal && persistenceReady) {
    return {
      recommendation: 'COMBINED_RECALL_AND_PERSISTENCE_CANDIDATE',
      reasonCodes: ['rail_sufficiency_below_review_target', 'unchanged_input_instability', 'active_responsiveness_observed'],
    };
  }
  if (signals.recallSignal) {
    return {
      recommendation: 'RECALL_REPAIR_CANDIDATE',
      reasonCodes: ['rail_sufficiency_below_review_target'],
    };
  }
  if (persistenceReady) {
    return {
      recommendation: 'PERSISTENCE_CANDIDATE',
      reasonCodes: ['unchanged_input_instability', 'active_responsiveness_observed'],
    };
  }
  if (signals.stabilitySignal) {
    return {
      recommendation: 'CONTINUE_OBSERVATION',
      reasonCodes: ['stability_signal_not_persistence_decision_ready'],
    };
  }
  return { recommendation: 'RETAIN_CURRENT_POLICY', reasonCodes: ['rail_and_stability_review_targets_met'] };
}

function buildEvidenceGaps(signals, metrics) {
  const gaps = [];
  if (!signals.activeReady) gaps.push('active_responsiveness_not_sufficiently_observed');
  if (metrics.inputChange.fifteenMinute.unchangedInput.comparisonCount <
    TOP_STORIES_PILOT_THRESHOLDS.minimumUnchanged15mComparisons) {
    gaps.push('unchanged_input_15m_evidence_limited');
  }
  if (metrics.railAndFunnel.unresolvedIdentityCount > 0) {
    gaps.push('unresolved_displayed_identities_present');
  }
  return gaps.sort();
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
  const signals = buildSignals(metrics);
  const recommendation = buildRecommendation(readiness, signals);
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
    evidenceGaps: buildEvidenceGaps(signals, metrics),
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
