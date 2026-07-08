export const HOURS_MS = 60 * 60 * 1000;

export const TOP_STORIES_POLICY = Object.freeze({
  limit: 25,
  primaryLimit: 10,
  primaryWindowHours: 4,
  secondaryWindowHours: 8,
  fallbackWindowHours: 12,
  liveMaxHours: 24,
  weights: Object.freeze({
    freshness: 42,
    publicInterest: 34,
    consensus: 14,
    breakingLive: 18,
    sourceQuality: 8,
    locationRelevance: 6,
  }),
  thresholds: Object.freeze({
    primary: 0.52,
    secondary: 0.42,
    fallback: 0.34,
  }),
  diversity: Object.freeze({
    maxPerSource: 4,
    maxPerSection: 9,
    maxPerGeo: 9,
    maxPerCluster: 1,
  }),
  consensus: Object.freeze({
    cap: 6,
    topFeedWeight: 1.5,
    clusterWeight: 0.5,
  }),
});

export function getTopStoriesPolicy(overrides = {}) {
  return {
    ...TOP_STORIES_POLICY,
    ...(overrides || {}),
    weights: {
      ...TOP_STORIES_POLICY.weights,
      ...(overrides.weights || {}),
    },
    thresholds: {
      ...TOP_STORIES_POLICY.thresholds,
      ...(overrides.thresholds || {}),
    },
    diversity: {
      ...TOP_STORIES_POLICY.diversity,
      ...(overrides.diversity || {}),
    },
    consensus: {
      ...TOP_STORIES_POLICY.consensus,
      ...(overrides.consensus || {}),
    },
  };
}

export function clampScore(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}
