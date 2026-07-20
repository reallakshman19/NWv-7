import { digestCanonicalJson, stableJson } from './canonicalJson.mjs';
import {
  buildTopStoriesComparisonId,
  getTopStoriesComparisonRecords,
  summarizeTopStoriesComparisons,
  summarizeTopStoriesInputChange,
  TOP_STORIES_COMPARISON_EVIDENCE_SCHEMA,
  TOP_STORIES_COMPARISON_HORIZONS,
} from './comparisonEvidence.mjs';
import { TOP_STORIES_INPUT_CHANGE_INTERPRETATION } from './inputChangeAnalytics.mjs';

export const TOP_STORIES_COMPARISON_EVIDENCE_REASONS = Object.freeze({
  missing: 'comparison_evidence_missing',
  unsupported: 'comparison_evidence_schema_unsupported',
  invalid: 'comparison_evidence_invalid',
  summaryMismatch: 'comparison_evidence_summary_mismatch',
  identityDuplicate: 'comparison_identity_duplicate',
  ownerMismatch: 'comparison_owner_date_mismatch',
  canonicalUnknown: 'canonical_comparison_reference_unknown',
  canonicalOverlap: 'canonical_comparison_overlap',
  observationReuse: 'canonical_observation_reuse',
  duplicateAcrossDays: 'canonical_comparison_duplicate_across_days',
  segmentIncompatible: 'canonical_segment_incompatible',
});

const HORIZONS = Object.keys(TOP_STORIES_COMPARISON_HORIZONS);
const METRIC_KEYS = Object.freeze([
  'incumbentRetention', 'newListContinuity', 'jaccard', 'numberOneContinuity',
  'normalizedWeightedRankDisplacement', 'countDelta', 'entrantCount', 'exitCount',
]);
function uniqueSorted(values = []) {
  return [...new Set(values.filter(Boolean))].sort();
}

function same(left, right) {
  return stableJson(left) === stableJson(right);
}

function utcDate(value) {
  const time = Date.parse(value || 0);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
}

function validMetricValue(key, value) {
  if (value === null) return true;
  if (key === 'numberOneContinuity') return typeof value === 'boolean';
  return Number.isFinite(value);
}

function recordSort(left, right) {
  return HORIZONS.indexOf(left.horizon) - HORIZONS.indexOf(right.horizon) ||
    left.anchorAt - right.anchorAt || left.currentAt - right.currentAt ||
    String(left.comparisonId).localeCompare(String(right.comparisonId));
}

function validateRecord(record, report, seenIds, reasons) {
  const expectedHorizon = TOP_STORIES_COMPARISON_HORIZONS[record?.horizon];
  if (!record?.comparisonId || seenIds.has(record.comparisonId)) {
    reasons.push(TOP_STORIES_COMPARISON_EVIDENCE_REASONS.identityDuplicate);
  }
  seenIds.add(record?.comparisonId);
  const expectedId = buildTopStoriesComparisonId({ studyId: report?.studyId, ...record });
  const anchorAt = Number(record?.anchorAt);
  const currentAt = Number(record?.currentAt);
  const intervalMs = currentAt - anchorAt;
  const shapeValid = expectedHorizon && record?.anchorObservationId &&
    record?.currentObservationId && Number.isFinite(anchorAt) && Number.isFinite(currentAt) &&
    currentAt > anchorAt && record?.targetHorizonMs === expectedHorizon &&
    record?.intervalMs === intervalMs &&
    record?.intervalErrorMs === Math.abs(intervalMs - expectedHorizon) &&
    record?.ownerDate === utcDate(record?.anchorScheduledAt) &&
    Number.isFinite(Date.parse(record?.currentScheduledAt || 0)) &&
    record?.ownerDate === report?.date && record?.segmentKey &&
    ['calm', 'active', 'uncertain'].includes(record?.periodClass) &&
    ['unchanged', 'changed', 'unknown'].includes(record?.inputClass) &&
    typeof record?.eligibleForHeadlineKpi === 'boolean' &&
    Array.isArray(record?.comparisonEligibilityReasons) &&
    same(record.comparisonEligibilityReasons, uniqueSorted(record.comparisonEligibilityReasons)) &&
    METRIC_KEYS.every(key => validMetricValue(key, record?.metrics?.[key]));
  if (record?.comparisonId !== expectedId || !shapeValid) {
    reasons.push(record?.ownerDate !== utcDate(record?.anchorScheduledAt) ||
      record?.ownerDate !== report?.date
      ? TOP_STORIES_COMPARISON_EVIDENCE_REASONS.ownerMismatch
      : TOP_STORIES_COMPARISON_EVIDENCE_REASONS.invalid);
  }
}

