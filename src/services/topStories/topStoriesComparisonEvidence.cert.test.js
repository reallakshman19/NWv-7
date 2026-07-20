import { describe, expect, it } from 'vitest';
import {
  buildTopStoriesComparisonEvidence,
  buildTopStoriesComparisonId,
  getTopStoriesComparisonRecords,
  summarizeTopStoriesComparisons,
  summarizeTopStoriesInputChange,
  TOP_STORIES_COMPARISON_EVIDENCE_SCHEMA,
} from '../../../scripts/top-stories-shadow/comparisonEvidence.mjs';
import {
  validateTopStoriesDailyComparisonEvidence,
  validateTopStoriesPilotComparisonEvidence,
} from '../../../scripts/top-stories-shadow/comparisonEvidenceValidation.mjs';

const STUDY = 'study';
const DATE = '2026-07-17';
const SEGMENT = 'study|ranker|identity|period|normalization';
const MINUTE = 60 * 1000;

function observation(id, scheduledAt, inputDigest = 'same') {
  return { observationId: id, studyId: STUDY, scheduledAt, runAt: Date.parse(scheduledAt),
    inputDigest };
}

function pair(anchor, current, horizon) {
  const targetHorizonMs = horizon === 'fifteenMinute' ? 15 * MINUTE : 60 * MINUTE;
  const intervalMs = current.runAt - anchor.runAt;
  return { anchorId: anchor.observationId, currentId: current.observationId,
    anchor, current, anchorAt: anchor.runAt, currentAt: current.runAt, intervalMs,
    targetHorizonMs, intervalErrorMs: Math.abs(intervalMs - targetHorizonMs),
    segmentKey: SEGMENT };
}

function comparison(pairRow, retention = 1, periodClass = 'calm') {
  return { priorObservationId: pairRow.anchorId, currentObservationId: pairRow.currentId,
    segmentKey: SEGMENT, period: { periodClass }, eligibleForHeadlineKpi: true,
    comparisonEligibilityReasons: [], metrics: {
      incumbentRetention: retention, newListContinuity: retention, jaccard: retention,
      numberOneContinuity: true, normalizedWeightedRankDisplacement: 1 - retention,
      countDelta: 0, entrantCount: 0, exitCount: 0,
    } };
}

function fixtureReplay() {
  const start = Date.parse(`${DATE}T00:07:00.000Z`);
  const observations = Array.from({ length: 9 }, (_, index) =>
    observation(`o${index}`, new Date(start + index * 15 * MINUTE).toISOString()));
  const fifteenPairs = observations.slice(1).map((current, index) =>
    pair(observations[index], current, 'fifteenMinute'));
  const sixtyPair = pair(observations[0], observations[4], 'sixtyMinute');
  return {
    canonicalObservations: observations,
    pairSets: {
      fifteenMinute: { pairs: fifteenPairs,
        canonicalPairs: [fifteenPairs[0], fifteenPairs[2], fifteenPairs[4], fifteenPairs[6]] },
      sixtyMinute: { pairs: [sixtyPair], canonicalPairs: [sixtyPair] },
    },
    pairComparisons: {
      fifteenMinute: fifteenPairs.map(row => comparison(row, 0.95)),
      fifteenMinuteCanonical: [],
      sixtyMinute: [comparison(sixtyPair, 0.9)],
      sixtyMinuteCanonical: [],
    },
  };
}

function reportForEvidence(evidence, date = DATE) {
  const rows = horizon => getTopStoriesComparisonRecords(evidence, horizon);
  const canonical = horizon => getTopStoriesComparisonRecords(evidence, horizon, true);
  const buildStability = (horizon, threshold) => ({
    overlapping: summarizeTopStoriesComparisons(rows(horizon), threshold),
    canonicalNonOverlapping: summarizeTopStoriesComparisons(canonical(horizon), threshold),
  });
  const buildInput = horizon => ({
    overlapping: summarizeTopStoriesInputChange(rows(horizon)),
    canonicalNonOverlapping: summarizeTopStoriesInputChange(canonical(horizon)),
  });
  return {
    schemaVersion: 'nw-top-stories-daily-stability-report/v1', studyId: STUDY,
    date, status: 'OBSERVED',
    comparisonEvidenceSchemaVersion: TOP_STORIES_COMPARISON_EVIDENCE_SCHEMA,
    comparisonEvidence: evidence,
    coverage: { valid15mPairs: rows('fifteenMinute').length,
      canonical15mPairs: canonical('fifteenMinute').length,
      valid60mPairs: rows('sixtyMinute').length,
      canonical60mPairs: canonical('sixtyMinute').length },
    segmentSummaries: [{ segmentKey: SEGMENT,
      eligibleComparisonCounts: { fifteenMinute: rows('fifteenMinute').length,
        sixtyMinute: rows('sixtyMinute').length } }],
    stability: { fifteenMinute: buildStability('fifteenMinute', 0.9),
      sixtyMinute: buildStability('sixtyMinute', 0.8) },
    inputChange: { fifteenMinute: buildInput('fifteenMinute'),
      sixtyMinute: buildInput('sixtyMinute') },
    reviewThresholds: { fifteenMinute: 0.9, sixtyMinute: 0.8 },
  };
}

