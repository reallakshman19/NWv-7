import { describe, expect, it } from 'vitest';
import { aggregateTopStoriesDailyEvidence } from '../../../scripts/top-stories-shadow/dailyEvidenceAggregation.mjs';
import { renderTopStoriesDailyMarkdown } from '../../../scripts/top-stories-shadow/dailyReportMarkdown.mjs';
import { buildTopStoriesRailFunnelAnalytics } from '../../../scripts/top-stories-shadow/railFunnelAnalytics.mjs';
import { validateTopStoriesOperationalDay } from '../../../scripts/top-stories-shadow/operationalValidation.mjs';
import {
  buildTopStoriesVersionSegmentKey,
  TOP_STORIES_NORMALIZATION_VERSION,
} from './topStoriesVersionSegment.js';

const STUDY = 'nw-rank-011-shadow-pilot-2026-07';
const CONFIG = Object.freeze({
  schemaVersion: 'nw-top-stories-shadow-study/v1',
  studyId: STUDY,
  rankerVersion: 'nw-top-stories-ranker-observed-v1',
  identityVersion: 'nw-top-stories-identity-v1',
  periodClassifierVersion: 'nw-top-stories-period-classifier-v1',
  normalizationVersion: TOP_STORIES_NORMALIZATION_VERSION,
});
const SEGMENT = buildTopStoriesVersionSegmentKey(CONFIG);

function selectionRow(disposition, reason, selectedRank = null, displayDepth = 10) {
  const admissionRejected = disposition === 'REJECTED_BY_ADMISSION';
  const selected = Number.isFinite(selectedRank);
  return {
    candidateId: `${disposition}-${reason}-${selectedRank ?? 'none'}`,
    finalDisposition: disposition,
    finalStage: admissionRejected ? 'admission' : selected ? 'display' : 'selection',
    finalReasonCode: reason,
    selectedRank,
    stages: [
      {
        stage: 'admission',
        status: admissionRejected ? 'rejected' : 'passed',
        reasonCodes: admissionRejected ? [reason] : [],
      },
      {
        stage: 'selection',
        status: selected ? 'selected' : admissionRejected ? 'not_applicable' : 'not_selected',
        reasonCodes: !selected && !admissionRejected ? [reason] : [],
      },
      {
        stage: 'display',
        status: selected && selectedRank <= displayDepth ? 'displayed' : 'not_applicable',
        reasonCodes: [],
      },
    ],
  };
}

function funnel(raw, candidates, admitted, ranked, displayed) {
  return [
    { stage: 'raw_input', inputUnit: null, inputCount: null,
      outputUnit: 'SOURCE_ROW', outputCount: raw, reasonCounts: {} },
    { stage: 'candidate_build', inputUnit: 'SOURCE_ROW', inputCount: raw,
      outputUnit: 'RANKING_CANDIDATE', outputCount: candidates,
      reasonCounts: { duplicate_identity: raw - candidates } },
    { stage: 'admission', inputUnit: 'RANKING_CANDIDATE', inputCount: candidates,
      outputUnit: 'RANKING_CANDIDATE', outputCount: admitted,
      reasonCounts: { unqualified_without_independent_evidence: candidates - admitted } },
    { stage: 'ranker_selection', inputUnit: 'RANKING_CANDIDATE', inputCount: admitted,
      outputUnit: 'RANKED_ITEM', outputCount: ranked,
      reasonCounts: { max_per_source: admitted - ranked } },
    { stage: 'display_projection', inputUnit: 'RANKED_ITEM', inputCount: ranked,
      outputUnit: 'DISPLAYED_ITEM', outputCount: displayed,
      reasonCounts: { outside_display_limit: Math.max(0, ranked - displayed) } },
  ];
}

