import { digestCanonicalJson } from './canonicalJson.mjs';

export const TOP_STORIES_COMPARISON_EVIDENCE_SCHEMA =
  'nw-top-stories-comparison-evidence/v1';

export const TOP_STORIES_COMPARISON_HORIZONS = Object.freeze({
  fifteenMinute: 15 * 60 * 1000,
  sixtyMinute: 60 * 60 * 1000,
});

const HORIZON_ORDER = Object.freeze({ fifteenMinute: 0, sixtyMinute: 1 });
const METRIC_KEYS = Object.freeze([
  'incumbentRetention',
  'newListContinuity',
  'jaccard',
  'numberOneContinuity',
  'normalizedWeightedRankDisplacement',
  'countDelta',
  'entrantCount',
  'exitCount',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function pairKey(anchorObservationId, currentObservationId) {
  return `${anchorObservationId}\u0000${currentObservationId}`;
}

function utcDate(value) {
  const time = Date.parse(value || 0);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
}

function metricEvidence(metrics = {}) {
  return Object.fromEntries(METRIC_KEYS.map(key => [
    key,
    metrics[key] === undefined ? null : metrics[key],
  ]));
}

export function buildTopStoriesComparisonIdentityTuple({
  studyId,
  horizon,
  segmentKey,
  anchorObservationId,
  currentObservationId,
  targetHorizonMs,
} = {}) {
  return Object.freeze([
    String(studyId || ''),
    String(horizon || ''),
    String(segmentKey || ''),
    String(anchorObservationId || ''),
    String(currentObservationId || ''),
    Number(targetHorizonMs),
  ]);
}

export function buildTopStoriesComparisonId(input = {}) {
  return digestCanonicalJson(buildTopStoriesComparisonIdentityTuple(input));
}

export function classifyTopStoriesComparisonInput(anchor = {}, current = {}) {
  if (!anchor.inputDigest || !current.inputDigest) return 'unknown';
  return anchor.inputDigest === current.inputDigest ? 'unchanged' : 'changed';
}

function indexComparisons(rows = [], horizon) {
  const map = new Map();
  rows.forEach(row => {
    const key = pairKey(row?.priorObservationId, row?.currentObservationId);
    if (!row?.priorObservationId || !row?.currentObservationId || map.has(key)) {
      throw new Error(`comparison_join_invalid:${horizon}:${key}`);
    }
    map.set(key, row);
  });
  return map;
}

function buildRecord(studyId, horizon, pair, comparison) {
  const anchorScheduledAt = pair?.anchor?.scheduledAt || null;
  const currentScheduledAt = pair?.current?.scheduledAt || null;
  const record = {
    horizon,
    anchorObservationId: pair.anchorId,
    currentObservationId: pair.currentId,
    anchorScheduledAt,
    currentScheduledAt,
    anchorAt: pair.anchorAt,
    currentAt: pair.currentAt,
    ownerDate: utcDate(anchorScheduledAt),
    intervalMs: pair.intervalMs,
    targetHorizonMs: pair.targetHorizonMs,
    intervalErrorMs: pair.intervalErrorMs,
    segmentKey: pair.segmentKey,
    periodClass: comparison?.period?.periodClass || 'unclassified',
    inputClass: classifyTopStoriesComparisonInput(pair.anchor, pair.current),
    eligibleForHeadlineKpi: comparison?.eligibleForHeadlineKpi === true,
    comparisonEligibilityReasons: [...new Set(
      comparison?.comparisonEligibilityReasons || [],
    )].sort(),
    metrics: metricEvidence(comparison?.metrics),
  };
  return {
    comparisonId: buildTopStoriesComparisonId({ studyId, ...record }),
    ...record,
  };
}

function buildHorizonEvidence(replay, studyId, horizon, ownerDate) {
  const pairSet = replay?.pairSets?.[horizon];
  const comparisons = replay?.pairComparisons?.[horizon];
  if (!pairSet || !Array.isArray(pairSet.pairs) || !Array.isArray(comparisons)) {
    throw new Error(`comparison_source_missing:${horizon}`);
  }
  const comparisonMap = indexComparisons(comparisons, horizon);
  const allRecords = pairSet.pairs.map(pair => {
    const key = pairKey(pair.anchorId, pair.currentId);
    const comparison = comparisonMap.get(key);
    if (!comparison) throw new Error(`comparison_join_missing:${horizon}:${key}`);
    comparisonMap.delete(key);
    return buildRecord(studyId, horizon, pair, comparison);
  });
  if (comparisonMap.size > 0) throw new Error(`comparison_join_orphan:${horizon}`);
  const records = allRecords.filter(row => row.ownerDate === ownerDate);
  const recordIds = new Set(records.map(row => row.comparisonId));
  const canonicalIds = (pairSet.canonicalPairs || [])
    .filter(pair => utcDate(pair?.anchor?.scheduledAt) === ownerDate)
    .map(pair => {
      const record = buildRecord(
        studyId,
        horizon,
        pair,
        indexComparisons(comparisons, horizon).get(pairKey(pair.anchorId, pair.currentId)),
      );
      if (!recordIds.has(record.comparisonId)) {
        throw new Error(`canonical_comparison_reference_unknown:${horizon}`);
      }
      return record.comparisonId;
    });
  return { records, canonicalIds };
}

function recordOrder(left, right) {
  return (HORIZON_ORDER[left.horizon] ?? 99) - (HORIZON_ORDER[right.horizon] ?? 99) ||
    left.anchorAt - right.anchorAt || left.currentAt - right.currentAt ||
    left.comparisonId.localeCompare(right.comparisonId);
}

export function buildTopStoriesComparisonEvidence(replay, options = {}) {
  const studyId = String(options.studyId || replay?.canonicalObservations?.[0]?.studyId || '');
  const ownerDate = String(options.ownerDate || '');
  if (!studyId || !/^\d{4}-\d{2}-\d{2}$/.test(ownerDate)) {
    throw new Error('comparison_evidence_context_invalid');
  }
  const fifteen = buildHorizonEvidence(replay, studyId, 'fifteenMinute', ownerDate);
  const sixty = buildHorizonEvidence(replay, studyId, 'sixtyMinute', ownerDate);
  const comparisonRecords = [...fifteen.records, ...sixty.records].sort(recordOrder);
  const canonicalComparisonIds = [...fifteen.canonicalIds, ...sixty.canonicalIds].sort();
  const overlappingCount = fifteen.records.length + sixty.records.length;
  const canonicalCount = fifteen.canonicalIds.length + sixty.canonicalIds.length;
  const evidence = {
    schemaVersion: TOP_STORIES_COMPARISON_EVIDENCE_SCHEMA,
    studyId,
    ownerDate,
    comparisonRecords,
    canonicalComparisonIds,
    horizonCounts: {
      fifteenMinute: {
        overlapping: fifteen.records.length,
        canonicalNonOverlapping: fifteen.canonicalIds.length,
      },
      sixtyMinute: {
        overlapping: sixty.records.length,
        canonicalNonOverlapping: sixty.canonicalIds.length,
      },
    },
    crossHorizonPooled: false,
    accountingDelta: comparisonRecords.length - overlappingCount +
      canonicalComparisonIds.length - canonicalCount,
    accountingConserved: comparisonRecords.length === overlappingCount &&
      canonicalComparisonIds.length === canonicalCount,
  };
  return deepFreeze(evidence);
}

export function getTopStoriesComparisonRecords(evidence = {}, horizon, canonical = false) {
  const rows = (evidence.comparisonRecords || []).filter(row => row.horizon === horizon);
  if (!canonical) return rows;
  const ids = new Set(evidence.canonicalComparisonIds || []);
  return rows.filter(row => ids.has(row.comparisonId));
}

export function summarizeTopStoriesValues(values = [], threshold = null) {
  const finite = values.filter(Number.isFinite);
  const quantile = fraction => {
    if (finite.length === 0) return null;
    const sorted = [...finite].sort((left, right) => left - right);
    const position = (sorted.length - 1) * fraction;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower));
  };
  return {
    count: finite.length,
    median: quantile(0.5),
    p10: quantile(0.1),
    p25: quantile(0.25),
    p75: quantile(0.75),
    p90: quantile(0.9),
    minimum: finite.length ? Math.min(...finite) : null,
    maximum: finite.length ? Math.max(...finite) : null,
    fractionBelowThreshold: Number.isFinite(threshold) && finite.length
      ? finite.filter(value => value < threshold).length / finite.length : null,
    threshold,
  };
}

