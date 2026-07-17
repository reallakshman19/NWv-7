import { describe, expect, it } from 'vitest';
import { buildTopStoriesPilotRollup } from '../../../scripts/top-stories-shadow/pilotRollup.mjs';
import { renderTopStoriesPilotRollupMarkdown } from '../../../scripts/top-stories-shadow/pilotRollupMarkdown.mjs';

const STUDY = 'nw-rank-011-shadow-pilot-2026-07';
const CONFIG = Object.freeze({
  schemaVersion: 'nw-top-stories-shadow-study/v1',
  studyId: STUDY,
  rankerVersion: 'nw-top-stories-ranker-observed-v1',
  identityVersion: 'nw-top-stories-identity-v1',
  periodClassifierVersion: 'nw-top-stories-period-classifier-v1',
});
const SEGMENT = [
  CONFIG.studyId,
  CONFIG.rankerVersion,
  CONFIG.identityVersion,
  CONFIG.periodClassifierVersion,
].join('|');

function metric(count, median) {
  return { count, median, p10: median, p25: median, p75: median, p90: median };
}

function dayReport(date, options = {}) {
  const displayedMedian = options.displayedMedian ?? 9;
  const observations = options.observations ?? 90;
  const belowEightFraction = options.belowEightFraction ?? 0.1;
  const severeFraction = options.severeFraction ?? 0.05;
  const calm15Median = options.calm15Median ?? 0.94;
  const calm60Median = options.calm60Median ?? 0.86;
  const calm15Pairs = options.calm15Pairs ?? 6;
  const calm60Pairs = options.calm60Pairs ?? 3;
  const activePairs = options.activePairs ?? 1;
  return {
    schemaVersion: 'nw-top-stories-daily-stability-report/v1',
    studyId: STUDY,
    date,
    status: 'OBSERVED',
    coverage: {
      scheduleSlotCoverage: 0.95,
      unchangedInput15mPairs: 20,
      valid15mPairs: 85,
      unchangedInput60mPairs: 15,
      valid60mPairs: 75,
    },
    versionSegments: options.versionSegments || [SEGMENT],
    stability: {
      fifteenMinute: {
        canonicalNonOverlapping: {
          calm: { incumbentRetention: metric(calm15Pairs, calm15Median) },
          active: { incumbentRetention: metric(activePairs, 0.6) },
        },
        overlapping: {
          active: { incumbentRetention: metric(activePairs, 0.6) },
        },
      },
      sixtyMinute: {
        canonicalNonOverlapping: {
          calm: { incumbentRetention: metric(calm60Pairs, calm60Median) },
          active: { incumbentRetention: metric(0, null) },
        },
        overlapping: { active: { incumbentRetention: metric(0, null) } },
      },
    },
    residence: { episodeCount: 20, leftCensoredCount: 3, rightCensoredCount: 4 },
    railAndFunnel: {
      observationCount: observations,
      displayedCount: { median: displayedMedian },
      belowSoftReviewDepth: {
        count: Math.round(observations * belowEightFraction),
        fraction: belowEightFraction,
      },
      railBuckets: {
        '0': 0,
        '1-3': Math.round(observations * severeFraction),
        '4-7': Math.round(observations * Math.max(0, belowEightFraction - severeFraction)),
        '8-9': Math.round(observations * 0.4),
        '10': Math.round(observations * 0.5),
        other: 0,
      },
      finalReasonCounts: options.finalReasonCounts || {
        unqualified_without_independent_evidence: 20,
        max_per_source: 5,
      },
      candidateBuildReasonCounts: { duplicate_identity: 3, candidate_created: 90 },
    },
  };
}

function validation(date, decision = 'PASS') {
  return {
    schemaVersion: 'nw-top-stories-24h-operational-validation/v1',
    studyId: STUDY,
    date,
    decision,
    failureReasonCodes: decision === 'FAIL' ? ['input_integrity_failure'] : [],
    insufficiencyReasonCodes: decision === 'INSUFFICIENT' ? ['fewer_than_required_pairs'] : [],
  };
}

function entries(options = {}) {
  return Array.from({ length: options.days ?? 7 }, (_, index) => {
    const date = `2026-07-${String(17 + index).padStart(2, '0')}`;
    return {
      sourceId: `source-${index}`,
      dailyReport: dayReport(date, options),
      operationalValidation: validation(date, options.decision || 'PASS'),
    };
  });
}