function observation({ id, scheduledAt, displayedCount, rankedCount = displayedCount }) {
  const selectionTrace = [
    ...Array.from({ length: displayedCount }, (_, index) =>
      selectionRow('DISPLAYED', 'displayed', index + 1)),
    selectionRow('REJECTED_BY_ADMISSION', 'unqualified_without_independent_evidence'),
    selectionRow('ELIGIBLE_NOT_SELECTED', 'max_per_source'),
  ];
  return {
    observationId: id,
    scheduledAt,
    runAt: scheduledAt,
    inputDigest: `digest-${id}`,
    normalizationVersion: TOP_STORIES_NORMALIZATION_VERSION,
    normalizationDigest: 'a'.repeat(63) + String(id.length % 10),
    completenessState: 'COMPLETE',
    analyticalEligibility: 'ELIGIBLE',
    sourceHealth: { ok: true, complete: true },
    rankedCount,
    displayDepth: 10,
    displayedCount,
    displayed: Array.from({ length: displayedCount }, (_, index) => ({
      id: `${id}-${index}`,
      canonicalId: `${id}-${index}`,
      title: `Story ${id} ${index}`,
      source: 'Reuters',
    })),
    candidateEvidence: [],
    candidateBuildTrace: [
      { buildDisposition: 'PROMOTED_TO_CANDIDATE', reasonCode: 'candidate_created' },
      { buildDisposition: 'COLLAPSED_AS_DUPLICATE', reasonCode: 'duplicate_identity' },
    ],
    selectionTrace,
    funnel: funnel(20, 19, 8, rankedCount, displayedCount),
    studyId: STUDY,
    workflowRunId: id,
    workflowRunAttempt: 1,
    ...CONFIG,
  };
}

function record(options) {
  const snapshot = observation(options);
  return {
    directory: `/artifact/${options.id}`,
    schemaValid: true,
    status: 'VALID_SNAPSHOT',
    snapshot,
    operational: {
      studyId: STUDY,
      scheduledAt: snapshot.scheduledAt,
      runAt: snapshot.runAt,
      nominalSlotKey: snapshot.scheduledAt,
      scheduleDelaySeconds: 0,
    },
  };
}

function normalizedCoverage() {
  return {
    totalCanonicalObservations: 92,
    validNormalizationEvidenceCount: 92,
    normalizationVersionMissingCount: 0,
    normalizationVersionUnsupportedCount: 0,
    normalizationVersionMismatchCount: 0,
    normalizationDigestMissingCount: 0,
    normalizationDigestInvalidCount: 0,
    complete: true,
  };
}

function operationalInputs(railAndFunnel) {
  const date = '2026-07-17';
  const normalization = normalizedCoverage();
  const report = {
    schemaVersion: 'nw-top-stories-daily-stability-report/v1',
    studyId: STUDY,
    date,
    status: 'OBSERVED',
    coverage: {
      scheduledRuns: 96,
      scheduledSlots: 96,
      startedRuns: 92,
      scheduleSlotCoverage: 0.9583333333,
      successfulRuns: 92,
      completeRuns: 91,
      analyticallyEligibleRuns: 90,
      failureRuns: 0,
      failedInputRuns: 0,
      invalidArtifacts: 0,
      unassignedInvalidArtifacts: 0,
      valid15mPairs: 88,
      canonical15mPairs: 43,
      valid60mPairs: 80,
      canonical60mPairs: 20,
      scheduleDelaySeconds: { p90: 240 },
      normalizationEvidence: normalization,
    },
    normalizationEvidenceCoverage: normalization,
    versionSegments: [SEGMENT],
    segmentSummaries: [{
      segmentKey: SEGMENT,
      observationCount: 92,
      validNormalizationEvidenceCount: 92,
      eligibleComparisonCounts: { fifteenMinute: 88, sixtyMinute: 80 },
      headlineKpiEligible: true,
    }],
    headlineKpiEligibility: { eligible: true, reasonCodes: [] },
    stability: {
      fifteenMinute: { overlapping: { calm: { incumbentRetention: { median: 0.92 } } } },
      sixtyMinute: { overlapping: { calm: { incumbentRetention: { median: 0.84 } } } },
    },
    railAndFunnel,
  };
  const downloaded = Array.from({ length: 92 }, (_, index) => ({
    runId: String(index + 1),
    runAttempt: 1,
    artifactName: `top-stories-shadow-${STUDY}-20260717T${String(index).padStart(4, '0')}Z-x`,
  }));
  return {
    dailyReport: report,
    aggregationManifest: {
      schemaVersion: 'nw-top-stories-shadow-aggregation-manifest/v1',
      studyId: STUDY,
      date,
    },
    downloadManifest: {
      schemaVersion: 'nw-top-stories-shadow-download-manifest/v1',
      studyId: STUDY,
      date,
      downloaded,
      excludedRuns: [],
    },
    studyConfig: CONFIG,
    integrity: { ok: true, errors: [] },
  };
}