function validateCanonical(rows, canonicalIds, expectedSegmentKey, reasons) {
  const byId = new Map(rows.map(row => [row.comparisonId, row]));
  const canonical = [];
  canonicalIds.forEach(id => {
    const record = byId.get(id);
    if (!record) reasons.push(TOP_STORIES_COMPARISON_EVIDENCE_REASONS.canonicalUnknown);
    else canonical.push(record);
  });
  HORIZONS.forEach(horizon => {
    const ordered = canonical.filter(row => row.horizon === horizon)
      .sort((left, right) => left.anchorAt - right.anchorAt || left.currentAt - right.currentAt);
    const occupied = new Set();
    let occupiedUntil = -Infinity;
    ordered.forEach(record => {
      if (record.anchorAt < occupiedUntil) {
        reasons.push(TOP_STORIES_COMPARISON_EVIDENCE_REASONS.canonicalOverlap);
      }
      if (occupied.has(record.anchorObservationId) || occupied.has(record.currentObservationId)) {
        reasons.push(TOP_STORIES_COMPARISON_EVIDENCE_REASONS.observationReuse);
      }
      occupied.add(record.anchorObservationId);
      occupied.add(record.currentObservationId);
      occupiedUntil = Math.max(occupiedUntil, record.currentAt);
      if (expectedSegmentKey && record.segmentKey !== expectedSegmentKey) {
        reasons.push(TOP_STORIES_COMPARISON_EVIDENCE_REASONS.segmentIncompatible);
      }
    });
  });
  return canonical;
}

function expectedStability(evidence, report) {
  return Object.fromEntries(HORIZONS.map(horizon => [horizon, {
    overlapping: summarizeTopStoriesComparisons(
      getTopStoriesComparisonRecords(evidence, horizon, false),
      report?.reviewThresholds?.[horizon],
    ),
    canonicalNonOverlapping: summarizeTopStoriesComparisons(
      getTopStoriesComparisonRecords(evidence, horizon, true),
      report?.reviewThresholds?.[horizon],
    ),
  }]));
}

function expectedInputChange(evidence, report) {
  const summaries = Object.fromEntries(HORIZONS.map(horizon => [horizon, {
    overlapping: summarizeTopStoriesInputChange(
      getTopStoriesComparisonRecords(evidence, horizon, false),
    ),
    canonicalNonOverlapping: summarizeTopStoriesInputChange(
      getTopStoriesComparisonRecords(evidence, horizon, true),
    ),
  }]));
  return report?.inputChange?.interpretation === undefined ? summaries :
    { ...summaries, interpretation: TOP_STORIES_INPUT_CHANGE_INTERPRETATION };
}

