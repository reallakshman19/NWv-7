import {
  isUsablePilotDay,
  mergeCountMaps,
  summarizePilotValues,
} from './pilotStatistics.mjs';

export function getUsablePilotObservations(days = []) {
  return days.filter(isUsablePilotDay).flatMap(day =>
    (day.dailyReport?.railAndFunnel?.observations || []).map(row => ({
      ...row,
      date: day.date,
    })))
    .sort((left, right) => String(left.scheduledAt).localeCompare(String(right.scheduledAt)));
}

export function buildPilotRailMetrics(days = []) {
  const usable = days.filter(isUsablePilotDay);
  const observations = getUsablePilotObservations(days);
  const railBuckets = { '0': 0, '1-3': 0, '4-7': 0, '8-9': 0, '10': 0, other: 0 };
  const reasonCounts = {};
  const categoryReasonCounts = {};
  usable.forEach(day => {
    const rail = day.dailyReport?.railAndFunnel || {};
    mergeCountMaps(railBuckets, rail.railBuckets);
    mergeCountMaps(reasonCounts, rail.finalReasonCounts);
    mergeCountMaps(reasonCounts, rail.candidateBuildReasonCounts);
    mergeCountMaps(categoryReasonCounts, rail.categoryReasonCounts);
  });
  const belowSoftCount = usable.reduce((sum, day) =>
    sum + Number(day.dailyReport?.railAndFunnel?.belowSoftReviewDepth?.count || 0), 0);
  const underfilledCount = usable.reduce((sum, day) =>
    sum + Number(day.dailyReport?.railAndFunnel?.underfilledAgainstDisplayDepth?.count || 0), 0);
  const unresolvedIdentityCount = observations.reduce((sum, row) =>
    sum + Number(row.displayedUnresolvedIdentityCount || 0), 0);
  return {
    observationCount: observations.length,
    displayedCount: summarizePilotValues(observations.map(row => row.displayedCount)),
    rankedCount: summarizePilotValues(observations.map(row => row.rankedCount)),
    railBuckets,
    belowSoftReviewDepth: {
      count: belowSoftCount,
      fraction: observations.length ? belowSoftCount / observations.length : null,
    },
    underfilledAgainstDisplayDepth: {
      count: underfilledCount,
      fraction: observations.length ? underfilledCount / observations.length : null,
    },
    resolvedIdentityCount: observations.reduce((sum, row) =>
      sum + Number(row.displayedResolvedIdentityCount || 0), 0),
    unresolvedIdentityCount,
    reasonCounts: Object.fromEntries(Object.entries(reasonCounts).sort()),
    categoryReasonCounts: Object.fromEntries(Object.entries(categoryReasonCounts).sort()),
    dominantReasonCodes: Object.entries(reasonCounts)
      .filter(([reason]) => !['displayed', 'candidate_created'].includes(reason))
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 12)
      .map(([reasonCode, count]) => ({ reasonCode, count })),
  };
}

function getInputPopulation(day, horizon, inputClass) {
  return day.dailyReport?.inputChange?.[horizon]?.canonicalNonOverlapping?.[inputClass] || {};
}

function summarizeInputClass(days, horizon, inputClass) {
  const rows = days.filter(isUsablePilotDay)
    .map(day => getInputPopulation(day, horizon, inputClass));
  return {
    comparisonCount: rows.reduce((sum, row) => sum + Number(row.comparisonCount || 0), 0),
    eligibleComparisonCount: rows.reduce(
      (sum, row) => sum + Number(row.eligibleComparisonCount || 0),
      0,
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

export function buildPilotInputChangeMetrics(days = []) {
  return {
    fifteenMinute: {
      unchangedInput: summarizeInputClass(days, 'fifteenMinute', 'unchangedInput'),
      changedInput: summarizeInputClass(days, 'fifteenMinute', 'changedInput'),
      unknownInput: summarizeInputClass(days, 'fifteenMinute', 'unknownInput'),
    },
    sixtyMinute: {
      unchangedInput: summarizeInputClass(days, 'sixtyMinute', 'unchangedInput'),
      changedInput: summarizeInputClass(days, 'sixtyMinute', 'changedInput'),
      unknownInput: summarizeInputClass(days, 'sixtyMinute', 'unknownInput'),
    },
  };
}
