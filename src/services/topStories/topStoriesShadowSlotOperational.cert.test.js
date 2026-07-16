import { describe, expect, it } from 'vitest';
import { resolveTopStoriesNominalSlot } from '../../../scripts/top-stories-shadow/nominalSlot.mjs';
import { buildTopStoriesOperationalRecord } from '../../../scripts/top-stories-shadow/operationalRecord.mjs';

const RUN_AT = '2026-07-16T18:22:30.000Z';

describe('NW-RANK-011D nominal slots', () => {
  it('resolves exact and delayed offset-grid observations', () => {
    expect(resolveTopStoriesNominalSlot('2026-07-16T18:07:00Z'))
      .toMatchObject({
        scheduledAt: '2026-07-16T18:07:00.000Z',
        scheduleDelaySeconds: 0,
      });
    expect(resolveTopStoriesNominalSlot('2026-07-16T18:29:30Z'))
      .toMatchObject({
        scheduledAt: '2026-07-16T18:22:00.000Z',
        scheduleDelaySeconds: 450,
      });
  });

  it('handles hour and day rollover deterministically', () => {
    expect(resolveTopStoriesNominalSlot('2026-07-16T18:01:00Z').scheduledAt)
      .toBe('2026-07-16T17:52:00.000Z');
    expect(resolveTopStoriesNominalSlot('2026-01-01T00:03:00Z').scheduledAt)
      .toBe('2025-12-31T23:52:00.000Z');
    expect(() => resolveTopStoriesNominalSlot('not-a-date'))
      .toThrow(/valid runAt/);
  });
});

describe('NW-RANK-011D operational evidence', () => {
  it('contains run facts but no cross-run editorial metrics', () => {
    const record = buildTopStoriesOperationalRecord({
      studyConfig: {
        studyId: 'study',
        observationMode: 'repository-snapshot-replay',
      },
      metadata: {
        repositorySha: 'sha',
        workflowRunId: 'run',
        workflowRunAttempt: 1,
      },
      slot: resolveTopStoriesNominalSlot(RUN_AT),
      adapterInput: {
        inputSource: 'repository-public-newsdata-sections-v2',
        inputSnapshotGeneratedAt: '2026-07-16T18:17:00.000Z',
        inputDiagnostics: {
          adapterVersion: 'adapter',
          snapshotAgeMs: 300000,
        },
        sourceHealth: {
          ok: true,
          complete: true,
          failedSourceCount: 0,
          warningSourceCount: 0,
          missingSections: [],
        },
      },
      runResult: {
        ok: true,
        snapshot: { observationId: 'observation' },
        files: {
          'snapshot.json': '{}\n',
          'manifest.json': '{}\n',
        },
      },
    });
    const text = JSON.stringify(record);

    expect(record).toMatchObject({
      observationState: 'SNAPSHOT_WRITTEN',
      crossRunMetricsIncluded: false,
      nominalSlotKey: '20260716T182200Z',
    });
    ['retention', 'entrant', 'exit', 'residence', 'jaccard']
      .forEach(key => expect(text).not.toContain(key));
  });
});
