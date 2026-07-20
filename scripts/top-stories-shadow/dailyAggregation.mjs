import { analyzeTopStoriesSequence } from '../../src/services/topStories/topStoriesSequentialReplay.js';
import {
  buildTopStoriesVersionSegmentSummaries,
  getTopStoriesNormalizationHeadlineEligibility,
  summarizeTopStoriesNormalizationEvidence,
} from '../../src/services/topStories/topStoriesVersionSegment.js';
import { stableJson } from './canonicalJson.mjs';
export const TOP_STORIES_DAILY_REPORT_SCHEMA = 'nw-top-stories-daily-stability-report/v1';
const REVIEW_THRESHOLDS = Object.freeze({ fifteenMinute: 0.9, sixtyMinute: 0.8 });
function parseDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) throw new Error('date must use YYYY-MM-DD');
  const startMs = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(startMs)) throw new Error('date must be valid');
  return { startMs, endMs: startMs + (24 * 60 * 60 * 1000) };
}
function requireStudyConfig(options = {}) {
  const config = options.studyConfig;
  if (!config?.studyId || !config?.normalizationVersion) {
    throw new Error('validated studyConfig with normalizationVersion is required');
  }
  return config;
}
function inDay(value, bounds) {
  const ms = Date.parse(value || 0);
  return Number.isFinite(ms) && ms >= bounds.startMs && ms < bounds.endMs;
}
function getRecordScheduledAt(record = {}) {
  return record.operational?.scheduledAt || record.snapshot?.scheduledAt ||
    record.failure?.scheduledAt || null;
}
function quantile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower));
}
function summarizeValues(values = [], threshold = null) {
  const finite = values.filter(Number.isFinite);
  return {
    count: finite.length,
    median: quantile(finite, 0.5),
    p10: quantile(finite, 0.1),
    p25: quantile(finite, 0.25),
    p75: quantile(finite, 0.75),
    p90: quantile(finite, 0.9),
    minimum: finite.length ? Math.min(...finite) : null,
    maximum: finite.length ? Math.max(...finite) : null,
    fractionBelowThreshold: Number.isFinite(threshold) && finite.length
      ? finite.filter(value => value < threshold).length / finite.length : null,
    threshold,
  };
}
function maximumLowSequence(rows, threshold) {
  let current = 0;
  let maximum = 0;
  rows.forEach(row => {
    const retention = row.metrics?.incumbentRetention;
    if (row.period?.periodClass === 'calm' &&
      Number.isFinite(retention) && retention < threshold) {
      current += 1;
      maximum = Math.max(maximum, current);
    } else current = 0;
  });
  return maximum;
}
function classifyRows(rows = []) {
  return rows.reduce((counts, row) => {
    const key = row.period?.periodClass || 'unclassified';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}
function summarizeComparisons(rows, threshold) {
  const eligible = rows.filter(row => row.eligibleForHeadlineKpi);
  const mapMetrics = subset => ({
    incumbentRetention: summarizeValues(subset.map(row => row.metrics?.incumbentRetention), threshold),
    newListContinuity: summarizeValues(subset.map(row => row.metrics?.newListContinuity)),
    jaccard: summarizeValues(subset.map(row => row.metrics?.jaccard)),
    normalizedWeightedRankDisplacement: summarizeValues(
      subset.map(row => row.metrics?.normalizedWeightedRankDisplacement),
    ),
    countDelta: summarizeValues(subset.map(row => row.metrics?.countDelta)),
    entrantCount: summarizeValues(subset.map(row => row.metrics?.entrantCount)),
    exitCount: summarizeValues(subset.map(row => row.metrics?.exitCount)),
  });
  return {
    totalComparisons: rows.length,
    eligibleComparisons: eligible.length,
    periodClassCounts: classifyRows(rows),
    allEligible: mapMetrics(eligible),
    calm: mapMetrics(eligible.filter(row => row.period?.periodClass === 'calm')),
    active: mapMetrics(eligible.filter(row => row.period?.periodClass === 'active')),
    maximumConsecutiveCalmLowRetention: maximumLowSequence(eligible, threshold),
  };
}
function countReasons(rows = []) {
  return rows.reduce((counts, row) => {
    const reason = row.reason || row.exclusionReason || 'unknown';
    counts[reason] = (counts[reason] || 0) + 1;
    return counts;
  }, {});
}
function toReplayObservation(record) {
  const snapshot = record.snapshot;
  return {
    ...snapshot,
    schemaValid: record.schemaValid,
    displayedTopStories: snapshot.displayed || [],
    scoredCandidates: snapshot.candidateEvidence || [],
  };
}
function targetObservationIds(replay, bounds) {
  return new Set(replay.canonicalObservations
    .filter(observation => inDay(observation.scheduledAt, bounds))
    .map(observation => observation.observationId));
}
function countUnchangedPairs(pairs, replay, targetIds) {
  const observations = new Map(replay.canonicalObservations.map(row => [row.observationId, row]));
  return pairs.filter(pair => {
    if (!targetIds.has(pair.anchorId)) return false;
    const prior = observations.get(pair.anchorId);
    const current = observations.get(pair.currentId);
    return Boolean(prior?.inputDigest) && prior.inputDigest === current?.inputDigest;
  }).length;
}
function buildInputManifest(records, bounds) {
  return records.map(record => ({
    directory: record.directory,
    status: record.status,
    schemaValid: record.schemaValid,
    studyId: record.operational?.studyId || record.snapshot?.studyId ||
      record.failure?.studyId || null,
    scheduledAt: getRecordScheduledAt(record),
    withinReportDay: inDay(getRecordScheduledAt(record), bounds),
    workflowRunId: record.operational?.workflowRunId ||
      record.snapshot?.workflowRunId || record.failure?.workflowRunId || null,
    workflowRunAttempt: record.operational?.workflowRunAttempt ||
      record.snapshot?.workflowRunAttempt || record.failure?.workflowRunAttempt || null,
    analyticalDisposition: record.status === 'VALID_SNAPSHOT' ? 'REPLAY_INPUT' : 'OPERATIONAL_ONLY',
    exclusionReason: record.exclusionReason || null,
    errorMessage: record.errorMessage || null,
  })).sort((left, right) =>
    String(left.scheduledAt || '').localeCompare(String(right.scheduledAt || '')) ||
    String(left.workflowRunId || '').localeCompare(String(right.workflowRunId || '')) ||
    Number(left.workflowRunAttempt || 0) - Number(right.workflowRunAttempt || 0));
}
function buildCoverage(dayRecords, matching, replay, bounds, date, pairData, normalization) {
  const operational = dayRecords.filter(record => record.operational);
  const successful = operational.filter(record => record.status === 'VALID_SNAPSHOT');
  const complete = successful.filter(record => record.snapshot?.completenessState === 'COMPLETE');
  const eligible = successful.filter(record => record.snapshot?.analyticalEligibility === 'ELIGIBLE');
  const delays = operational.map(record => Number(record.operational?.scheduleDelaySeconds))
    .filter(Number.isFinite);
  return {
    scheduledRuns: 96,
    scheduledSlots: 96,
    observedSlotCount: new Set(operational.map(row => row.operational.nominalSlotKey)
      .filter(Boolean)).size,
    scheduleSlotCoverage: new Set(operational.map(row => row.operational.nominalSlotKey)
      .filter(Boolean)).size / 96,
    discoveredArtifacts: dayRecords.length,
    contextArtifactCount: matching.length - dayRecords.length,
    unassignedInvalidArtifacts: matching.filter(record =>
      !record.schemaValid && !getRecordScheduledAt(record)).length,
    startedRuns: operational.length,
    validArtifacts: dayRecords.filter(record => record.schemaValid).length,
    invalidArtifacts: dayRecords.filter(record => !record.schemaValid).length,
    successfulRuns: successful.length,
    failureRuns: operational.filter(record => record.status === 'VALID_FAILURE').length,
    failedInputRuns: successful.filter(record =>
      record.snapshot?.sourceHealth?.ok === false ||
      record.snapshot?.sourceHealth?.complete === false).length,
    completeRuns: complete.length,
    analyticallyEligibleRuns: eligible.length,
    uncertainRuns: successful.filter(record =>
      record.snapshot?.completenessState !== 'COMPLETE' ||
      record.snapshot?.analyticalEligibility !== 'ELIGIBLE').length,
    delayedOverFiveMinutes: delays.filter(value => value > 300).length,
    scheduleDelaySeconds: summarizeValues(delays),
    canonicalObservationCount: normalization.totalCanonicalObservations,
    supersededDuplicateCount: replay.operationalRecords.filter(row =>
      row.status === 'SUPERSEDED_DUPLICATE_SLOT' && String(row.slotKey).includes(`|${date}`)).length,
    valid15mPairs: pairData.fifteenMinute.length,
    valid60mPairs: pairData.sixtyMinute.length,
    canonical15mPairs: pairData.fifteenCanonical.length,
    canonical60mPairs: pairData.sixtyCanonical.length,
    unchangedInput15mPairs: countUnchangedPairs(
      replay.pairSets.fifteenMinute.pairs, replay, pairData.targetIds,
    ),
    unchangedInput60mPairs: countUnchangedPairs(
      replay.pairSets.sixtyMinute.pairs, replay, pairData.targetIds,
    ),
    uncertain15mPairs: pairData.fifteenMinute.filter(row =>
      row.period?.periodClass === 'uncertain').length,
    uncertain60mPairs: pairData.sixtyMinute.filter(row =>
      row.period?.periodClass === 'uncertain').length,
    excludedPairsByReason: pairData.excludedPairsByReason,
    artifactExclusionReasons: countReasons(dayRecords.filter(record =>
      !record.schemaValid || record.failure)),
    normalizationEvidence: normalization,
  };
}
export function aggregateTopStoriesDaily(records = [], options = {}) {
  const config = requireStudyConfig(options);
  const bounds = parseDay(options.date);
  const matching = records.filter(record => {
    const study = record.operational?.studyId || record.snapshot?.studyId || record.failure?.studyId;
    return study === config.studyId;
  });
  const dayRecords = matching.filter(record => inDay(getRecordScheduledAt(record), bounds));
  const replayInputs = matching.filter(record => record.status === 'VALID_SNAPSHOT')
    .map(toReplayObservation);
  const replay = analyzeTopStoriesSequence(replayInputs, { studyConfig: config });
  const targetIds = targetObservationIds(replay, bounds);
  const filterComparisons = rows => rows.filter(row => targetIds.has(row.priorObservationId));
  const filterExclusions = rows => rows.filter(row => targetIds.has(row.anchorId));
  const pairData = {
    targetIds,
    fifteenMinute: filterComparisons(replay.pairComparisons.fifteenMinute),
    fifteenCanonical: filterComparisons(replay.pairComparisons.fifteenMinuteCanonical),
    sixtyMinute: filterComparisons(replay.pairComparisons.sixtyMinute),
    sixtyCanonical: filterComparisons(replay.pairComparisons.sixtyMinuteCanonical),
    excludedPairsByReason: {
      fifteenMinute: countReasons(filterExclusions(replay.pairSets.fifteenMinute.exclusions)),
      sixtyMinute: countReasons(filterExclusions(replay.pairSets.sixtyMinute.exclusions)),
    },
  };
  const targetObservations = replay.canonicalObservations.filter(row => targetIds.has(row.observationId));
  const normalization = summarizeTopStoriesNormalizationEvidence(
    targetObservations, config.normalizationVersion,
  );
  const comparisons = {
    fifteenMinute: pairData.fifteenMinute,
    sixtyMinute: pairData.sixtyMinute,
  };
  const segmentSummaries = buildTopStoriesVersionSegmentSummaries(
    targetObservations, comparisons, config,
  );
  const versionSegments = segmentSummaries.map(row => row.segmentKey).filter(Boolean).sort();
  const headlineKpiEligibility = getTopStoriesNormalizationHeadlineEligibility(
    normalization, segmentSummaries, config,
  );
  const status = dayRecords.length === 0 ? 'EMPTY' : targetIds.size < 2 ? 'INSUFFICIENT' : 'OBSERVED';
  const report = {
    schemaVersion: TOP_STORIES_DAILY_REPORT_SCHEMA,
    studyId: config.studyId,
    date: options.date,
    generatedFromImmutableArtifacts: true,
    status,
    coverage: buildCoverage(
      dayRecords, matching, replay, bounds, options.date, pairData, normalization,
    ),
    normalizationEvidenceCoverage: normalization,
    versionSegments,
    segmentSummaries,
    headlineKpiEligibility,
    stability: {
      fifteenMinute: {
        overlapping: summarizeComparisons(pairData.fifteenMinute, REVIEW_THRESHOLDS.fifteenMinute),
        canonicalNonOverlapping: summarizeComparisons(
          pairData.fifteenCanonical, REVIEW_THRESHOLDS.fifteenMinute,
        ),
      },
      sixtyMinute: {
        overlapping: summarizeComparisons(pairData.sixtyMinute, REVIEW_THRESHOLDS.sixtyMinute),
        canonicalNonOverlapping: summarizeComparisons(
          pairData.sixtyCanonical, REVIEW_THRESHOLDS.sixtyMinute,
        ),
      },
    },
    pairing: {
      fifteenMinuteExclusions: pairData.excludedPairsByReason.fifteenMinute,
      sixtyMinuteExclusions: pairData.excludedPairsByReason.sixtyMinute,
      serialCorrelationNotice: replay.pairSets.fifteenMinute.serialCorrelationNotice,
    },
    residence: {
      episodeCount: replay.residenceEpisodes.length,
      leftCensoredCount: replay.residenceEpisodes.filter(row => row.leftCensored).length,
      rightCensoredCount: replay.residenceEpisodes.filter(row => row.rightCensored).length,
    },
    inputManifest: buildInputManifest(matching, bounds),
    replayVersion: replay.replayVersion,
    reviewThresholds: REVIEW_THRESHOLDS,
  };
  return { report, replay };
}
export function serializeTopStoriesDailyReport(report) {
  return `${stableJson(report)}\n`;
}