function summariesReconcile(report, evidence) {
  const overlap = Object.fromEntries(HORIZONS.map(horizon => [
    horizon,
    getTopStoriesComparisonRecords(evidence, horizon, false),
  ]));
  const canonical = Object.fromEntries(HORIZONS.map(horizon => [
    horizon,
    getTopStoriesComparisonRecords(evidence, horizon, true),
  ]));
  const coverage = report?.coverage || {};
  const countsMatch = coverage.valid15mPairs === overlap.fifteenMinute.length &&
    coverage.valid60mPairs === overlap.sixtyMinute.length &&
    coverage.canonical15mPairs === canonical.fifteenMinute.length &&
    coverage.canonical60mPairs === canonical.sixtyMinute.length;
  const segmentCounts = new Map((report?.segmentSummaries || []).map(row => [
    row.segmentKey,
    row.eligibleComparisonCounts,
  ]));
  const expectedSegments = new Map();
  HORIZONS.forEach(horizon => overlap[horizon].forEach(record => {
    if (!record.eligibleForHeadlineKpi) return;
    if (!expectedSegments.has(record.segmentKey)) {
      expectedSegments.set(record.segmentKey, { fifteenMinute: 0, sixtyMinute: 0 });
    }
    expectedSegments.get(record.segmentKey)[horizon] += 1;
  }));
  const segmentsMatch = [...new Set([...segmentCounts.keys(), ...expectedSegments.keys()])]
    .every(key => same(segmentCounts.get(key) || { fifteenMinute: 0, sixtyMinute: 0 },
      expectedSegments.get(key) || { fifteenMinute: 0, sixtyMinute: 0 }));
  return countsMatch && same(report?.stability, expectedStability(evidence, report)) &&
    same(report?.inputChange, expectedInputChange(evidence, report)) && segmentsMatch;
}

export function validateTopStoriesDailyComparisonEvidence(report = {}, options = {}) {
  const evidence = report?.comparisonEvidence;
  if (!report?.comparisonEvidenceSchemaVersion && !evidence) {
    return { status: 'MISSING_LEGACY', valid: false,
      reasonCodes: [TOP_STORIES_COMPARISON_EVIDENCE_REASONS.missing], canonicalRecords: [] };
  }
  if (report?.comparisonEvidenceSchemaVersion !== TOP_STORIES_COMPARISON_EVIDENCE_SCHEMA ||
    evidence?.schemaVersion !== TOP_STORIES_COMPARISON_EVIDENCE_SCHEMA) {
    return { status: 'INVALID', valid: false,
      reasonCodes: [TOP_STORIES_COMPARISON_EVIDENCE_REASONS.unsupported], canonicalRecords: [] };
  }
  const reasons = [];
  const rows = Array.isArray(evidence.comparisonRecords) ? evidence.comparisonRecords : [];
  const canonicalIds = Array.isArray(evidence.canonicalComparisonIds)
    ? evidence.canonicalComparisonIds : [];
  if (!Array.isArray(evidence.comparisonRecords) || !Array.isArray(evidence.canonicalComparisonIds) ||
    evidence.studyId !== report.studyId || evidence.ownerDate !== report.date ||
    !same(rows, [...rows].sort(recordSort)) ||
    !same(canonicalIds, uniqueSorted(canonicalIds))) {
    reasons.push(TOP_STORIES_COMPARISON_EVIDENCE_REASONS.invalid);
  }
  const seenIds = new Set();
  rows.forEach(record => validateRecord(record, report, seenIds, reasons));
  const canonicalRecords = validateCanonical(
    rows, canonicalIds, options.expectedSegmentKey, reasons,
  );
  const fifteenCount = rows.filter(row => row.horizon === 'fifteenMinute').length;
  const sixtyCount = rows.filter(row => row.horizon === 'sixtyMinute').length;
  const canonical15 = canonicalRecords.filter(row => row.horizon === 'fifteenMinute').length;
  const canonical60 = canonicalRecords.filter(row => row.horizon === 'sixtyMinute').length;
  if (evidence?.horizonCounts?.fifteenMinute?.overlapping !== fifteenCount ||
    evidence?.horizonCounts?.sixtyMinute?.overlapping !== sixtyCount ||
    evidence?.horizonCounts?.fifteenMinute?.canonicalNonOverlapping !== canonical15 ||
    evidence?.horizonCounts?.sixtyMinute?.canonicalNonOverlapping !== canonical60 ||
    evidence.accountingDelta !== 0 || evidence.accountingConserved !== true ||
    evidence.crossHorizonPooled !== false) {
    reasons.push(TOP_STORIES_COMPARISON_EVIDENCE_REASONS.invalid);
  }
  if (options.reconcile !== false && !summariesReconcile(report, evidence)) {
    reasons.push(TOP_STORIES_COMPARISON_EVIDENCE_REASONS.summaryMismatch);
  }
  const reasonCodes = uniqueSorted(reasons);
  return { status: reasonCodes.length ? 'INVALID' : 'VALID', valid: reasonCodes.length === 0,
    reasonCodes, canonicalRecords };
}

