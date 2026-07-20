import { describe, expect, it } from 'vitest';
import { buildTopStoriesPilotDecision } from '../../../scripts/top-stories-shadow/pilotDecision.mjs';
import {
  getTopStoriesComparisonRecords,
  summarizeTopStoriesComparisons,
  summarizeTopStoriesInputChange,
} from '../../../scripts/top-stories-shadow/comparisonEvidence.mjs';
import {
  buildPilotArtifacts,
  PILOT_CONFIG,
  PILOT_READY_NOW,
} from './fixtures/topStoriesPilotDecisionFixture.js';

function decide(options = {}, nowMs = PILOT_READY_NOW, inputManifest = {}, artifacts = null) {
  return buildTopStoriesPilotDecision({
    canonicalArtifacts: artifacts || buildPilotArtifacts(options),
    studyConfig: PILOT_CONFIG,
    nowMs,
    inputManifest: { unassignedCount: 0, foreignStudyCount: 0, ...inputManifest },
  });
}

function recomputeDailySummaries(report) {
  const evidence = report.comparisonEvidence;
  const build = (horizon, threshold) => ({
    overlapping: summarizeTopStoriesComparisons(
      getTopStoriesComparisonRecords(evidence, horizon), threshold,
    ),
    canonicalNonOverlapping: summarizeTopStoriesComparisons(
      getTopStoriesComparisonRecords(evidence, horizon, true), threshold,
    ),
  });
  const input = horizon => ({
    overlapping: summarizeTopStoriesInputChange(
      getTopStoriesComparisonRecords(evidence, horizon),
    ),
    canonicalNonOverlapping: summarizeTopStoriesInputChange(
      getTopStoriesComparisonRecords(evidence, horizon, true),
    ),
  });
  report.stability = { fifteenMinute: build('fifteenMinute', 0.9),
    sixtyMinute: build('sixtyMinute', 0.8) };
  report.inputChange = { fifteenMinute: input('fifteenMinute'),
    sixtyMinute: input('sixtyMinute') };
}

