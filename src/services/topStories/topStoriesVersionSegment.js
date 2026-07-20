export const TOP_STORIES_NORMALIZATION_VERSION =
  'nw-top-stories-normalization-v1';

export const TOP_STORIES_VERSION_SEGMENT_FIELDS = Object.freeze([
  'studyId',
  'rankerVersion',
  'identityVersion',
  'periodClassifierVersion',
  'normalizationVersion',
]);

export const TOP_STORIES_NORMALIZATION_REASON_CODES = Object.freeze({
  versionMissing: 'normalization_version_missing',
  versionUnsupported: 'normalization_version_unsupported',
  versionMismatch: 'normalization_version_mismatch',
  digestMissing: 'normalization_digest_missing',
  digestInvalid: 'normalization_digest_invalid',
  versionBoundary: 'normalization_version_boundary',
});

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

export function normalizeTopStoriesNormalizationDigest(value) {
  const digest = nonEmptyString(value);
  return digest && SHA256_PATTERN.test(digest) ? digest.toLowerCase() : null;
}

export function validateTopStoriesNormalizationEvidence(
  observation = {},
  { expectedNormalizationVersion } = {},
) {
  const normalizationVersion = nonEmptyString(observation.normalizationVersion);
  const rawDigest = nonEmptyString(observation.normalizationDigest);
  const reasonCodes = [];

  if (!normalizationVersion) {
    reasonCodes.push(TOP_STORIES_NORMALIZATION_REASON_CODES.versionMissing);
  } else if (normalizationVersion !== TOP_STORIES_NORMALIZATION_VERSION) {
    reasonCodes.push(TOP_STORIES_NORMALIZATION_REASON_CODES.versionUnsupported);
  } else if (expectedNormalizationVersion &&
    normalizationVersion !== expectedNormalizationVersion) {
    reasonCodes.push(TOP_STORIES_NORMALIZATION_REASON_CODES.versionMismatch);
  }

  if (!rawDigest) {
    reasonCodes.push(TOP_STORIES_NORMALIZATION_REASON_CODES.digestMissing);
  } else if (!SHA256_PATTERN.test(rawDigest)) {
    reasonCodes.push(TOP_STORIES_NORMALIZATION_REASON_CODES.digestInvalid);
  }

  return Object.freeze({
    eligible: reasonCodes.length === 0,
    normalizationVersion,
    normalizationDigest: normalizeTopStoriesNormalizationDigest(rawDigest),
    reasonCodes: Object.freeze(reasonCodes),
  });
}

export function buildTopStoriesVersionSegmentRecord(source = {}) {
  return Object.freeze(Object.fromEntries(
    TOP_STORIES_VERSION_SEGMENT_FIELDS.map(field => [field, nonEmptyString(source[field])]),
  ));
}

export function buildTopStoriesVersionSegmentKey(source = {}) {
  const segment = buildTopStoriesVersionSegmentRecord(source);
  const values = TOP_STORIES_VERSION_SEGMENT_FIELDS.map(field => segment[field]);
  return values.every(Boolean) ? values.join('|') : null;
}

export function validateTopStoriesExpectedVersions(observation = {}, expected = {}) {
  const reasons = [];
  const checks = [
    ['studyId', 'study_id_mismatch'],
    ['rankerVersion', 'ranker_version_mismatch'],
    ['identityVersion', 'identity_version_mismatch'],
    ['periodClassifierVersion', 'period_classifier_version_mismatch'],
  ];
  checks.forEach(([field, reason]) => {
    if (expected[field] && observation[field] !== expected[field]) reasons.push(reason);
  });
  const normalization = validateTopStoriesNormalizationEvidence(observation, {
    expectedNormalizationVersion: expected.normalizationVersion,
  });
  return Object.freeze({
    eligible: reasons.length === 0 && normalization.eligible,
    reasonCodes: Object.freeze(uniqueSorted([...reasons, ...normalization.reasonCodes])),
    normalization,
  });
}

export function compareTopStoriesVersionSegments(left = {}, right = {}, expected = {}) {
  const leftValidation = validateTopStoriesExpectedVersions(left, expected);
  const rightValidation = validateTopStoriesExpectedVersions(right, expected);
  const reasons = [...leftValidation.reasonCodes, ...rightValidation.reasonCodes];
  const leftKey = buildTopStoriesVersionSegmentKey(left);
  const rightKey = buildTopStoriesVersionSegmentKey(right);

  if (left.normalizationVersion && right.normalizationVersion &&
    left.normalizationVersion !== right.normalizationVersion) {
    reasons.push(TOP_STORIES_NORMALIZATION_REASON_CODES.versionBoundary);
  } else if (leftKey && rightKey && leftKey !== rightKey) {
    reasons.push('version_segment_boundary');
  }

  return Object.freeze({
    compatible: reasons.length === 0 && leftKey === rightKey,
    leftKey,
    rightKey,
    reasonCodes: Object.freeze(uniqueSorted(reasons)),
    leftValidation,
    rightValidation,
  });
}