describe('Top Stories rail and funnel analytics', () => {
  it('reports exact visible-rail collapse buckets and population-unit funnels', () => {
    const observations = [
      observation({ id: 'a', scheduledAt: '2026-07-17T00:07:00Z', displayedCount: 2 }),
      observation({ id: 'b', scheduledAt: '2026-07-17T00:22:00Z', displayedCount: 3 }),
      observation({ id: 'c', scheduledAt: '2026-07-17T00:37:00Z', displayedCount: 6 }),
      observation({ id: 'd', scheduledAt: '2026-07-17T00:52:00Z', displayedCount: 9 }),
      observation({ id: 'e', scheduledAt: '2026-07-17T01:07:00Z', displayedCount: 10, rankedCount: 14 }),
    ];
    const result = buildTopStoriesRailFunnelAnalytics(observations);
    expect(result.railBuckets).toMatchObject({ '1-3': 2, '4-7': 1, '8-9': 1, '10': 1 });
    expect(result.belowSoftReviewDepth.count).toBe(3);
    expect(result.underfilledAgainstDisplayDepth.count).toBe(4);
    expect(result.displayedCount.minimum).toBe(2);
    expect(result.rankedCount.maximum).toBe(14);
    const buildStage = result.funnelStages.find(row => row.stage === 'candidate_build');
    expect(buildStage.inputUnit).toBe('SOURCE_ROW');
    expect(buildStage.outputUnit).toBe('RANKING_CANDIDATE');
    expect(buildStage.reasonCounts.duplicate_identity).toBe(5);
  });

  it('keeps context observations out of target-day rail analytics', () => {
    const records = [
      record({ id: 'context', scheduledAt: '2026-07-16T23:52:00Z', displayedCount: 1 }),
      record({ id: 'target-a', scheduledAt: '2026-07-17T00:07:00Z', displayedCount: 2 }),
      record({ id: 'target-b', scheduledAt: '2026-07-17T00:22:00Z', displayedCount: 10 }),
    ];
    const options = { date: '2026-07-17', studyConfig: CONFIG };
    const first = aggregateTopStoriesDailyEvidence(records, options).report;
    const second = aggregateTopStoriesDailyEvidence(records, options).report;
    expect(first.railAndFunnel.observationCount).toBe(2);
    expect(first.railAndFunnel.railBuckets['1-3']).toBe(1);
    expect(first.railAndFunnel.railBuckets['10']).toBe(1);
    expect(first.headlineKpiEligibility.eligible).toBe(true);
    expect(second).toEqual(first);
    expect(renderTopStoriesDailyMarkdown(first)).toContain('Visible rail and funnel');
  });

  it('does not allow rail/funnel analytics to alter the technical verdict', () => {
    const sparse = buildTopStoriesRailFunnelAnalytics([
      observation({ id: 'sparse', scheduledAt: '2026-07-17T00:07:00Z', displayedCount: 2 }),
    ]);
    const full = buildTopStoriesRailFunnelAnalytics([
      observation({ id: 'full', scheduledAt: '2026-07-17T00:07:00Z', displayedCount: 10 }),
    ]);
    const sparseDecision = validateTopStoriesOperationalDay(operationalInputs(sparse));
    const fullDecision = validateTopStoriesOperationalDay(operationalInputs(full));
    expect(sparseDecision.decision).toBe('PASS');
    expect(fullDecision.decision).toBe('PASS');
    expect(sparseDecision.checks).toEqual(fullDecision.checks);
  });
});