function rollup(options = {}, input = entries(options)) {
  return buildTopStoriesPilotRollup(input, { studyConfig: CONFIG });
}

describe('Top Stories seven-day pilot rollup', () => {
  it('remains insufficient before the full evidence contract is met', () => {
    const result = rollup({ days: 3 }, entries({ days: 3 }));
    expect(result.decision).toBe('INSUFFICIENT');
    expect(result.evidenceSufficient).toBe(false);
    expect(result.insufficiencyReasonCodes).toContain('fewer_than_seven_days');
    expect(result.productionChangeAuthorized).toBe(false);
  });

  it('fails closed for technical and version-invalid days', () => {
    const input = entries();
    input[2] = {
      ...input[2],
      operationalValidation: validation(input[2].dailyReport.date, 'FAIL'),
    };
    const failed = rollup({}, input);
    expect(failed.decision).toBe('TECHNICAL_REMEDIATION');
    expect(failed.technicalFailureReasonCodes).toContain('input_integrity_failure');

    const invalidInput = entries();
    invalidInput[1].dailyReport.versionSegments = [`${SEGMENT}-changed`];
    const invalid = rollup({}, invalidInput);
    expect(invalid.decision).toBe('TECHNICAL_REMEDIATION');
    expect(invalid.technicalFailureReasonCodes).toContain('version_segment_mismatch');
  });

  it('recommends recall repair for chronic underfill with stable rankings', () => {
    const result = rollup({
      displayedMedian: 6,
      belowEightFraction: 0.5,
      severeFraction: 0.2,
      calm15Median: 0.95,
      calm60Median: 0.88,
      activePairs: 1,
    });
    expect(result.decision).toBe('REPAIR_RECALL');
    expect(result.metrics.belowEightFraction).toBeGreaterThan(0.25);
  });

  it('recommends persistence only when useful depth and active evidence exist', () => {
    const result = rollup({
      displayedMedian: 9,
      belowEightFraction: 0.1,
      severeFraction: 0.03,
      calm15Median: 0.75,
      calm60Median: 0.65,
      activePairs: 1,
    });
    expect(result.activeEvidenceSufficient).toBe(true);
    expect(result.decision).toBe('ADD_PERSISTENCE');
  });

  it('recommends recall then persistence when both defects are evidenced', () => {
    const result = rollup({
      displayedMedian: 5,
      belowEightFraction: 0.6,
      severeFraction: 0.25,
      calm15Median: 0.7,
      calm60Median: 0.6,
      activePairs: 1,
    });
    expect(result.decision).toBe('REPAIR_RECALL_THEN_PERSISTENCE');
  });

  it('retains policy only with sufficient depth, calm stability and active evidence', () => {
    const result = rollup({
      displayedMedian: 9,
      belowEightFraction: 0.1,
      severeFraction: 0.02,
      calm15Median: 0.95,
      calm60Median: 0.86,
      activePairs: 1,
    });
    expect(result.decision).toBe('RETAIN_POLICY');
    expect(result.evidenceSufficient).toBe(true);
  });

  it('continues observation when active responsiveness is not represented', () => {
    const result = rollup({
      displayedMedian: 9,
      belowEightFraction: 0.1,
      severeFraction: 0.02,
      calm15Median: 0.95,
      calm60Median: 0.86,
      activePairs: 0,
    });
    expect(result.decision).toBe('CONTINUE_OBSERVATION');
    expect(result.activeEvidenceSufficient).toBe(false);
  });

  it('resolves duplicate dates deterministically and renders an expert pack', () => {
    const input = entries();
    input.push({
      sourceId: 'zzz-duplicate',
      dailyReport: input[0].dailyReport,
      operationalValidation: validation(input[0].dailyReport.date, 'PASS_WITH_WARNINGS'),
    });
    const first = rollup({}, input);
    const second = rollup({}, [...input].reverse());
    expect(first).toEqual(second);
    expect(first.dayCounts.supplied).toBe(7);
    expect(first.supersededInputs).toHaveLength(1);
    const markdown = renderTopStoriesPilotRollupMarkdown(first);
    expect(markdown).toContain('seven-day pilot decision pack');
    expect(markdown).toContain('Production change authorized: **no**');
  });
});
