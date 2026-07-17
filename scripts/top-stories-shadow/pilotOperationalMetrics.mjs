import {
  incrementCount,
  isUsablePilotDay,
  summarizePilotValues,
} from './pilotStatistics.mjs';

function getCalmMetric(day, horizon) {
  return day.dailyReport?.stability?.[horizon]?.canonicalNonOverlapping?.calm?.incumbentRetention || {};
}

function getCanonicalPeriodCounts(day, horizon) {
  return day.dailyReport?.stability?.[horizon]?.canonicalNonOverlapping?.periodClassCounts || {};
}

export function buildPilotOperationalMetrics(days = []) {
  const validationDecisionCounts = {};
  days.forEach(day => incrementCount(
    validationDecisionCounts,
    day.validation?.decision || day.status || 'MISSING',
  ));
  const usable = days.filter(isUsablePilotDay);
  return {
    expectedDayCount: days.length,
    representedDayCount: days.filter(day => day.dailyReport || day.validation).length,
    usableDayCount: usable.length,
    validationDecisionCounts,
    scheduleSlotCoverage: summarizePilotValues(usable.map(day =>
      day.dailyReport?.coverage?.scheduleSlotCoverage)),
    artifactEmissionRate: summarizePilotValues(usable.map(day =>
      day.validation?.metrics?.artifactEmissionRate)),
    completeRunRate: summarizePilotValues(usable.map(day =>
      day.validation?.metrics?.completeRunRate)),
    analyticalEligibilityRate: summarizePilotValues(usable.map(day =>
      day.validation?.metrics?.analyticalEligibilityRate)),
    p90ScheduleDelaySeconds: summarizePilotValues(usable.map(day =>
      day.validation?.metrics?.p90ScheduleDelaySeconds)),
  };
}

export function buildPilotStabilityMetrics(days = []) {
  const usable = days.filter(isUsablePilotDay);
  const calm15 = usable.map(day => getCalmMetric(day, 'fifteenMinute'));
  const calm60 = usable.map(day => getCalmMetric(day, 'sixtyMinute'));
  const active15ByDay = usable.map(day => ({
    date: day.date,
    count: Number(getCanonicalPeriodCounts(day, 'fifteenMinute').active || 0),
  }));
  const active60ByDay = usable.map(day => ({
    date: day.date,
    count: Number(getCanonicalPeriodCounts(day, 'sixtyMinute').active || 0),
  }));
  return {
    calm15mDailyMedian: summarizePilotValues(calm15.map(row => row.median)),
    calm60mDailyMedian: summarizePilotValues(calm60.map(row => row.median)),
    calm15mCanonicalComparisonCount: calm15.reduce(
      (sum, row) => sum + Number(row.count || 0),
      0,
    ),
    calm60mCanonicalComparisonCount: calm60.reduce(
      (sum, row) => sum + Number(row.count || 0),
      0,
    ),
    calmEvidenceDayCount: usable.filter(day =>
      Number(getCalmMetric(day, 'fifteenMinute').count || 0) > 0 ||
      Number(getCalmMetric(day, 'sixtyMinute').count || 0) > 0).length,
    active15mCanonicalComparisonCount: active15ByDay.reduce(
      (sum, row) => sum + row.count,
      0,
    ),
    active60mCanonicalComparisonCount: active60ByDay.reduce(
      (sum, row) => sum + row.count,
      0,
    ),
    activeEvidenceDays: [...new Set([
      ...active15ByDay.filter(row => row.count > 0).map(row => row.date),
      ...active60ByDay.filter(row => row.count > 0).map(row => row.date),
    ])].sort(),
  };
}
