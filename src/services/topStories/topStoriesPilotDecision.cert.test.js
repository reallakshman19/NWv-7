import { describe, expect, it } from 'vitest';
import { buildTopStoriesPilotDecision } from '../../../scripts/top-stories-shadow/pilotDecision.mjs';
import {
  buildPilotArtifacts,
  PILOT_CONFIG,
  PILOT_READY_NOW,
} from './fixtures/topStoriesPilotDecisionFixture.js';

function decide(options = {}, nowMs = PILOT_READY_NOW, inputManifest = {}) {
  return buildTopStoriesPilotDecision({
    canonicalArtifacts: buildPilotArtifacts(options),
    studyConfig: PILOT_CONFIG,
    nowMs,
    inputManifest: { unassignedCount: 0, foreignStudyCount: 0, ...inputManifest },
  });
}

describe('Top Stories seven-day pilot decision', () => {
  it('retains the current policy when rail and calm stability targets are met', () => {
    const result = decide();
    expect(result.decision).toBe('READY_FOR_EXPERT_REVIEW');
    expect(result.recommendation).toBe('RETAIN_CURRENT_POLICY');
    expect(result.metrics.operational.usableDayCount).toBe(7);
    expect(result.metrics.crossDayBoundary.comparisonCount).toBe(6);
    expect(result.metrics.crossDayBoundary.incumbentRetention.median).toBe(1);
    expect(result.metrics.residence.durationMinutes.median).toBeGreaterThan(9000);
    expect(result.productionChangeAuthorized).toBe(false);
  });

  it('identifies a recall candidate for a repeatedly collapsed visible rail', () => {
    const result = decide({ displayedCount: 3 });
    expect(result.decision).toBe('READY_FOR_EXPERT_REVIEW');
    expect(result.recommendation).toBe('RECALL_REPAIR_CANDIDATE');
    expect(result.metrics.railAndFunnel.railBuckets['1-3']).toBe(672);
    expect(result.signals.recallSignal).toBe(true);
  });

  it('identifies persistence only with unchanged-input instability and active evidence', () => {
    const result = decide({
      calm15: 0.70,
      calm60: 0.65,
      unchanged15: 0.70,
      unchanged60: 0.65,
      activeDays: [0, 1],
    });
    expect(result.recommendation).toBe('PERSISTENCE_CANDIDATE');
    expect(result.signals.activeReady).toBe(true);
    expect(result.signals.unchangedInstability).toBe(true);
  });

  it('identifies a combined candidate when sufficiency and stability both fail', () => {
    const result = decide({
      displayedCount: 3,
      calm15: 0.70,
      calm60: 0.65,
      unchanged15: 0.70,
      unchanged60: 0.65,
      activeDays: [0, 1],
    });
    expect(result.recommendation).toBe('COMBINED_RECALL_AND_PERSISTENCE_CANDIDATE');
  });

  it('continues observation when active responsiveness was not observed', () => {
    const result = decide({
      calm15: 0.70,
      calm60: 0.65,
      unchanged15: 0.70,
      unchanged60: 0.65,
    });
    expect(result.recommendation).toBe('CONTINUE_OBSERVATION');
    expect(result.evidenceGaps).toContain('active_responsiveness_not_sufficiently_observed');
  });

  it('returns insufficient before the fixed window or when one day is incomplete', () => {
    const early = decide({}, Date.parse('2026-07-23T12:00:00.000Z'));
    const missing = decide({ missingDailyIndex: 3 });
    expect(early.decision).toBe('INSUFFICIENT');
    expect(early.insufficiencyReasonCodes).toContain('pilot_window_not_complete');
    expect(missing.decision).toBe('INSUFFICIENT');
    expect(missing.insufficiencyReasonCodes).toContain('expected_dates_not_fully_represented');
  });

  it('fails closed for a technical day or foreign-study evidence', () => {
    const failedDay = decide({ failIndex: 2 });
    const foreign = decide({}, PILOT_READY_NOW, { foreignStudyCount: 1 });
    expect(failedDay.decision).toBe('FAIL');
    expect(failedDay.recommendation).toBe('OPERATIONAL_REPAIR_REQUIRED');
    expect(foreign.failureReasonCodes).toContain('foreign_study_artifact');
  });
});