function periodClassCounts(rows = []) {
  return rows.reduce((counts, row) => {
    const key = row.periodClass || 'unclassified';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function metricSummaries(rows, threshold = null) {
  return {
    incumbentRetention: summarizeTopStoriesValues(
      rows.map(row => row.metrics?.incumbentRetention), threshold,
    ),
    newListContinuity: summarizeTopStoriesValues(rows.map(row => row.metrics?.newListContinuity)),
    jaccard: summarizeTopStoriesValues(rows.map(row => row.metrics?.jaccard)),
    normalizedWeightedRankDisplacement: summarizeTopStoriesValues(
      rows.map(row => row.metrics?.normalizedWeightedRankDisplacement),
    ),
    countDelta: summarizeTopStoriesValues(rows.map(row => row.metrics?.countDelta)),
    entrantCount: summarizeTopStoriesValues(rows.map(row => row.metrics?.entrantCount)),
    exitCount: summarizeTopStoriesValues(rows.map(row => row.metrics?.exitCount)),
  };
}

function maximumLowSequence(rows, threshold) {
  let current = 0;
  let maximum = 0;
  rows.forEach(row => {
    const retention = row.metrics?.incumbentRetention;
    if (row.periodClass === 'calm' && Number.isFinite(retention) && retention < threshold) {
      current += 1;
      maximum = Math.max(maximum, current);
    } else current = 0;
  });
  return maximum;
}

export function summarizeTopStoriesComparisons(rows = [], threshold = null) {
  const eligible = rows.filter(row => row.eligibleForHeadlineKpi);
  return {
    totalComparisons: rows.length,
    eligibleComparisons: eligible.length,
    periodClassCounts: periodClassCounts(rows),
    allEligible: metricSummaries(eligible, threshold),
    calm: metricSummaries(eligible.filter(row => row.periodClass === 'calm'), threshold),
    active: metricSummaries(eligible.filter(row => row.periodClass === 'active'), threshold),
    maximumConsecutiveCalmLowRetention: maximumLowSequence(eligible, threshold),
  };
}

function inputMetricSummaries(rows = []) {
  return Object.fromEntries(Object.entries(metricSummaries(rows)).map(([key, summary]) => [
    key,
    Object.fromEntries(Object.entries(summary).filter(([field]) =>
      !['fractionBelowThreshold', 'threshold'].includes(field))),
  ]));
}

function summarizeInputPopulation(rows = []) {
  return {
    comparisonCount: rows.length,
    eligibleComparisonCount: rows.filter(row => row.eligibleForHeadlineKpi).length,
    periodClassCounts: periodClassCounts(rows),
    ...inputMetricSummaries(rows),
  };
}

export function summarizeTopStoriesInputChange(rows = []) {
  const byClass = { unchanged: [], changed: [], unknown: [] };
  rows.forEach(row => byClass[row.inputClass]?.push(row));
  return {
    unchangedInput: summarizeInputPopulation(byClass.unchanged),
    changedInput: summarizeInputPopulation(byClass.changed),
    unknownInput: summarizeInputPopulation(byClass.unknown),
  };
}