function singlePairReport(date, anchorAt, currentAt, anchorId, currentId) {
  const anchor = observation(anchorId, anchorAt);
  const current = observation(currentId, currentAt);
  const row = pair(anchor, current, 'sixtyMinute');
  const replay = {
    canonicalObservations: [anchor, current],
    pairSets: {
      fifteenMinute: { pairs: [], canonicalPairs: [] },
      sixtyMinute: { pairs: [row], canonicalPairs: [row] },
    },
    pairComparisons: { fifteenMinute: [], sixtyMinute: [comparison(row)] },
  };
  return reportForEvidence(buildTopStoriesComparisonEvidence(replay, {
    studyId: STUDY, ownerDate: date,
  }), date);
}

function validReport() {
  return reportForEvidence(buildTopStoriesComparisonEvidence(fixtureReplay(), {
    studyId: STUDY, ownerDate: DATE,
  }));
}

describe('NW-RANK-012D comparison evidence', () => {
  it('uses only the canonical identity tuple and is deterministic', () => {
    const base = { studyId: STUDY, horizon: 'fifteenMinute', segmentKey: SEGMENT,
      anchorObservationId: 'a', currentObservationId: 'b', targetHorizonMs: 15 * MINUTE };
    expect(buildTopStoriesComparisonId({
      ...base, metric: 0.1, periodClass: 'calm', title: 'A', rank: 1,
      generatedAt: '2026-01-01', workflowRunId: 'run-a', random: 0.1, index: 0,
    })).toBe(buildTopStoriesComparisonId({
      ...base, metric: 0.9, periodClass: 'active', title: 'B', rank: 99,
      generatedAt: '2027-01-01', workflowRunId: 'run-b', random: 0.9, index: 99,
    }));
    expect(buildTopStoriesComparisonId({ ...base, currentObservationId: 'c' }))
      .not.toBe(buildTopStoriesComparisonId(base));
  });

  it('publishes overlapping records and an observation-disjoint canonical subset', () => {
    const report = validReport();
    expect(report.comparisonEvidence.comparisonRecords).toHaveLength(9);
    expect(report.comparisonEvidence.canonicalComparisonIds).toHaveLength(5);
    expect(report.coverage).toMatchObject({ valid15mPairs: 8, canonical15mPairs: 4,
      valid60mPairs: 1, canonical60mPairs: 1 });
    expect(report.comparisonEvidence.crossHorizonPooled).toBe(false);
    expect(validateTopStoriesDailyComparisonEvidence(report)).toMatchObject({
      status: 'VALID', valid: true, reasonCodes: [],
    });
  });

  it('owns a cross-midnight pair only by the anchor scheduled UTC date', () => {
    const anchor = observation('a', '2026-07-17T23:52:00.000Z');
    const current = observation('b', '2026-07-18T00:07:00.000Z');
    const row = pair(anchor, current, 'fifteenMinute');
    const replay = { canonicalObservations: [anchor, current],
      pairSets: { fifteenMinute: { pairs: [row], canonicalPairs: [row] },
        sixtyMinute: { pairs: [], canonicalPairs: [] } },
      pairComparisons: { fifteenMinute: [comparison(row)], sixtyMinute: [] } };
    const evidence = buildTopStoriesComparisonEvidence(replay, { studyId: STUDY, ownerDate: DATE });
    expect(evidence.comparisonRecords[0].ownerDate).toBe(DATE);
    expect(evidence.comparisonRecords[0].currentScheduledAt).toContain('2026-07-18');
  });

  it('fails unknown canonical references, observation reuse and summary drift', () => {
    const unknown = structuredClone(validReport());
    unknown.comparisonEvidence.canonicalComparisonIds[0] = '0'.repeat(64);
    expect(validateTopStoriesDailyComparisonEvidence(unknown).reasonCodes)
      .toContain('canonical_comparison_reference_unknown');
    const reused = structuredClone(validReport());
    const canonical = reused.comparisonEvidence.canonicalComparisonIds;
    const records = reused.comparisonEvidence.comparisonRecords;
    const first = records.find(row => row.comparisonId === canonical[0]);
    const second = records.find(row => row.comparisonId === canonical[1]);
    second.anchorObservationId = first.currentObservationId;
    second.comparisonId = buildTopStoriesComparisonId({ studyId: STUDY, ...second });
    canonical[1] = second.comparisonId;
    canonical.sort();
    expect(validateTopStoriesDailyComparisonEvidence(reused, { reconcile: false }).reasonCodes)
      .toContain('canonical_observation_reuse');
    const drift = structuredClone(validReport());
    drift.stability.fifteenMinute.canonicalNonOverlapping.calm.incumbentRetention.median = 0;
    expect(validateTopStoriesDailyComparisonEvidence(drift).reasonCodes)
      .toContain('comparison_evidence_summary_mismatch');
  });

  it('rejects temporal overlap, incompatible segments and unsupported schemas', () => {
    const overlap = structuredClone(validReport());
    const ids = overlap.comparisonEvidence.canonicalComparisonIds;
    const records = overlap.comparisonEvidence.comparisonRecords;
    const first = records.find(row => row.comparisonId === ids[0]);
    const second = records.find(row => row.comparisonId === ids[1]);
    second.anchorAt = first.anchorAt + MINUTE;
    second.currentAt = first.currentAt + MINUTE;
    second.intervalMs = second.currentAt - second.anchorAt;
    second.intervalErrorMs = Math.abs(second.intervalMs - second.targetHorizonMs);
    second.anchorScheduledAt = new Date(second.anchorAt).toISOString();
    second.currentScheduledAt = new Date(second.currentAt).toISOString();
    second.comparisonId = buildTopStoriesComparisonId({ studyId: STUDY, ...second });
    ids[1] = second.comparisonId;
    ids.sort();
    records.sort((left, right) => (left.horizon === right.horizon ? 0 :
      left.horizon === 'fifteenMinute' ? -1 : 1) ||
      left.anchorAt - right.anchorAt || left.currentAt - right.currentAt ||
      left.comparisonId.localeCompare(right.comparisonId));
    expect(validateTopStoriesDailyComparisonEvidence(overlap, { reconcile: false }).reasonCodes)
      .toContain('canonical_comparison_overlap');

    const segment = validReport();
    expect(validateTopStoriesDailyComparisonEvidence(segment, {
      expectedSegmentKey: 'different-segment', reconcile: false,
    }).reasonCodes).toContain('canonical_segment_incompatible');

    const unsupported = validReport();
    unsupported.comparisonEvidenceSchemaVersion = 'unsupported/v9';
    expect(validateTopStoriesDailyComparisonEvidence(unsupported).reasonCodes)
      .toEqual(['comparison_evidence_schema_unsupported']);
  });

  it('allows cross-horizon reuse but rejects duplicate canonical evidence across days', () => {
    const report = validReport();
    const day = { date: DATE, usable: true, dailyReport: report };
    const valid = validateTopStoriesPilotComparisonEvidence([day], { expectedSegmentKey: SEGMENT });
    expect(valid.valid).toBe(true);
    const duplicate = validateTopStoriesPilotComparisonEvidence([
      day,
      { ...day, date: '2026-07-18', dailyReport: { ...report, date: '2026-07-18' } },
    ], { expectedSegmentKey: SEGMENT });
    expect(duplicate.reasonCodes).toContain('canonical_comparison_duplicate_across_days');
  });

  it('rejects cross-day overlap and observation reuse within one horizon', () => {
    const overlapA = singlePairReport(
      DATE, '2026-07-17T23:30:00.000Z', '2026-07-18T00:30:00.000Z', 'oa', 'ob',
    );
    const overlapB = singlePairReport(
      '2026-07-18', '2026-07-18T00:00:00.000Z', '2026-07-18T01:00:00.000Z', 'oc', 'od',
    );
    const overlap = validateTopStoriesPilotComparisonEvidence([
      { date: DATE, usable: true, dailyReport: overlapA },
      { date: '2026-07-18', usable: true, dailyReport: overlapB },
    ], { expectedSegmentKey: SEGMENT });
    expect(overlap.reasonCodes).toContain('canonical_comparison_overlap');

    const reuseA = singlePairReport(
      DATE, '2026-07-17T22:00:00.000Z', '2026-07-17T23:00:00.000Z', 'ra', 'shared',
    );
    const reuseB = singlePairReport(
      '2026-07-18', '2026-07-18T00:00:00.000Z', '2026-07-18T01:00:00.000Z', 'shared', 'rc',
    );
    const reuse = validateTopStoriesPilotComparisonEvidence([
      { date: DATE, usable: true, dailyReport: reuseA },
      { date: '2026-07-18', usable: true, dailyReport: reuseB },
    ], { expectedSegmentKey: SEGMENT });
    expect(reuse.reasonCodes).toContain('canonical_observation_reuse');
  });

  it('is deeply immutable and does not mutate replay input', () => {
    const replay = fixtureReplay();
    const before = structuredClone(replay);
    const evidence = buildTopStoriesComparisonEvidence(replay, { studyId: STUDY, ownerDate: DATE });
    expect(replay).toEqual(before);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.comparisonRecords)).toBe(true);
    expect(Object.isFrozen(evidence.comparisonRecords[0].metrics)).toBe(true);
  });
});
