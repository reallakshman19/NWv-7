import { describe, expect, it } from 'vitest';
import {
  aggregateTopStoriesDaily,
  serializeTopStoriesDailyReport,
} from '../../../scripts/top-stories-shadow/dailyAggregation.mjs';
import {
  buildTopStoriesVersionSegmentKey,
  TOP_STORIES_NORMALIZATION_VERSION,
} from './topStoriesVersionSegment.js';

const STUDY = 'nw-rank-011-shadow-pilot-2026-07';
const DATE = '2026-07-16';
const CONFIG = Object.freeze({
  studyId: STUDY,
  rankerVersion: 'nw-top-stories-ranker-observed-v1',
  identityVersion: 'nw-top-stories-identity-v1',
  periodClassifierVersion: 'nw-top-stories-period-classifier-v1',
  normalizationVersion: TOP_STORIES_NORMALIZATION_VERSION,
});
const DIGEST = 'a'.repeat(64);

function story(id) {
  return {
    id: `row-${id}`,
    canonicalId: id,
    title: `Story ${id} remains important today`,
    source: 'Reuters',
    sourceGroup: 'reuters',
    _topStoryRank: {
      slotBand: 'secondary', eventType: 'unknown', eventQualified: false,
      independentEvidenceCount: 0, normalizedScore: 0.5, sourceCount: 1,
      priorityBucket: 2,
    },
  };
}

