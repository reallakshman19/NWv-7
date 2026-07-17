export const TOP_STORIES_PILOT_ROLLUP_SCHEMA = 'nw-top-stories-pilot-rollup/v1';

const SCHEMAS = Object.freeze({
  daily: 'nw-top-stories-daily-stability-report/v1',
  validation: 'nw-top-stories-24h-operational-validation/v1',
  study: 'nw-top-stories-shadow-study/v1',
});

export const PILOT_THRESHOLDS = Object.freeze({
  suppliedDays: 7,
  usableDays: 6,
  calm15Days: 4,
  calm60Days: 3,
  canonicalCalm15Pairs: 30,
  canonicalCalm60Pairs: 12,
  activeEpisodes: 2,
  activeCanonicalPairs: 4,
  usefulDisplayedMedian: 8,
  chronicUnderfillFraction: 0.25,
  severeCollapseFraction: 0.10,
  calm15Retention: 0.90,
  calm60Retention: 0.80,
});

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function quantile(values, fraction) {
  const finiteValues = values.map(finite).filter(value => value !== null).sort((a, b) => a - b);
  if (!finiteValues.length) return null;
  const position = (finiteValues.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return finiteValues[lower];
  return finiteValues[lower] + ((finiteValues[upper] - finiteValues[lower]) * (position - lower));
}

function summarize(values) {
  const finiteValues = values.map(finite).filter(value => value !== null);
  return {
    count: finiteValues.length,
    median: quantile(finiteValues, 0.5),
    p10: quantile(finiteValues, 0.1),
    p25: quantile(finiteValues, 0.25),
    p75: quantile(finiteValues, 0.75),
    p90: quantile(finiteValues, 0.9),
    minimum: finiteValues.length ? Math.min(...finiteValues) : null,
    maximum: finiteValues.length ? Math.max(...finiteValues) : null,
  };
}

function addCounts(target, source = {}) {
  Object.entries(source || {}).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + (Number(value) || 0);
  });
  return target;
}

function exactVersionSegment(config) {
  return [
    config.studyId,
    config.rankerVersion,
    config.identityVersion,
    config.periodClassifierVersion,
  ].join('|');
}

function validateDay(entry, config) {
  const daily = entry?.dailyReport;
  const validation = entry?.operationalValidation;
  const errors = [];
  if (daily?.schemaVersion !== SCHEMAS.daily) errors.push('unknown_daily_report_schema');
  if (validation?.schemaVersion !== SCHEMAS.validation) errors.push('unknown_validation_schema');
  if (daily?.studyId !== config.studyId || validation?.studyId !== config.studyId) {
    errors.push('study_id_mismatch');
  }
  if (!daily?.date || daily.date !== validation?.date) errors.push('date_mismatch');
  const segments = Array.isArray(daily?.versionSegments) ? daily.versionSegments : [];
  if (segments.length !== 1 || segments[0] !== exactVersionSegment(config)) {
    errors.push('version_segment_mismatch');
  }
  return { daily, validation, errors };
}

function chooseDay(left, right) {
  const rank = decision => ({ PASS: 4, PASS_WITH_WARNINGS: 3, INSUFFICIENT: 2, FAIL: 1 }[decision] || 0);
  const leftRank = rank(left.operationalValidation?.decision);
  const rightRank = rank(right.operationalValidation?.decision);
  if (leftRank !== rightRank) return rightRank > leftRank ? right : left;
  return String(right.sourceId || '').localeCompare(String(left.sourceId || '')) >= 0 ? right : left;
}

function canonicalize(entries) {
  const byDate = new Map();
  const superseded = [];
  entries.forEach(entry => {
    const date = entry?.dailyReport?.date || entry?.operationalValidation?.date || null;
    if (!date) {
      superseded.push({ date: null, sourceId: entry?.sourceId || null, reason: 'missing_date' });
      return;
    }
    if (!byDate.has(date)) {
      byDate.set(date, entry);
      return;
    }
    const previous = byDate.get(date);
    const selected = chooseDay(previous, entry);
    const removed = selected === entry ? previous : entry;
    byDate.set(date, selected);
    superseded.push({ date, sourceId: removed?.sourceId || null, reason: 'duplicate_day_superseded' });
  });
  return {
    days: [...byDate.values()].sort((a, b) =>
      String(a.dailyReport?.date || '').localeCompare(String(b.dailyReport?.date || ''))),
    superseded,
  };
}

