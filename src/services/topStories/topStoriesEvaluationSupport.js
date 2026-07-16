import { getTopStoryDedupeKey } from './topStoriesCandidates.js';

function getPublishedAtMs(story = {}) {
  if (
    typeof story.publishedAt === 'number' &&
    Number.isFinite(story.publishedAt)
  ) {
    return story.publishedAt;
  }
  const parsed = Date.parse(story.publishedAt || story.updatedAt || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function compareRankedTopStories(a, b) {
  const ar = a._topStoryRank || {};
  const br = b._topStoryRank || {};
  return (Number(br.priorityBucket || 0) - Number(ar.priorityBucket || 0)) ||
    (Number(br.score || 0) - Number(ar.score || 0)) ||
    (Number(br.freshnessScore || 0) - Number(ar.freshnessScore || 0)) ||
    (getPublishedAtMs(b) - getPublishedAtMs(a)) ||
    getTopStoryDedupeKey(a).localeCompare(getTopStoryDedupeKey(b));
}

export function cloneTopStoriesPolicy(policy) {
  return {
    ...policy,
    weights: { ...policy.weights },
    thresholds: { ...policy.thresholds },
    diversity: { ...policy.diversity },
    consensus: { ...policy.consensus },
  };
}

export function resolveTopStoriesDisplayDepth(input = {}, options = {}) {
  const value = Number(options.displayDepth ?? input.displayDepth ?? 10);
  if (!Number.isFinite(value)) return 10;
  return Math.max(0, Math.floor(value));
}
