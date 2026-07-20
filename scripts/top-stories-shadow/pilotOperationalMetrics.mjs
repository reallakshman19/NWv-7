import {
  incrementCount,
  isUsablePilotDay,
  summarizePilotValues,
} from './pilotStatistics.mjs';
import {
  summarizeTopStoriesComparisons,
  summarizeTopStoriesInputChange,
} from './comparisonEvidence.mjs';
import { validateTopStoriesPilotComparisonEvidence } from './comparisonEvidenceValidation.mjs';

function resolveEvidence(days, evidenceValidation) {
  return evidenceValidation || validateTopStoriesPilotComparisonEvidence(days);
}

function recordsForDay(evidence, horizon, date) {
  return (evidence?.recordsByHorizon?.[horizon] || []).filter(row => row.date === date);
}

function dayStability(evidence, horizon, date) {
  return summarizeTopStoriesComparisons(recordsForDay(evidence, horizon, date));
}

export function buildPilotOperationalMetrics(days = []) {
  const validationDecisionCounts = {};
  days.forEach(day => incrementCount(
    validationDecisionCounts,
    day.validation?.decision || day.status || 'MISSING',
  ));
  const usable = days.filter(day => day.usable === true && isUsablePilotDay(day));
  return {
    expectedDayCount: days.length,
    representedDayCount: days.filter(day => day.dailyReport && day.validation).length,
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

export function buildPilotStabilityMetrics(days = [], evidenceValidation = null) {
  const evidence = resolveEvidence(days, evidenceValidation);
  const usable = days.filter(day => day.usable === true && isUsablePilotDay(day));
  const calm15 = usable.map(day => ({
    date: day.date,
    metric: dayStability(evidence, 'fifteenMinute', day.date).calm.incumbentRetention,
  }));
  const calm60 = usable.map(day => ({
    date: day.date,
    metric: dayStability(evidence, 'sixtyMinute', day.date).calm.incumbentRetention,
  }));
  const active15ByDay = usable.map(day => ({
    date: day.date,
    count: Number(dayStability(evidence, 'fifteenMinute', day.date).periodClassCounts.active || 0),
  }));
  const active60ByDay = usable.map(day => ({
    date: day.date,
    count: Number(dayStability(evidence, 'sixtyMinute', day.date).periodClassCounts.active || 0),
  }));
  return {
    calm15mDailyMedian: summarizePilotValues(calm15.map(row => row.metric.median)),
    calm60mDailyMedian: summarizePilotValues(calm60.map(row => row.metric.median)),
    calm15mCanonicalComparisonCount: calm15.reduce(
      (sum, row) => sum + Number(row.metric.count || 0), 0,
    ),
    calm60mCanonicalComparisonCount: calm60.reduce(
      (sum, row) => sum + Number(row.metric.count || 0), 0,
    ),
    calmEvidenceDayCount: new Set([
      ...calm15.filter(row => Number(row.metric.count || 0) > 0).map(row => row.date),
      ...calm60.filter(row => Number(row.metric.count || 0) > 0).map(row => row.date),
    ]).size,
    active15mCanonicalComparisonCount: active15ByDay.reduce(
      (sum, row) => sum + row.count, 0,
    ),
    active60mCanonicalComparisonCount: active60ByDay.reduce(
      (sum, row) => sum + row.count, 0,
    ),
    activeEvidenceDays: [...new Set([
      ...active15ByDay.filter(row => row.count > 0).map(row => row.date),
      ...active60ByDay.filter(row => row.count > 0).map(row => row.date),
    ])].sort(),
  };
}

function summarizeInputClass(days, evidence, horizon, inputClass) {
  const rows = days.filter(day => day.usable === true && isUsablePilotDay(day)).map(day => {
    const summary = summarizeTopStoriesInputChange(recordsForDay(evidence, horizon, day.date));
    return summary[inputClass] || {};
  });
  return {
    comparisonCount: rows.reduce((sum, row) => sum + Number(row.comparisonCount || 0), 0),
    eligibleComparisonCount: rows.reduce(
      (sum, row) => sum + Number(row.eligibleComparisonCount || 0), 0,
    ),
    dailyMedianIncumbentRetention: summarizePilotValues(
      rows.map(row => row.incumbentRetention?.median),
    ),
    dailyMedianJaccard: summarizePilotValues(rows.map(row => row.jaccard?.median)),
    dailyMedianRankDisplacement: summarizePilotValues(
      rows.map(row => row.normalizedWeightedRankDisplacement?.median),
    ),
  };
}

export function buildPilotInputChangeMetrics(days = [], evidenceValidation = null) {
  const evidence = resolveEvidence(days, evidenceValidation);
  const build = horizon => ({
    unchangedInput: summarizeInputClass(days, evidence, horizon, 'unchangedInput'),
    changedInput: summarizeInputClass(days, evidence, horizon, 'changedInput'),
    unknownInput: summarizeInputClass(days, evidence, horizon, 'unknownInput'),
  });
  return {
    fifteenMinute: build('fifteenMinute'),
    sixtyMinute: build('sixtyMinute'),
  };
}