function isoAt(hour, minute) {
  return `${DATE}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}

function validRecord({
  hour = 10,
  minute,
  attempt = 1,
  runId,
  ids = ['a', 'b', 'c'],
  completenessState = 'COMPLETE',
  analyticalEligibility = 'ELIGIBLE',
  sourceHealth = { ok: true, complete: true, failedSourceCount: 0 },
  normalizationVersion = TOP_STORIES_NORMALIZATION_VERSION,
  normalizationDigest = DIGEST,
} = {}) {
  const scheduledAt = isoAt(hour, minute);
  const runAt = isoAt(hour, minute + 1);
  const snapshot = {
    schemaVersion: 'nw-top-stories-run-snapshot/v1',
    studyId: STUDY,
    observationId: `${STUDY}:${scheduledAt}:${runId}:${attempt}`,
    scheduledAt,
    runAt,
    workflowRunId: String(runId),
    workflowRunAttempt: attempt,
    completenessState,
    analyticalEligibility,
    ...CONFIG,
    normalizationVersion,
    normalizationDigest,
    displayed: ids.map(story),
    candidateEvidence: [],
    sourceHealth,
  };
  return {
    directory: `/artifact/${runId}-${attempt}`,
    schemaValid: true,
    status: 'VALID_SNAPSHOT',
    snapshot,
    failure: null,
    operational: {
      schemaVersion: 'nw-top-stories-shadow-operational/v1',
      studyId: STUDY,
      scheduledAt,
      runAt,
      workflowRunId: String(runId),
      workflowRunAttempt: attempt,
      nominalSlotKey: scheduledAt.replace(/[-:.]/g, ''),
      scheduleDelaySeconds: 60,
    },
  };
}

function failureRecord({ hour = 10, minute = 37, runId = 900 } = {}) {
  const scheduledAt = isoAt(hour, minute);
  const runAt = isoAt(hour, minute + 1);
  return {
    directory: `/artifact/${runId}`,
    schemaValid: true,
    status: 'VALID_FAILURE',
    snapshot: null,
    failure: {
      schemaVersion: 'nw-top-stories-run-failure/v1',
      studyId: STUDY,
      scheduledAt,
      runAt,
      workflowRunId: String(runId),
      workflowRunAttempt: 1,
    },
    exclusionReason: 'failure_artifact',
    operational: {
      schemaVersion: 'nw-top-stories-shadow-operational/v1',
      studyId: STUDY,
      scheduledAt,
      runAt,
      workflowRunId: String(runId),
      workflowRunAttempt: 1,
      nominalSlotKey: scheduledAt.replace(/[-:.]/g, ''),
      scheduleDelaySeconds: 60,
    },
  };
}

function buildSequence() {
  return [
    validRecord({ minute: 7, runId: 101, normalizationDigest: '1'.repeat(64) }),
    validRecord({ minute: 22, runId: 102, normalizationDigest: '2'.repeat(64) }),
    validRecord({ minute: 37, runId: 103, ids: ['a', 'b', 'd'], normalizationDigest: '3'.repeat(64) }),
    validRecord({ minute: 52, runId: 104, ids: ['a', 'b', 'd'], normalizationDigest: '4'.repeat(64) }),
    validRecord({ hour: 11, minute: 7, runId: 105, ids: ['a', 'b', 'd'], normalizationDigest: '5'.repeat(64) }),
    validRecord({ hour: 11, minute: 22, runId: 106, ids: ['a', 'b', 'e'], normalizationDigest: '6'.repeat(64) }),
  ];
}

function aggregate(records, date = DATE) {
  return aggregateTopStoriesDaily(records, { date, studyConfig: CONFIG });
}

describe('Top Stories daily aggregation with normalization segmentation', () => {
  it('uses canonical attempts while preserving superseded and failure evidence', () => {
    const records = buildSequence();
    records.push(validRecord({ minute: 22, runId: 202, attempt: 2 }));
    records.push(failureRecord());
    const { report, replay } = aggregate(records);
    expect(report.status).toBe('OBSERVED');
    expect(report.coverage.startedRuns).toBe(8);
    expect(report.coverage.successfulRuns).toBe(7);
    expect(report.coverage.failureRuns).toBe(1);
    expect(report.coverage.supersededDuplicateCount).toBe(1);
    expect(report.coverage.canonicalObservationCount).toBe(6);
    expect(replay.canonicalObservations).toHaveLength(6);
    expect(report.normalizationEvidenceCoverage).toMatchObject({
      totalCanonicalObservations: 6,
      validNormalizationEvidenceCount: 6,
      complete: true,
    });
    expect(report.versionSegments).toEqual([buildTopStoriesVersionSegmentKey(CONFIG)]);
    expect(report.segmentSummaries).toHaveLength(1);
    expect(report.headlineKpiEligibility).toEqual({ eligible: true, reasonCodes: [] });
  });

  it('retains missing evidence operationally while excluding it analytically', () => {
    const records = buildSequence();
    records[2] = validRecord({
      minute: 37, runId: 103, ids: ['a', 'b', 'd'], normalizationDigest: '',
    });
    const { report } = aggregate(records);
    expect(report.inputManifest).toHaveLength(6);
    expect(report.normalizationEvidenceCoverage.normalizationDigestMissingCount).toBe(1);
    expect(report.normalizationEvidenceCoverage.validNormalizationEvidenceCount).toBe(5);
    expect(report.headlineKpiEligibility.eligible).toBe(false);
    expect(report.headlineKpiEligibility.reasonCodes)
      .toContain('normalization_digest_missing');
    expect(report.pairing.fifteenMinuteExclusions.normalization_digest_missing).toBe(1);
  });

  it('partitions mixed versions and rejects homogeneous headline eligibility', () => {
    const records = buildSequence();
    [3, 4, 5].forEach(index => {
      const original = records[index].snapshot;
      records[index] = validRecord({
        hour: Number(original.scheduledAt.slice(11, 13)),
        minute: Number(original.scheduledAt.slice(14, 16)),
        runId: original.workflowRunId,
        ids: original.displayed.map(row => row.canonicalId),
        normalizationVersion: 'nw-top-stories-normalization-v2',
        normalizationDigest: String(index + 1).repeat(64),
      });
    });
    const { report } = aggregate(records);
    expect(report.versionSegments).toHaveLength(2);
    expect(report.segmentSummaries).toHaveLength(2);
    expect(report.headlineKpiEligibility.eligible).toBe(false);
    expect(report.headlineKpiEligibility.reasonCodes)
      .toContain('normalization_version_boundary');
    expect(report.pairing.fifteenMinuteExclusions.normalization_version_boundary)
      .toBeGreaterThan(0);
  });

  it('does not let context-window observations inflate target-day coverage', () => {
    const priorContext = validRecord({ minute: 7, runId: 1 });
    priorContext.snapshot = {
      ...priorContext.snapshot,
      scheduledAt: '2026-07-15T23:52:00.000Z',
      runAt: '2026-07-15T23:53:00.000Z',
    };
    priorContext.operational = {
      ...priorContext.operational,
      scheduledAt: '2026-07-15T23:52:00.000Z',
      runAt: '2026-07-15T23:53:00.000Z',
      nominalSlotKey: '20260715T2352Z',
    };
    const { report } = aggregate([priorContext, ...buildSequence()]);
    expect(report.coverage.discoveredArtifacts).toBe(6);
    expect(report.coverage.contextArtifactCount).toBe(1);
    expect(report.normalizationEvidenceCoverage.totalCanonicalObservations).toBe(6);
  });

  it('is deterministic and emits an explicit empty-day report', () => {
    const records = buildSequence();
    const first = aggregate(records).report;
    const second = aggregate(records).report;
    expect(second).toEqual(first);
    expect(serializeTopStoriesDailyReport(second)).toBe(serializeTopStoriesDailyReport(first));
    const empty = aggregate([], DATE).report;
    expect(empty.status).toBe('EMPTY');
    expect(empty.coverage.observedSlotCount).toBe(0);
    expect(empty.headlineKpiEligibility.eligible).toBe(false);
  });
});