describe('Top Stories seven-day pilot decision', () => {
  it('retains current policy from validated canonical comparison records', () => {
    const result = decide();
    expect(result.decision).toBe('READY_FOR_EXPERT_REVIEW');
    expect(result.recommendation).toBe('RETAIN_CURRENT_POLICY');
    expect(result.metrics.operational.usableDayCount).toBe(7);
    expect(result.metrics.stability.calm15mCanonicalComparisonCount).toBe(280);
    expect(result.metrics.stability.calm60mCanonicalComparisonCount).toBe(140);
    expect(result.decisionEvidence).toMatchObject({
      schemaVersion: 'nw-top-stories-comparison-evidence/v1',
      fifteenMinute: { comparisonCount: 280, usableDayCount: 7 },
      sixtyMinute: { comparisonCount: 140, usableDayCount: 7 },
      crossHorizonPooled: false,
      accountingConserved: true,
    });
    expect(result.metrics.crossDayBoundary.comparisonCount).toBe(6);
    expect(result.metrics.crossDayBoundary.incumbentRetention.median).toBe(1);
    expect(result.metrics.residence.durationMinutes.median).toBeGreaterThan(9000);
    expect(result.productionChangeAuthorized).toBe(false);
    expect(result.automaticPolicyChangeAuthorized).toBe(false);
  });

  it('identifies a recall candidate for a repeatedly collapsed visible rail', () => {
    const result = decide({ displayedCount: 3 });
    expect(result.decision).toBe('READY_FOR_EXPERT_REVIEW');
    expect(result.recommendation).toBe('RECALL_REPAIR_CANDIDATE');
    expect(result.metrics.railAndFunnel.railBuckets['1-3']).toBe(672);
    expect(result.signals.recallSignal).toBe(true);
  });

  it('identifies persistence only with unchanged-input instability and active evidence', () => {
    const result = decide({ calm15: 0.70, calm60: 0.65,
      unchanged15: 0.70, unchanged60: 0.65, activeDays: [0, 1] });
    expect(result.recommendation).toBe('PERSISTENCE_CANDIDATE');
    expect(result.signals.activeReady).toBe(true);
    expect(result.signals.unchangedInstability).toBe(true);
  });

  it('identifies a combined candidate when sufficiency and stability both fail', () => {
    const result = decide({ displayedCount: 3, calm15: 0.70, calm60: 0.65,
      unchanged15: 0.70, unchanged60: 0.65, activeDays: [0, 1] });
    expect(result.recommendation).toBe('COMBINED_RECALL_AND_PERSISTENCE_CANDIDATE');
  });

  it('continues observation when active responsiveness was not observed', () => {
    const result = decide({ calm15: 0.70, calm60: 0.65,
      unchanged15: 0.70, unchanged60: 0.65 });
    expect(result.recommendation).toBe('CONTINUE_OBSERVATION');
    expect(result.evidenceGaps).toContain('active_responsiveness_not_sufficiently_observed');
  });

  it('returns insufficient before the fixed window or when one day is absent', () => {
    const early = decide({}, Date.parse('2026-07-23T12:00:00.000Z'));
    const missing = decide({ missingDailyIndex: 3 });
    expect(early.decision).toBe('INSUFFICIENT');
    expect(early.insufficiencyReasonCodes).toContain('pilot_window_not_complete');
    expect(missing.decision).toBe('INSUFFICIENT');
    expect(missing.insufficiencyReasonCodes).toContain('expected_dates_not_fully_represented');
  });

  it('fails closed for technical days, foreign studies and legacy missing evidence', () => {
    const failedDay = decide({ failIndex: 2 });
    const foreign = decide({}, PILOT_READY_NOW, { foreignStudyCount: 1 });
    const legacyArtifacts = buildPilotArtifacts();
    const legacy = legacyArtifacts.find(row => row.type === 'daily' && row.date === '2026-07-19');
    delete legacy.dailyReport.comparisonEvidence;
    delete legacy.dailyReport.comparisonEvidenceSchemaVersion;
    legacy.comparisonEvidenceStatus = 'MISSING_LEGACY';
    legacy.comparisonEvidenceReasonCodes = ['comparison_evidence_missing'];
    const legacyDecision = decide({}, PILOT_READY_NOW, {}, legacyArtifacts);
    expect(failedDay.decision).toBe('FAIL');
    expect(failedDay.recommendation).toBe('OPERATIONAL_REPAIR_REQUIRED');
    expect(foreign.failureReasonCodes).toContain('foreign_study_artifact');
    expect(legacyDecision.decision).toBe('FAIL');
    expect(legacyDecision.failureReasonCodes).toContain('comparison_evidence_missing');
    expect(legacyDecision.recommendation).toBe('OPERATIONAL_REPAIR_REQUIRED');
  });

  it('fails closed for incomplete or mixed normalization evidence', () => {
    const missingDigest = decide({ normalizationDefectIndex: 2 });
    const mixed = decide({ mixedNormalizationIndex: 4 });
    expect(missingDigest.decision).toBe('FAIL');
    expect(missingDigest.days[2].status).toBe('TECHNICAL_FAILURE');
    expect(missingDigest.days[2].errors).toContain('normalization_digest_missing');
    expect(mixed.decision).toBe('FAIL');
    expect(mixed.days[4].errors).toContain('normalization_version_boundary');
    expect(mixed.recommendation).toBe('OPERATIONAL_REPAIR_REQUIRED');
  });

  it('does not let overlapping deterioration drive readiness or recommendations', () => {
    const artifacts = buildPilotArtifacts();
    artifacts.filter(row => row.type === 'daily').forEach(day => {
      const canonical = new Set(day.dailyReport.comparisonEvidence.canonicalComparisonIds);
      day.dailyReport.comparisonEvidence.comparisonRecords
        .filter(row => !canonical.has(row.comparisonId))
        .forEach(row => { row.metrics.incumbentRetention = 0; });
      recomputeDailySummaries(day.dailyReport);
    });
    const result = decide({}, PILOT_READY_NOW, {}, artifacts);
    expect(result.decision).toBe('READY_FOR_EXPERT_REVIEW');
    expect(result.recommendation).toBe('RETAIN_CURRENT_POLICY');
    expect(result.metrics.stability.calm15mDailyMedian.median).toBe(0.95);
  });

  it('rejects mutable declared counts and cross-day duplicate canonical evidence', () => {
    const driftArtifacts = buildPilotArtifacts();
    driftArtifacts.find(row => row.type === 'daily')
      .dailyReport.stability.fifteenMinute.canonicalNonOverlapping
      .calm.incumbentRetention.count += 100;
    const drift = decide({}, PILOT_READY_NOW, {}, driftArtifacts);
    expect(drift.decision).toBe('FAIL');
    expect(drift.failureReasonCodes).toContain('comparison_evidence_summary_mismatch');
    const duplicateArtifacts = buildPilotArtifacts();
    const days = duplicateArtifacts.filter(row => row.type === 'daily');
    const source = days[0].dailyReport.comparisonEvidence;
    const duplicateId = source.canonicalComparisonIds[0];
    const duplicateRecord = source.comparisonRecords.find(row => row.comparisonId === duplicateId);
    days[1].dailyReport.comparisonEvidence.comparisonRecords.push(structuredClone(duplicateRecord));
    days[1].dailyReport.comparisonEvidence.comparisonRecords.sort((left, right) =>
      (left.horizon === right.horizon ? 0 : left.horizon === 'fifteenMinute' ? -1 : 1) ||
      left.anchorAt - right.anchorAt || left.comparisonId.localeCompare(right.comparisonId));
    days[1].dailyReport.comparisonEvidence.canonicalComparisonIds.push(duplicateId);
    days[1].dailyReport.comparisonEvidence.canonicalComparisonIds.sort();
    const duplicate = decide({}, PILOT_READY_NOW, {}, duplicateArtifacts);
    expect(duplicate.decision).toBe('FAIL');
    expect(duplicate.failureReasonCodes)
      .toContain('canonical_comparison_duplicate_across_days');
  });

  it('preserves fixed dates, thresholds and decision not-before', () => {
    const result = decide();
    expect(result.pilotStartDate).toBe('2026-07-17');
    expect(result.pilotEndDate).toBe('2026-07-23');
    expect(result.pilotWindowDays).toBe(7);
    expect(PILOT_CONFIG.pilotDecisionNotBefore).toBe('2026-07-24T02:30:00.000Z');
    expect(result.thresholds.minimumCalm15mCanonicalComparisons).toBe(80);
    expect(result.thresholds.minimumCalm60mCanonicalComparisons).toBe(30);
  });
});
