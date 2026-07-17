function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function quantile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower));
}

function summarize(values = []) {
  const rows = values.map(finite).filter(value => value !== null);
  return {
    count: rows.length,
    median: quantile(rows, 0.5),
    p10: quantile(rows, 0.1),
    p25: quantile(rows, 0.25),
    p75: quantile(rows, 0.75),
    p90: quantile(rows, 0.9),
    minimum: rows.length ? Math.min(...rows) : null,
    maximum: rows.length ? Math.max(...rows) : null,
  };
}

function countPeriodClasses(rows = []) {
  return rows.reduce((counts, row) => {
    const key = row.period?.periodClass || 'unclassified';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function summarizeComparisons(rows = []) {
  return {
    comparisonCount: rows.length,
    eligibleComparisonCount: rows.filter(row => row.eligibleForHeadlineKpi).length,
    periodClassCounts: countPeriodClasses(rows),
    incumbentRetention: summarize(rows.map(row => row.metrics?.incumbentRetention)),
    newListContinuity: summarize(rows.map(row => row.metrics?.newListContinuity)),
    jaccard: summarize(rows.map(row => row.metrics?.jaccard)),
    normalizedWeightedRankDisplacement: summarize(
      rows.map(row => row.metrics?.normalizedWeightedRankDisplacement),
    ),
    countDelta: summarize(rows.map(row => row.metrics?.countDelta)),
    entrantCount: summarize(rows.map(row => row.metrics?.entrantCount)),
    exitCount: summarize(rows.map(row => row.metrics?.exitCount)),
  };
}

function getInputClass(prior, current) {
  if (!prior?.inputDigest || !current?.inputDigest) return 'unknown';
  return prior.inputDigest === current.inputDigest ? 'unchanged' : 'changed';
}

function summarizePairPopulation(rows, observationMap, targetIds) {
  const populations = { unchanged: [], changed: [], unknown: [] };
  rows.forEach(row => {
    if (!targetIds.has(row.priorObservationId)) return;
    const prior = observationMap.get(row.priorObservationId);
    const current = observationMap.get(row.currentObservationId);
    populations[getInputClass(prior, current)].push(row);
  });
  return {
    unchangedInput: summarizeComparisons(populations.unchanged),
    changedInput: summarizeComparisons(populations.changed),
    unknownInput: summarizeComparisons(populations.unknown),
  };
}

export function buildTopStoriesInputChangeAnalytics(replay, targetObservations = []) {
  const observationMap = new Map((replay?.canonicalObservations || []).map(row => [
    row.observationId,
    row,
  ]));
  const targetIds = new Set(targetObservations.map(row => row.observationId));
  return {
    fifteenMinute: {
      overlapping: summarizePairPopulation(
        replay?.pairComparisons?.fifteenMinute || [],
        observationMap,
        targetIds,
      ),
      canonicalNonOverlapping: summarizePairPopulation(
        replay?.pairComparisons?.fifteenMinuteCanonical || [],
        observationMap,
        targetIds,
      ),
    },
    sixtyMinute: {
      overlapping: summarizePairPopulation(
        replay?.pairComparisons?.sixtyMinute || [],
        observationMap,
        targetIds,
      ),
      canonicalNonOverlapping: summarizePairPopulation(
        replay?.pairComparisons?.sixtyMinuteCanonical || [],
        observationMap,
        targetIds,
      ),
    },
    interpretation: 'Input classes compare canonical inputDigest values. They do not infer publisher changes or recreate ranking.',
  };
}
