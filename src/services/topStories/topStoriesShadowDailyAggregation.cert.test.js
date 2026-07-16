import { describe, expect, it } from 'vitest';
import {
  aggregateTopStoriesDaily,
  serializeTopStoriesDailyReport,
} from '../../../scripts/top-stories-shadow/dailyAggregation.mjs';

const STUDY = 'nw-rank-011-shadow-pilot-2026-07';
const DATE = '2026-07-16';
const VERSIONS = {
  rankerVersion: 'nw-top-stories-ranker-observed-v1',
  identityVersion: 'nw-top-stories-identity-v1',
  periodClassifierVersion: 'nw-top-stories-period-classifier-v1',
};

function story(id) {
  return {
    id: `row-${id}`,
    canonicalId: id,
    title: `Story ${id} remains important today`,
    source: 'Reuters',
    sourceGroup: 'reuters',
    _topStoryRank: {
      slotBand: 'secondary',
      eventType: 'unknown',
      eventQualified: false,
      independentEvidenceCount: 0,
      normalizedScore: 0.5,
      sourceCount: 1,
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
    ...VERSIONS,
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
    validRecord({ minute: 7, runId: 101 }),
    validRecord({ minute: 22, runId: 102 }),
    validRecord({ minute: 37, runId: 103, ids: ['a', 'b', 'd'] }),
    validRecord({ minute: 52, runId: 104, ids: ['a', 'b', 'd'] }),
    validRecord({ hour: 11, minute: 7, runId: 105, ids: ['a', 'b', 'd'] }),
    validRecord({ hour: 11, minute: 22, runId: 106, ids: ['a', 'b', 'e'] }),
  ];
}

describe('Top Stories daily aggregation', () => {
  it('uses canonical attempts while preserving superseded and failure evidence', () => {
    const records = buildSequence();
    records.push(validRecord({ minute: 22, runId: 202, attempt: 2 }));
    records.push(failureRecord());

    const { report, replay } = aggregateTopStoriesDaily(records, {
      date: DATE,
      studyId: STUDY,
    });

    expect(report.status).toBe('OBSERVED');
    expect(report.coverage.startedRuns).toBe(8);
    expect(report.coverage.successfulRuns).toBe(7);
    expect(report.coverage.failureRuns).toBe(1);
    expect(report.coverage.supersededDuplicateCount).toBe(1);
    expect(report.coverage.canonicalObservationCount).toBe(6);
    expect(replay.canonicalObservations).toHaveLength(6);
    expect(report.stability.fifteenMinute.overlapping.totalComparisons).toBeGreaterThan(0);
    expect(report.stability.sixtyMinute.overlapping.totalComparisons).toBeGreaterThan(0);
    expect(
      report.stability.sixtyMinute.canonicalNonOverlapping.totalComparisons,
    ).toBeLessThanOrEqual(report.stability.sixtyMinute.overlapping.totalComparisons);
  });

  it('does not let context-window observations inflate target-day coverage', () => {
    const priorContext = {
      ...validRecord({ minute: 7, runId: 1 }),
      snapshot: {
        ...validRecord({ minute: 7, runId: 1 }).snapshot,
        scheduledAt: '2026-07-15T23:52:00.000Z',
        runAt: '2026-07-15T23:53:00.000Z',
      },
      operational: {
        ...validRecord({ minute: 7, runId: 1 }).operational,
        scheduledAt: '2026-07-15T23:52:00.000Z',
        runAt: '2026-07-15T23:53:00.000Z',
        nominalSlotKey: '20260715T2352Z',
      },
    };
    const records = [priorContext, ...buildSequence()];
    const { report } = aggregateTopStoriesDaily(records, { date: DATE, studyId: STUDY });

    expect(report.coverage.discoveredArtifacts).toBe(6);
    expect(report.coverage.contextArtifactCount).toBe(1);
    expect(report.inputManifest.filter(row => row.withinReportDay)).toHaveLength(6);
  });

  it('is deterministic and emits an explicit empty-day report', () => {
    const records = buildSequence();
    const first = aggregateTopStoriesDaily(records, { date: DATE, studyId: STUDY }).report;
    const second = aggregateTopStoriesDaily(records, { date: DATE, studyId: STUDY }).report;
    expect(second).toEqual(first);
    expect(serializeTopStoriesDailyReport(second)).toBe(serializeTopStoriesDailyReport(first));

    const empty = aggregateTopStoriesDaily([], { date: DATE, studyId: STUDY }).report;
    expect(empty.status).toBe('EMPTY');
    expect(empty.coverage.scheduledSlots).toBe(96);
    expect(empty.coverage.observedSlotCount).toBe(0);
    expect(empty.stability.fifteenMinute.overlapping.totalComparisons).toBe(0);
  });
});
