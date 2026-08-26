export const SECTIONS_QUALIFICATION_SCHEMA = 'nw-sections-shadow-qualification/v1';

export const SECTIONS_QUALIFICATION_THRESHOLDS = Object.freeze({
  minimumCalendarDays: 7,
  minimumComparableEpochs: 200,
  minimumCanonicalReferenceCoverage: 0.95,
  minimumShadowPrecision: 0.95,
  minimumTop10OverlapRate: 0.90,
  requiredLaneCount: 41,
  maximumStaleAdmissions: 0,
  maximumPolicyViolations: 0,
  maximumFalsePublisherCorroborations: 0,
  maximumUnknownCriticalDrifts: 0,
  minimumEvidenceVerificationRate: 1,
});

const QUALIFICATION_TIME_ZONE = 'Asia/Kolkata';
const DAYPARTS = Object.freeze(['overnight', 'morning', 'afternoon', 'evening']);

function localParts(nowMs) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: QUALIFICATION_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(nowMs)).map(part => [part.type, part.value]));
  const hour = Number(parts.hour);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    daypart: hour < 6 ? 'overnight' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening',
  };
}

function rate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function isCriticalDrift(report) {
  return report.classification === 'UNKNOWN_DRIFT' || report.classification === 'INFRASTRUCTURE_DRIFT';
}

function hasSafetyMetrics(metrics) {
  return ['staleAdmissionCount', 'policyViolationCount', 'falsePublisherCorroborationCount']
    .every(key => Number.isInteger(metrics?.[key]) && metrics[key] >= 0);
}

function isComparable(report, thresholds) {
  return report?.schemaVersion === 'nw-sections-live-parity-report/v1' &&
    Number.isFinite(report.referenceNowMs) &&
    report.shadowEvidenceVerified === true &&
    !isCriticalDrift(report) &&
    report.metrics?.referenceLaneCount === thresholds.requiredLaneCount &&
    report.metrics?.shadowLaneCount === thresholds.requiredLaneCount &&
    hasSafetyMetrics(report.metrics);
}

function gate(name, passed, actual, required) {
  return { name, passed, actual, required };
}

