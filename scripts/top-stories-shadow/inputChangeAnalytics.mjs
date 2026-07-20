import {
  classifyTopStoriesComparisonInput,
  getTopStoriesComparisonRecords,
  summarizeTopStoriesInputChange,
  TOP_STORIES_COMPARISON_EVIDENCE_SCHEMA,
} from './comparisonEvidence.mjs';

function replayRows(replay, targetObservations, horizon, canonical) {
  const observationMap = new Map((replay?.canonicalObservations || []).map(row => [
    row.observationId,
    row,
  ]));
  const targetIds = new Set((targetObservations || []).map(row => row.observationId));
  const key = canonical ? `${horizon}Canonical` : horizon;
  return (replay?.pairComparisons?.[key] || [])
    .filter(row => targetIds.has(row.priorObservationId))
    .map(row => ({
      periodClass: row.period?.periodClass || 'unclassified',
      inputClass: classifyTopStoriesComparisonInput(
        observationMap.get(row.priorObservationId),
        observationMap.get(row.currentObservationId),
      ),
      eligibleForHeadlineKpi: row.eligibleForHeadlineKpi === true,
      metrics: row.metrics || {},
    }));
}

function summarizeEvidence(evidence, horizon, canonical) {
  return summarizeTopStoriesInputChange(
    getTopStoriesComparisonRecords(evidence, horizon, canonical),
  );
}

export function buildTopStoriesInputChangeAnalytics(source, targetObservations = []) {
  const fromEvidence = source?.schemaVersion === TOP_STORIES_COMPARISON_EVIDENCE_SCHEMA;
  const summarize = (horizon, canonical) => fromEvidence
    ? summarizeEvidence(source, horizon, canonical)
    : summarizeTopStoriesInputChange(replayRows(source, targetObservations, horizon, canonical));
  return {
    fifteenMinute: {
      overlapping: summarize('fifteenMinute', false),
      canonicalNonOverlapping: summarize('fifteenMinute', true),
    },
    sixtyMinute: {
      overlapping: summarize('sixtyMinute', false),
      canonicalNonOverlapping: summarize('sixtyMinute', true),
    },
    interpretation: 'Input classes compare canonical inputDigest values. They do not infer publisher changes or recreate ranking.',
  };
}
