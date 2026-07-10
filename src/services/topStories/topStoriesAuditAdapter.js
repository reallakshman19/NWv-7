import {
  buildTopStoriesAuditSnapshot,
  buildTopStoriesGoldenReviewSnapshot,
  compareTopStoriesAuditSnapshots,
  summarizeTopStoriesAuditSnapshot,
} from './topStoriesAuditHarness.js';

const SHADOW_AUDIT_MODE = 'shadow-audit';

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function stableValue(value) {
  if (value === undefined || typeof value === 'function') return undefined;
  if (Array.isArray(value)) return value.map(stableValue).filter(item => item !== undefined);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, stableValue(value[key])])
    .filter(([, item]) => item !== undefined));
}

function generatedAt(options = {}, actual = {}, expected = {}) {
  return options.generatedAt ?? actual.fixtureTimestamp ?? expected.fixtureTimestamp ?? null;
}

function buildPayloadSummary(actual = {}, expected = {}, comparison = {}) {
  return {
    ok: Boolean(comparison.ok),
    mode: SHADOW_AUDIT_MODE,
    actualFixtureVersion: actual.fixtureVersion || null,
    expectedFixtureVersion: expected.fixtureVersion || null,
    rankedCount: Array.isArray(actual.rankedIdsInOrder) ? actual.rankedIdsInOrder.length : 0,
    expectedRankedCount: Array.isArray(expected.rankedIdsInOrder) ? expected.rankedIdsInOrder.length : 0,
    rankedIdsInOrder: actual.rankedIdsInOrder || [],
    topFeedBoostedIds: actual.topFeedBoostedIds || [],
    penalizedIds: actual.penalizedIds || [],
    rejectedExpiredIds: actual.rejectedExpiredIds || [],
    errors: comparison.errors || [],
    warnings: comparison.warnings || [],
  };
}

export function getTopStoriesAuditPayload(options = {}) {
  const actual = buildTopStoriesAuditSnapshot(options.input, options.snapshotOptions || {});
  return {
    ok: true,
    generatedAt: generatedAt(options, actual),
    mode: SHADOW_AUDIT_MODE,
    actual,
    summary: {
      ...summarizeTopStoriesAuditSnapshot(actual),
      mode: SHADOW_AUDIT_MODE,
      rankedCount: Array.isArray(actual.rankedIdsInOrder) ? actual.rankedIdsInOrder.length : 0,
    },
  };
}

export function getTopStoriesGoldenAuditPayload(options = {}) {
  const expected = buildTopStoriesGoldenReviewSnapshot();
  return {
    ok: true,
    generatedAt: generatedAt(options, {}, expected),
    mode: SHADOW_AUDIT_MODE,
    expected,
    summary: {
      ...summarizeTopStoriesAuditSnapshot(expected),
      mode: SHADOW_AUDIT_MODE,
      rankedCount: Array.isArray(expected.rankedIdsInOrder) ? expected.rankedIdsInOrder.length : 0,
    },
  };
}

export function getTopStoriesAuditComparisonPayload(options = {}) {
  const actual = options.actual || buildTopStoriesAuditSnapshot(options.input, options.snapshotOptions || {});
  const expected = options.expected || buildTopStoriesGoldenReviewSnapshot();
  const comparison = compareTopStoriesAuditSnapshots(actual, expected);
  return {
    ok: comparison.ok,
    generatedAt: generatedAt(options, actual, expected),
    mode: SHADOW_AUDIT_MODE,
    actual,
    expected,
    comparison,
    summary: buildPayloadSummary(actual, expected, comparison),
  };
}

export function serializeTopStoriesAuditPayload(payload = {}) {
  return JSON.stringify(stableValue(payload), null, 2);
}