export function validateTopStoriesPilotComparisonEvidence(days = [], options = {}) {
  const reasons = [];
  const recordsByHorizon = { fifteenMinute: [], sixtyMinute: [] };
  const perDay = new Map();
  const seenIds = new Set();
  const seenPairs = new Set();
  days.forEach(day => {
    if (!day.dailyReport) {
      perDay.set(day.date, { status: 'NOT_REPRESENTED', valid: false,
        reasonCodes: [], canonicalRecords: [] });
      return;
    }
    const result = validateTopStoriesDailyComparisonEvidence(day.dailyReport, {
      expectedSegmentKey: options.expectedSegmentKey,
    });
    perDay.set(day.date, result);
    if (!result.valid) reasons.push(...result.reasonCodes);
    result.canonicalRecords.forEach(record => {
      if (seenIds.has(record.comparisonId)) {
        reasons.push(TOP_STORIES_COMPARISON_EVIDENCE_REASONS.duplicateAcrossDays);
      }
      seenIds.add(record.comparisonId);
      const key = `${record.horizon}|${record.anchorObservationId}|${record.currentObservationId}`;
      if (seenPairs.has(key)) reasons.push(TOP_STORIES_COMPARISON_EVIDENCE_REASONS.duplicateAcrossDays);
      seenPairs.add(key);
      recordsByHorizon[record.horizon]?.push({ ...record, date: day.date });
    });
  });
  HORIZONS.forEach(horizon => {
    const ordered = recordsByHorizon[horizon].sort((left, right) =>
      left.anchorAt - right.anchorAt || left.currentAt - right.currentAt ||
      left.comparisonId.localeCompare(right.comparisonId));
    const occupied = new Set();
    let occupiedUntil = -Infinity;
    ordered.forEach(record => {
      if (record.anchorAt < occupiedUntil) reasons.push(
        TOP_STORIES_COMPARISON_EVIDENCE_REASONS.canonicalOverlap);
      if (occupied.has(record.anchorObservationId) || occupied.has(record.currentObservationId)) {
        reasons.push(TOP_STORIES_COMPARISON_EVIDENCE_REASONS.observationReuse);
      }
      occupied.add(record.anchorObservationId);
      occupied.add(record.currentObservationId);
      occupiedUntil = Math.max(occupiedUntil, record.currentAt);
      if (record.ownerDate !== record.date) reasons.push(
        TOP_STORIES_COMPARISON_EVIDENCE_REASONS.ownerMismatch);
      if (options.expectedSegmentKey && record.segmentKey !== options.expectedSegmentKey) {
        reasons.push(TOP_STORIES_COMPARISON_EVIDENCE_REASONS.segmentIncompatible);
      }
    });
  });
  const usableDates = new Set(days.filter(day => day.usable).map(day => day.date));
  const summarize = horizon => {
    const rows = recordsByHorizon[horizon];
    const ids = rows.map(row => row.comparisonId).sort();
    return {
      comparisonCount: rows.length,
      usableDayCount: new Set(rows.filter(row => usableDates.has(row.date)).map(row => row.date)).size,
      comparisonIdsDigest: digestCanonicalJson(ids),
    };
  };
  const reasonCodes = uniqueSorted(reasons);
  return {
    valid: reasonCodes.length === 0,
    reasonCodes,
    recordsByHorizon,
    perDay,
    decisionEvidence: {
      schemaVersion: TOP_STORIES_COMPARISON_EVIDENCE_SCHEMA,
      fifteenMinute: summarize('fifteenMinute'),
      sixtyMinute: summarize('sixtyMinute'),
      crossHorizonPooled: false,
      accountingConserved: reasonCodes.length === 0,
    },
  };
}