function canonicalCalm(report, horizon) {
  return report?.stability?.[horizon]?.canonicalNonOverlapping?.calm || null;
}

function overlappingActive(report, horizon) {
  return report?.stability?.[horizon]?.overlapping?.active || null;
}

function pairCount(summary) {
  return finite(summary?.incumbentRetention?.count) || 0;
}

function collectMetrics(usableDays) {
  const railBuckets = { '0': 0, '1-3': 0, '4-7': 0, '8-9': 0, '10': 0, other: 0 };
  const reasons = {};
  const displayedMedians = [];
  let observations = 0;
  let belowEight = 0;
  let severeCollapse = 0;
  let calm15Pairs = 0;
  let calm60Pairs = 0;
  let activePairs = 0;
  let activeEpisodes = 0;
  const calm15Medians = [];
  const calm60Medians = [];
  const dayRows = usableDays.map(({ daily, validation }) => {
    const rail = daily.railAndFunnel || {};
    addCounts(railBuckets, rail.railBuckets);
    addCounts(reasons, rail.finalReasonCounts);
    addCounts(reasons, rail.candidateBuildReasonCounts);
    observations += finite(rail.observationCount) || 0;
    belowEight += finite(rail.belowSoftReviewDepth?.count) || 0;
    severeCollapse += (finite(rail.railBuckets?.['0']) || 0) + (finite(rail.railBuckets?.['1-3']) || 0);
    displayedMedians.push(rail.displayedCount?.median);
    const calm15 = canonicalCalm(daily, 'fifteenMinute');
    const calm60 = canonicalCalm(daily, 'sixtyMinute');
    const active15 = overlappingActive(daily, 'fifteenMinute');
    calm15Pairs += pairCount(calm15);
    calm60Pairs += pairCount(calm60);
    activePairs += pairCount(active15);
    if (pairCount(active15) > 0) activeEpisodes += 1;
    if (pairCount(calm15) > 0) calm15Medians.push(calm15.incumbentRetention?.median);
    if (pairCount(calm60) > 0) calm60Medians.push(calm60.incumbentRetention?.median);
    return {
      date: daily.date,
      operationalDecision: validation.decision,
      scheduleSlotCoverage: daily.coverage?.scheduleSlotCoverage ?? null,
      displayedMedian: rail.displayedCount?.median ?? null,
      belowEightFraction: rail.belowSoftReviewDepth?.fraction ?? null,
      severeCollapseCount: (rail.railBuckets?.['0'] || 0) + (rail.railBuckets?.['1-3'] || 0),
      canonicalCalm15Pairs: pairCount(calm15),
      canonicalCalm60Pairs: pairCount(calm60),
      activePairs: pairCount(active15),
    };
  });
  return {
    observations,
    railBuckets,
    displayedMedianAcrossDays: summarize(displayedMedians),
    belowEightFraction: observations ? belowEight / observations : null,
    severeCollapseFraction: observations ? severeCollapse / observations : null,
    calm15: { days: calm15Medians.length, pairs: calm15Pairs, medianAcrossDays: summarize(calm15Medians).median },
    calm60: { days: calm60Medians.length, pairs: calm60Pairs, medianAcrossDays: summarize(calm60Medians).median },
    active: { episodes: activeEpisodes, canonicalOrOverlappingPairs: activePairs },
    dominantReasons: Object.entries(reasons)
      .filter(([reason]) => !['displayed', 'candidate_created'].includes(reason))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([reasonCode, count]) => ({ reasonCode, count })),
    days: dayRows,
  };
}

function sufficiency(dayCounts, metrics) {
  const reasons = [];
  if (dayCounts.supplied < PILOT_THRESHOLDS.suppliedDays) reasons.push('fewer_than_seven_days');
  if (dayCounts.usable < PILOT_THRESHOLDS.usableDays) reasons.push('fewer_than_six_usable_days');
  if (dayCounts.failed > 0) reasons.push('technical_failure_day_present');
  if (metrics.calm15.days < PILOT_THRESHOLDS.calm15Days) reasons.push('insufficient_calm_15m_days');
  if (metrics.calm60.days < PILOT_THRESHOLDS.calm60Days) reasons.push('insufficient_calm_60m_days');
  if (metrics.calm15.pairs < PILOT_THRESHOLDS.canonicalCalm15Pairs) reasons.push('insufficient_canonical_calm_15m_pairs');
  if (metrics.calm60.pairs < PILOT_THRESHOLDS.canonicalCalm60Pairs) reasons.push('insufficient_canonical_calm_60m_pairs');
  return reasons;
}