export function qualifySectionsShadow(reports, options = {}) {
  const thresholds = Object.freeze({ ...SECTIONS_QUALIFICATION_THRESHOLDS, ...(options.thresholds || {}) });
  const uniqueEpochs = new Map();
  for (const report of reports || []) {
    if (!report?.shadowEpochId) continue;
    if (uniqueEpochs.has(report.shadowEpochId)) throw new Error(`Duplicate shadow epoch ${report.shadowEpochId}`);
    uniqueEpochs.set(report.shadowEpochId, report);
  }
  const allReports = [...uniqueEpochs.values()].sort((a, b) => a.referenceNowMs - b.referenceNowMs);
  const comparable = allReports.filter(report => isComparable(report, thresholds));
  const criticalDriftCount = allReports.filter(isCriticalDrift).length;
  const calendarDates = new Set();
  const dayparts = new Set();
  let weekendObserved = false;
  let displayedOverlap = 0;
  let referenceDisplayed = 0;
  let shadowDisplayed = 0;
  let top10Denominator = 0;
  let verifiedCount = 0;
  let staleAdmissionCount = 0;
  let policyViolationCount = 0;
  let falsePublisherCorroborationCount = 0;

  for (const report of comparable) {
    const local = localParts(report.referenceNowMs);
    calendarDates.add(local.date);
    dayparts.add(local.daypart);
    weekendObserved ||= local.weekday === 'Sat' || local.weekday === 'Sun';
    const metrics = report.metrics;
    displayedOverlap += metrics.displayedOverlap;
    referenceDisplayed += metrics.displayedReferenceCount;
    shadowDisplayed += metrics.displayedShadowCount;
    top10Denominator += Math.max(metrics.displayedReferenceCount, metrics.displayedShadowCount);
    verifiedCount += report.shadowEvidenceVerified === true ? 1 : 0;
    staleAdmissionCount += metrics.staleAdmissionCount;
    policyViolationCount += metrics.policyViolationCount;
    falsePublisherCorroborationCount += metrics.falsePublisherCorroborationCount;
  }

  const metrics = {
    observedReportCount: allReports.length,
    comparableEpochCount: comparable.length,
    calendarDayCount: calendarDates.size,
    weekendObserved,
    observedDayparts: DAYPARTS.filter(value => dayparts.has(value)),
    canonicalReferenceCoverage: rate(displayedOverlap, referenceDisplayed),
    shadowPrecision: rate(displayedOverlap, shadowDisplayed),
    top10OverlapRate: rate(displayedOverlap, top10Denominator),
    evidenceVerificationRate: rate(verifiedCount, comparable.length),
    staleAdmissionCount,
    policyViolationCount,
    falsePublisherCorroborationCount,
    unknownCriticalDriftCount: criticalDriftCount,
  };
  const gates = [
    gate('calendar_window', metrics.calendarDayCount >= thresholds.minimumCalendarDays,
      metrics.calendarDayCount, thresholds.minimumCalendarDays),
    gate('comparable_epochs', metrics.comparableEpochCount >= thresholds.minimumComparableEpochs,
      metrics.comparableEpochCount, thresholds.minimumComparableEpochs),
    gate('weekend_coverage', metrics.weekendObserved, metrics.weekendObserved, true),
    gate('daypart_coverage', metrics.observedDayparts.length === DAYPARTS.length,
      metrics.observedDayparts, DAYPARTS),
    gate('canonical_reference_coverage',
      metrics.canonicalReferenceCoverage >= thresholds.minimumCanonicalReferenceCoverage,
      metrics.canonicalReferenceCoverage, thresholds.minimumCanonicalReferenceCoverage),
    gate('shadow_precision', metrics.shadowPrecision >= thresholds.minimumShadowPrecision,
      metrics.shadowPrecision, thresholds.minimumShadowPrecision),
    gate('top10_overlap', metrics.top10OverlapRate >= thresholds.minimumTop10OverlapRate,
      metrics.top10OverlapRate, thresholds.minimumTop10OverlapRate),
    gate('stale_admissions', metrics.staleAdmissionCount <= thresholds.maximumStaleAdmissions,
      metrics.staleAdmissionCount, thresholds.maximumStaleAdmissions),
    gate('policy_violations', metrics.policyViolationCount <= thresholds.maximumPolicyViolations,
      metrics.policyViolationCount, thresholds.maximumPolicyViolations),
    gate('false_publisher_corroboration',
      metrics.falsePublisherCorroborationCount <= thresholds.maximumFalsePublisherCorroborations,
      metrics.falsePublisherCorroborationCount, thresholds.maximumFalsePublisherCorroborations),
    gate('unknown_critical_drift', metrics.unknownCriticalDriftCount <= thresholds.maximumUnknownCriticalDrifts,
      metrics.unknownCriticalDriftCount, thresholds.maximumUnknownCriticalDrifts),
    gate('evidence_verification', metrics.evidenceVerificationRate >= thresholds.minimumEvidenceVerificationRate,
      metrics.evidenceVerificationRate, thresholds.minimumEvidenceVerificationRate),
  ];
  return {
    schemaVersion: SECTIONS_QUALIFICATION_SCHEMA,
    generatedAtMs: Number(options.generatedAtMs ?? Date.now()),
    timeZone: QUALIFICATION_TIME_ZONE,
    status: gates.every(item => item.passed) ? 'QUALIFIED' : 'NOT_QUALIFIED',
    thresholds,
    metrics,
    gates,
    firstComparableEpochMs: comparable[0]?.referenceNowMs ?? null,
    lastComparableEpochMs: comparable.at(-1)?.referenceNowMs ?? null,
  };
}
