import { analyzeTopStoriesSequence } from '../../src/services/topStories/topStoriesSequentialReplay.js';
import {
  buildTopStoriesVersionSegmentSummaries,
  getTopStoriesNormalizationHeadlineEligibility,
  summarizeTopStoriesNormalizationEvidence,
} from '../../src/services/topStories/topStoriesVersionSegment.js';
import { stableJson } from './canonicalJson.mjs';
import {
  buildTopStoriesComparisonEvidence,
  getTopStoriesComparisonRecords,
  summarizeTopStoriesComparisons,
  summarizeTopStoriesInputChange,
  summarizeTopStoriesValues,
  TOP_STORIES_COMPARISON_EVIDENCE_SCHEMA,
} from './comparisonEvidence.mjs';
import { validateTopStoriesDailyComparisonEvidence } from './comparisonEvidenceValidation.mjs';

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

function buildCoverage(dayRecords, matching, replay, date, evidence, exclusions, normalization) {
  const operational = dayRecords.filter(record => record.operational);
  const successful = operational.filter(record => record.status === 'VALID_SNAPSHOT');
  const complete = successful.filter(record => record.snapshot?.completenessState === 'COMPLETE');
  const eligible = successful.filter(record => record.snapshot?.analyticalEligibility === 'ELIGIBLE');
  const delays = operational.map(record => Number(record.operational?.scheduleDelaySeconds))
    .filter(Number.isFinite);
  const fifteen = getTopStoriesComparisonRecords(evidence, 'fifteenMinute');
  const sixty = getTopStoriesComparisonRecords(evidence, 'sixtyMinute');
  const canonical15 = getTopStoriesComparisonRecords(evidence, 'fifteenMinute', true);
  const canonical60 = getTopStoriesComparisonRecords(evidence, 'sixtyMinute', true);
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
    scheduleDelaySeconds: summarizeTopStoriesValues(delays),
    canonicalObservationCount: normalization.totalCanonicalObservations,
    supersededDuplicateCount: replay.operationalRecords.filter(row =>
      row.status === 'SUPERSEDED_DUPLICATE_SLOT' && String(row.slotKey).includes(`|${date}`)).length,
    valid15mPairs: fifteen.length,
    valid60mPairs: sixty.length,
    canonical15mPairs: canonical15.length,
    canonical60mPairs: canonical60.length,
    unchangedInput15mPairs: fifteen.filter(row => row.inputClass === 'unchanged').length,
    unchangedInput60mPairs: sixty.filter(row => row.inputClass === 'unchanged').length,
    uncertain15mPairs: fifteen.filter(row => row.periodClass === 'uncertain').length,
    uncertain60mPairs: sixty.filter(row => row.periodClass === 'uncertain').length,
    excludedPairsByReason: exclusions,
    artifactExclusionReasons: countReasons(dayRecords.filter(record =>
      !record.schemaValid || record.failure)),
    normalizationEvidence: normalization,
  };
}

function buildEvidenceSummaries(evidence) {
  const stability = {};
  const inputChange = {};
  Object.entries(REVIEW_THRESHOLDS).forEach(([horizon, threshold]) => {
    const overlapping = getTopStoriesComparisonRecords(evidence, horizon);
    const canonical = getTopStoriesComparisonRecords(evidence, horizon, true);
    stability[horizon] = {
      overlapping: summarizeTopStoriesComparisons(overlapping, threshold),
      canonicalNonOverlapping: summarizeTopStoriesComparisons(canonical, threshold),
    };
    inputChange[horizon] = {
      overlapping: summarizeTopStoriesInputChange(overlapping),
      canonicalNonOverlapping: summarizeTopStoriesInputChange(canonical),
    };
  });
  return { stability, inputChange };
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
  const filterExclusions = rows => rows.filter(row => targetIds.has(row.anchorId));
  const exclusions = {
    fifteenMinute: countReasons(filterExclusions(replay.pairSets.fifteenMinute.exclusions)),
    sixtyMinute: countReasons(filterExclusions(replay.pairSets.sixtyMinute.exclusions)),
  };
  const evidence = buildTopStoriesComparisonEvidence(replay, {
    studyId: config.studyId,
    ownerDate: options.date,
  });
  const summaries = buildEvidenceSummaries(evidence);
  const targetObservations = replay.canonicalObservations.filter(row => targetIds.has(row.observationId));
  const normalization = summarizeTopStoriesNormalizationEvidence(
    targetObservations, config.normalizationVersion,
  );
  const comparisons = {
    fifteenMinute: getTopStoriesComparisonRecords(evidence, 'fifteenMinute'),
    sixtyMinute: getTopStoriesComparisonRecords(evidence, 'sixtyMinute'),
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
    comparisonEvidenceSchemaVersion: TOP_STORIES_COMPARISON_EVIDENCE_SCHEMA,
    comparisonEvidence: evidence,
    coverage: buildCoverage(
      dayRecords, matching, replay, options.date, evidence, exclusions, normalization,
    ),
    normalizationEvidenceCoverage: normalization,
    versionSegments,
    segmentSummaries,
    headlineKpiEligibility,
    stability: summaries.stability,
    inputChange: summaries.inputChange,
    pairing: {
      fifteenMinuteExclusions: exclusions.fifteenMinute,
      sixtyMinuteExclusions: exclusions.sixtyMinute,
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
  const validation = validateTopStoriesDailyComparisonEvidence(report);
  if (!validation.valid) throw new Error(`comparison_evidence_invalid:${validation.reasonCodes.join(',')}`);
  return { report, replay };
}

export function serializeTopStoriesDailyReport(report) {
  return `${stableJson(report)}\n`;
}
