import { createHash } from 'node:crypto';

export const VOLATILE_INPUT_KEYS = Object.freeze([
  '_candidateSeenAt',
  'durationMs',
  'fetchDurationMs',
  'fetchedAt',
  'fetched_at',
  'fetchTime',
  'fetchTimestamp',
  'requestId',
  'runAt',
  'sectionFetchDurationMs',
  'snapshotElapsedMs',
  'traceId',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeValue(value, options) {
  if (Array.isArray(value)) {
    const rows = value.map(item => normalizeValue(item, options));
    return options.sortArrays
      ? rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      : rows;
  }
  if (!isPlainObject(value)) return value;
  return Object.keys(value)
    .filter(key => !options.omitKeys.has(key))
    .sort()
    .reduce((result, key) => ({
      ...result,
      [key]: normalizeValue(value[key], options),
    }), {});
}

export function canonicalizeJson(value, options = {}) {
  return normalizeValue(value, {
    omitKeys: new Set(options.omitKeys || []),
    sortArrays: Boolean(options.sortArrays),
  });
}

export function stableJson(value, options = {}) {
  return JSON.stringify(canonicalizeJson(value, options), null, 2);
}

export function sha256Text(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function digestCanonicalJson(value, options = {}) {
  return sha256Text(stableJson(value, options));
}

function normalizeStoryRows(rows = []) {
  return canonicalizeJson(Array.isArray(rows) ? rows : [], {
    omitKeys: VOLATILE_INPUT_KEYS,
    sortArrays: true,
  });
}

function normalizeSectionItems(sectionItems = {}) {
  if (Array.isArray(sectionItems)) return { __all: normalizeStoryRows(sectionItems) };
  return Object.keys(sectionItems || {}).sort().reduce((result, section) => ({
    ...result,
    [section]: normalizeStoryRows(sectionItems[section]),
  }), {});
}

export function buildRankingInputDigestValue(inputBundle = {}) {
  return {
    sectionItems: normalizeSectionItems(inputBundle.sectionItems),
    topFeedItems: normalizeStoryRows(inputBundle.topFeedItems),
  };
}

export function getRankingInputDigest(inputBundle = {}) {
  return digestCanonicalJson(buildRankingInputDigestValue(inputBundle));
}