export function summarizeTopStoriesNormalizationEvidence(
  observations = [],
  expectedNormalizationVersion,
) {
  const counts = {
    totalCanonicalObservations: observations.length,
    validNormalizationEvidenceCount: 0,
    normalizationVersionMissingCount: 0,
    normalizationVersionUnsupportedCount: 0,
    normalizationVersionMismatchCount: 0,
    normalizationDigestMissingCount: 0,
    normalizationDigestInvalidCount: 0,
  };
  observations.forEach(observation => {
    const result = validateTopStoriesNormalizationEvidence(observation, {
      expectedNormalizationVersion,
    });
    if (result.eligible) counts.validNormalizationEvidenceCount += 1;
    result.reasonCodes.forEach(reason => {
      const field = {
        normalization_version_missing: 'normalizationVersionMissingCount',
        normalization_version_unsupported: 'normalizationVersionUnsupportedCount',
        normalization_version_mismatch: 'normalizationVersionMismatchCount',
        normalization_digest_missing: 'normalizationDigestMissingCount',
        normalization_digest_invalid: 'normalizationDigestInvalidCount',
      }[reason];
      if (field) counts[field] += 1;
    });
  });
  return Object.freeze({
    ...counts,
    complete: counts.validNormalizationEvidenceCount === observations.length,
  });
}

export function buildTopStoriesVersionSegmentSummaries(
  observations = [],
  comparisons = {},
  expected = {},
) {
  const byKey = new Map();
  observations.forEach(observation => {
    const key = buildTopStoriesVersionSegmentKey(observation);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(observation);
  });
  const expectedKey = buildTopStoriesVersionSegmentKey(expected);
  return [...byKey.entries()].map(([segmentKey, rows]) => {
    const validCount = rows.filter(row => validateTopStoriesNormalizationEvidence(row, {
      expectedNormalizationVersion: expected.normalizationVersion,
    }).eligible).length;
    const count = group => (comparisons[group] || []).filter(row =>
      row.segmentKey === segmentKey && row.eligibleForHeadlineKpi).length;
    return Object.freeze({
      segmentKey,
      observationCount: rows.length,
      validNormalizationEvidenceCount: validCount,
      eligibleComparisonCounts: Object.freeze({
        fifteenMinute: count('fifteenMinute'),
        sixtyMinute: count('sixtyMinute'),
      }),
      headlineKpiEligible: segmentKey === expectedKey && validCount === rows.length,
    });
  }).sort((left, right) => String(left.segmentKey).localeCompare(String(right.segmentKey)));
}

export function getTopStoriesNormalizationHeadlineEligibility(
  coverage = {},
  segmentSummaries = [],
  expected = {},
) {
  const fields = {
    normalizationVersionMissingCount: 'normalization_version_missing',
    normalizationVersionUnsupportedCount: 'normalization_version_unsupported',
    normalizationVersionMismatchCount: 'normalization_version_mismatch',
    normalizationDigestMissingCount: 'normalization_digest_missing',
    normalizationDigestInvalidCount: 'normalization_digest_invalid',
  };
  const reasons = [];
  Object.entries(fields).forEach(([field, reason]) => {
    if (coverage[field] > 0) reasons.push(reason);
  });
  const keys = segmentSummaries.map(row => row.segmentKey).filter(Boolean);
  if (keys.length > 1) reasons.push(TOP_STORIES_NORMALIZATION_REASON_CODES.versionBoundary);
  const expectedKey = buildTopStoriesVersionSegmentKey(expected);
  if (keys.length === 1 && keys[0] !== expectedKey) {
    reasons.push(TOP_STORIES_NORMALIZATION_REASON_CODES.versionMismatch);
  }
  const reasonCodes = uniqueSorted(reasons);
  return Object.freeze({
    eligible: coverage.totalCanonicalObservations > 0 && reasonCodes.length === 0 &&
      segmentSummaries.length === 1 && segmentSummaries[0].headlineKpiEligible,
    reasonCodes: Object.freeze(reasonCodes),
  });
}
