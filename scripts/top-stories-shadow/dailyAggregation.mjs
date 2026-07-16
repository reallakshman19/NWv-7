import { analyzeTopStoriesSequence } from '../../src/services/topStories/topStoriesSequentialReplay.js';
import { stableJson } from './canonicalJson.mjs';

export const TOP_STORIES_DAILY_REPORT_SCHEMA = 'nw-top-stories-daily-stability-report/v1';
const REVIEW_THRESHOLDS = Object.freeze({ fifteenMinute: 0.9, sixtyMinute: 0.8 });

function parseDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) throw new Error('date must use YYYY-MM-DD');
  const startMs = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(startMs)) throw new Error('date must be valid');
  return { startMs, endMs: startMs + (24 * 60 * 60 * 1000) };
}

function inDay(value, bounds) {
  const ms = Date.parse(value || 0);
  return Number.isFinite(ms) && ms >= bounds.startMs && ms < bounds.endMs;
}

function getRecordScheduledAt(record = {}) {
  return record.operational?.scheduledAt || record.snapshot?.scheduledAt || record.failure?.scheduledAt || null;
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
      ? finite.filter(value => value < threshold).length / finite.length
      : null,
    threshold,
  };
}

function maximumLowSequence(rows, threshold) {
  let current = 0;
  let maximum = 0;
  rows.forEach(row => {
    if (row.period?.periodClass === 'calm' && row.metrics?.incumbentRetention < threshold) {
      current += 1;
      maximum = Math.max(maximum, current);
    } else {
      current = 0;
    }
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
  const calm = eligible.filter(row => row.period?.periodClass === 'calm');
  const active = eligible.filter(row => row.period?.periodClass === 'active');
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
    calm: mapMetrics(calm),
    active: mapMetrics(active),
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

function filterComparisons(rows, targetIds) {
  return rows.filter(row => targetIds.has(row.priorObservationId));
}

function filterExclusions(rows, targetIds) {
  return rows.filter(row => targetIds.has(row.anchorId));
}

function buildCoverage(dayRecords, allRecords, replay, bounds, date) {
  const operational = dayRecords.filter(record => record.operational);
  const slotKeys = new Set(operational.map(record => record.operational.nominalSlotKey).filter(Boolean));
  const successful = operational.filter(record => record.status === 'VALID_SNAPSHOT');
  const complete = successful.filter(record => record.snapshot?.completenessState === 'COMPLETE');
  const eligible = successful.filter(record => record.snapshot?.analyticalEligibility === 'ELIGIBLE');
  const delays = operational.map(record => Number(record.operational?.scheduleDelaySeconds)).filter(Number.isFinite);
  return {
    scheduledSlots: 96,
    observedSlotCount: slotKeys.size,
    scheduleSlotCoverage: slotKeys.size / 96,
    discoveredArtifacts: dayRecords.length,
    contextArtifactCount: allRecords.length - dayRecords.length,
    unassignedInvalidArtifacts: allRecords.filter(record =>
      !record.schemaValid && !getRecordScheduledAt(record)).length,
    startedRuns: operational.length,
    validArtifacts: dayRecords.filter(record => record.schemaValid).length,
    invalidArtifacts: dayRecords.filter(record => !record.schemaValid).length,
    successfulRuns: successful.length,
    failureRuns: operational.filter(record => record.status === 'VALID_FAILURE').length,
    completeRuns: complete.length,
    analyticallyEligibleRuns: eligible.length,
    delayedOverFiveMinutes: delays.filter(value => value > 300).length,
    scheduleDelaySeconds: summarizeValues(delays),
    canonicalObservationCount: replay.canonicalObservations.filter(
      observation => inDay(observation.scheduledAt, bounds),
    ).length,
    supersededDuplicateCount: replay.operationalRecords.filter(row =>
      row.status === 'SUPERSEDED_DUPLICATE_SLOT' && String(row.slotKey).includes(`|${date}`)).length,
    artifactExclusionReasons: countReasons(dayRecords.filter(record =>
      !record.schemaValid || record.failure)),
  };
}

function buildInputManifest(records, bounds) {
  return records.map(record => ({
    directory: record.directory,
    status: record.status,
    schemaValid: record.schemaValid,
    studyId: record.operational?.studyId || record.snapshot?.studyId || record.failure?.studyId || null,
    scheduledAt: getRecordScheduledAt(record),
    withinReportDay: inDay(getRecordScheduledAt(record), bounds),
    workflowRunId: record.operational?.workflowRunId || record.snapshot?.workflowRunId || record.failure?.workflowRunId || null,
    workflowRunAttempt: record.operational?.workflowRunAttempt || record.snapshot?.workflowRunAttempt || record.failure?.workflowRunAttempt || null,
    exclusionReason: record.exclusionReason || null,
    errorMessage: record.errorMessage || null,
  })).sort((left, right) =>
    String(left.scheduledAt || '').localeCompare(String(right.scheduledAt || '')) ||
    String(left.workflowRunId || '').localeCompare(String(right.workflowRunId || '')) ||
    Number(left.workflowRunAttempt || 0) - Number(right.workflowRunAttempt || 0));
}

export function aggregateTopStoriesDaily(records = [], { date, studyId } = {}) {
  const bounds = parseDay(date);
  const matching = records.filter(record => {
    const recordStudy = record.operational?.studyId || record.snapshot?.studyId || record.failure?.studyId;
    return !studyId || recordStudy === studyId;
  });
  const dayRecords = matching.filter(record => inDay(getRecordScheduledAt(record), bounds));
  const replayInputs = matching
    .filter(record => record.status === 'VALID_SNAPSHOT')
    .map(toReplayObservation);
  const replay = analyzeTopStoriesSequence(replayInputs);
  const targetIds = targetObservationIds(replay, bounds);
  const fifteenRows = filterComparisons(replay.pairComparisons.fifteenMinute, targetIds);
  const fifteenCanonicalRows = filterComparisons(replay.pairComparisons.fifteenMinuteCanonical, targetIds);
  const sixtyRows = filterComparisons(replay.pairComparisons.sixtyMinute, targetIds);
  const sixtyCanonicalRows = filterComparisons(replay.pairComparisons.sixtyMinuteCanonical, targetIds);
  const report = {
    schemaVersion: TOP_STORIES_DAILY_REPORT_SCHEMA,
    studyId: studyId || null,
    date,
    generatedFromImmutableArtifacts: true,
    status: dayRecords.length === 0 ? 'EMPTY' : targetIds.size < 2 ? 'INSUFFICIENT' : 'OBSERVED',
    coverage: buildCoverage(dayRecords, matching, replay, bounds, date),
    stability: {
      fifteenMinute: {
        overlapping: summarizeComparisons(fifteenRows, REVIEW_THRESHOLDS.fifteenMinute),
        canonicalNonOverlapping: summarizeComparisons(fifteenCanonicalRows, REVIEW_THRESHOLDS.fifteenMinute),
      },
      sixtyMinute: {
        overlapping: summarizeComparisons(sixtyRows, REVIEW_THRESHOLDS.sixtyMinute),
        canonicalNonOverlapping: summarizeComparisons(sixtyCanonicalRows, REVIEW_THRESHOLDS.sixtyMinute),
      },
    },
    pairing: {
      fifteenMinuteExclusions: countReasons(filterExclusions(
        replay.pairSets.fifteenMinute.exclusions,
        targetIds,
      )),
      sixtyMinuteExclusions: countReasons(filterExclusions(
        replay.pairSets.sixtyMinute.exclusions,
        targetIds,
      )),
      serialCorrelationNotice: replay.pairSets.fifteenMinute.serialCorrelationNotice,
    },
    residence: {
      episodeCount: replay.residenceEpisodes.length,
      leftCensoredCount: replay.residenceEpisodes.filter(row => row.leftCensored).length,
      rightCensoredCount: replay.residenceEpisodes.filter(row => row.rightCensored).length,
    },
    versionSegments: [...new Set(replay.canonicalObservations.map(observation => [
      observation.studyId,
      observation.rankerVersion,
      observation.identityVersion,
      observation.periodClassifierVersion,
    ].join('|')))].sort(),
    inputManifest: buildInputManifest(matching, bounds),
    replayVersion: replay.replayVersion,
    reviewThresholds: REVIEW_THRESHOLDS,
  };
  return { report, replay };
}

function percentage(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'n/a';
}

export function renderTopStoriesDailyMarkdown(report) {
  const f15 = report.stability.fifteenMinute.overlapping.calm.incumbentRetention;
  const f60 = report.stability.sixtyMinute.overlapping.calm.incumbentRetention;
  return [
    `# Top Stories shadow daily report — ${report.date}`,
    '',
    `- Study: \`${report.studyId || 'unspecified'}\``,
    `- Status: **${report.status}**`,
    `- Scheduled-slot coverage: **${percentage(report.coverage.scheduleSlotCoverage)}** (${report.coverage.observedSlotCount}/96)`,
    `- Successful observations: **${report.coverage.successfulRuns}**`,
    `- Invalid artifacts: **${report.coverage.invalidArtifacts}**`,
    `- Superseded duplicates: **${report.coverage.supersededDuplicateCount}**`,
    '',
    '## Calm-period stability',
    '',
    '| Horizon | Comparisons | Median incumbent retention | p10 | Below review threshold |',
    '|---|---:|---:|---:|---:|',
    `| 15 minutes | ${f15.count} | ${percentage(f15.median)} | ${percentage(f15.p10)} | ${percentage(f15.fractionBelowThreshold)} |`,
    `| 60 minutes | ${f60.count} | ${percentage(f60.median)} | ${percentage(f60.p10)} | ${percentage(f60.fractionBelowThreshold)} |`,
    '',
    '## Statistical interpretation',
    '',
    report.pairing.serialCorrelationNotice,
    'Canonical non-overlapping sensitivity results are retained separately in the JSON report.',
    '',
    'This is observational evidence only. It does not change production ranking or persistence behavior.',
    '',
  ].join('\n');
}

export function serializeTopStoriesDailyReport(report) {
  return `${stableJson(report)}\n`;
}
