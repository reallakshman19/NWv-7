import {
  canonicalizeJson,
  digestCanonicalJson,
} from './canonicalJson.mjs';

export const TOP_STORIES_NORMALIZATION_VERSION =
  'nw-top-stories-normalization-v1';

export const NORMALIZATION_OMIT_KEYS = Object.freeze([
  '_candidateSeenAt',
  '_studyIdentity',
  '_topStoryRank',
  'apikey',
  'authorization',
  'body',
  'content',
  'cookie',
  'durationMs',
  'fetchDurationMs',
  'html',
  'password',
  'personalisation',
  'personalization',
  'readstate',
  'requestId',
  'runAt',
  'sectionFetchDurationMs',
  'secret',
  'snapshotElapsedMs',
  'token',
  'traceId',
  'userid',
  'viewed',
]);

const NORMALIZATION_OMIT_KEY_SET = new Set(
  NORMALIZATION_OMIT_KEYS.map(key => key.toLowerCase()),
);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stripExcludedNormalizationMetadata(value) {
  if (Array.isArray(value)) {
    return value.map(stripExcludedNormalizationMetadata);
  }
  if (!isPlainObject(value)) return value;
  return Object.entries(value).reduce((result, [key, nested]) => {
    if (NORMALIZATION_OMIT_KEY_SET.has(key.toLowerCase())) return result;
    return {
      ...result,
      [key]: stripExcludedNormalizationMetadata(nested),
    };
  }, {});
}

function increment(counts, key) {
  const normalized = String(key || 'unknown');
  counts[normalized] = (counts[normalized] || 0) + 1;
}

function sortedCounts(rows = [], field) {
  const counts = {};
  rows.forEach(row => increment(counts, row?.[field]));
  return Object.fromEntries(Object.entries(counts).sort());
}

export function buildTopStoriesNormalizationDigestValue(evaluation = {}) {
  const candidates = Array.isArray(evaluation.candidates)
    ? evaluation.candidates
    : [];
  const candidateBuildTrace = Array.isArray(evaluation.candidateBuildTrace)
    ? evaluation.candidateBuildTrace
    : [];

  return {
    normalizationVersion: TOP_STORIES_NORMALIZATION_VERSION,
    rawInputCount: Number(evaluation.rawInputCount || 0),
    candidateCount: candidates.length,
    candidateBuildDispositionCounts: sortedCounts(
      candidateBuildTrace,
      'buildDisposition',
    ),
    candidateBuildReasonCounts: sortedCounts(
      candidateBuildTrace,
      'reasonCode',
    ),
    candidates: canonicalizeJson(
      stripExcludedNormalizationMetadata(candidates),
      { sortArrays: true },
    ),
  };
}

export function getTopStoriesNormalizationDigest(evaluation = {}) {
  return digestCanonicalJson(
    buildTopStoriesNormalizationDigestValue(evaluation),
  );
}