function recommendation(metrics, activeSufficient) {
  const recallProblem = (metrics.belowEightFraction ?? 0) > PILOT_THRESHOLDS.chronicUnderfillFraction ||
    (metrics.severeCollapseFraction ?? 0) > PILOT_THRESHOLDS.severeCollapseFraction ||
    (metrics.displayedMedianAcrossDays.median ?? Infinity) < PILOT_THRESHOLDS.usefulDisplayedMedian;
  const persistenceProblem = (metrics.calm15.medianAcrossDays ?? 1) < PILOT_THRESHOLDS.calm15Retention ||
    (metrics.calm60.medianAcrossDays ?? 1) < PILOT_THRESHOLDS.calm60Retention;
  if (!activeSufficient && !recallProblem && !persistenceProblem) return 'CONTINUE_OBSERVATION';
  if (recallProblem && persistenceProblem) return 'REPAIR_RECALL_THEN_PERSISTENCE';
  if (recallProblem) return 'REPAIR_RECALL';
  if (persistenceProblem) return activeSufficient ? 'ADD_PERSISTENCE' : 'CONTINUE_OBSERVATION';
  return activeSufficient ? 'RETAIN_POLICY' : 'CONTINUE_OBSERVATION';
}

export function buildTopStoriesPilotRollup(entries = [], { studyConfig } = {}) {
  if (studyConfig?.schemaVersion !== SCHEMAS.study || !studyConfig.studyId) {
    throw new Error('Valid fixed study configuration is required');
  }
  const canonical = canonicalize(entries);
  const evaluated = canonical.days.map(entry => ({ entry, ...validateDay(entry, studyConfig) }));
  const invalid = evaluated.filter(row => row.errors.length);
  const failed = evaluated.filter(row => !row.errors.length && row.validation.decision === 'FAIL');
  const usable = evaluated.filter(row => !row.errors.length &&
    ['PASS', 'PASS_WITH_WARNINGS'].includes(row.validation.decision));
  const insufficient = evaluated.filter(row => !row.errors.length && row.validation.decision === 'INSUFFICIENT');
  const metrics = collectMetrics(usable);
  const dayCounts = {
    supplied: canonical.days.length,
    usable: usable.length,
    warnings: usable.filter(row => row.validation.decision === 'PASS_WITH_WARNINGS').length,
    insufficient: insufficient.length,
    failed: failed.length + invalid.length,
  };
  const insufficiencyReasons = sufficiency(dayCounts, metrics);
  const technicalFailure = failed.length > 0 || invalid.length > 0;
  const activeSufficient = metrics.active.episodes >= PILOT_THRESHOLDS.activeEpisodes ||
    metrics.active.canonicalOrOverlappingPairs >= PILOT_THRESHOLDS.activeCanonicalPairs;
  const decision = technicalFailure
    ? 'TECHNICAL_REMEDIATION'
    : insufficiencyReasons.length
      ? 'INSUFFICIENT'
      : recommendation(metrics, activeSufficient);
  return {
    schemaVersion: TOP_STORIES_PILOT_ROLLUP_SCHEMA,
    studyId: studyConfig.studyId,
    decision,
    productionChangeAuthorized: false,
    persistenceChangeAuthorized: false,
    dayCounts,
    evidenceSufficient: !technicalFailure && insufficiencyReasons.length === 0,
    activeEvidenceSufficient: activeSufficient,
    insufficiencyReasonCodes: insufficiencyReasons,
    technicalFailureReasonCodes: [
      ...new Set([
        ...invalid.flatMap(row => row.errors),
        ...failed.flatMap(row => row.validation.failureReasonCodes || ['technical_failure_day']),
      ]),
    ].sort(),
    metrics,
    includedDates: usable.map(row => row.daily.date),
    excludedDays: evaluated.filter(row => !usable.includes(row)).map(row => ({
      date: row.daily?.date || row.validation?.date || null,
      operationalDecision: row.validation?.decision || null,
      reasonCodes: row.errors.length ? row.errors : row.validation?.failureReasonCodes ||
        row.validation?.insufficiencyReasonCodes || ['not_operationally_usable'],
    })),
    supersededInputs: canonical.superseded,
    thresholds: PILOT_THRESHOLDS,
  };
}
