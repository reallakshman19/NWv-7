import { isBreakingStory } from '../services/breakingNewsService.js';
export const TOP_STORY_FRESH_MS = 24 * 60 * 60 * 1000;
export const BREAKING_PIN_MS = 3 * 60 * 60 * 1000;
export const TOP_STORY_HALF_LIFE_HOURS = 10;

const LOW_CONFIDENCE_SOURCES = new Set([
  'fetch_time_fallback',
  'missing',
  'invalid',
  'unknown',
]);

export function hasLowConfidenceTimestamp(story) {
  if (String(story?.timestampConfidence || '').toLowerCase() === 'low') return true;
  const source = String(story?.publishedAtSource || story?.timestampSource || '').toLowerCase();
  return LOW_CONFIDENCE_SOURCES.has(source);
}

export function storyTimestamp(story) {
  if (hasLowConfidenceTimestamp(story)) return 0;
  const raw = story?.publishedAt || story?.pubDate || story?.date || story?.fetchedAt;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw < 10_000_000_000 ? raw * 1000 : raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function storyAgeMs(story, nowMs = Date.now()) {
  const timestamp = storyTimestamp(story);
  return timestamp ? Math.max(0, nowMs - timestamp) : Number.POSITIVE_INFINITY;
}

export function isFreshTopStory(story, nowMs = Date.now()) {
  return storyAgeMs(story, nowMs) <= TOP_STORY_FRESH_MS;
}

export function isPinnedBreakingStory(story, nowMs = Date.now()) {
  return Boolean(isBreakingStory(story) && storyTimestamp(story) && storyAgeMs(story, nowMs) <= BREAKING_PIN_MS);
}

export function topStoryBucket(story, nowMs = Date.now()) {
  if (isPinnedBreakingStory(story, nowMs)) return 0;
  if (isFreshTopStory(story, nowMs) && storyTimestamp(story)) return 1;
  if (storyTimestamp(story)) return 2;
  return 3;
}

export function topStoryScore(story, nowMs = Date.now()) {
  if (isPinnedBreakingStory(story, nowMs)) return Number(story?.breakingScore || 0) + 1000;
  const baseScore = Number(story?.impactScore || story?.score || 0);
  const timestamp = storyTimestamp(story);
  if (!timestamp) return baseScore * 0.1;
  const ageHours = storyAgeMs(story, nowMs) / 3_600_000;
  const lambda = Math.LN2 / TOP_STORY_HALF_LIFE_HOURS;
  return baseScore * Math.exp(-lambda * ageHours);
}

export function rankTopStoriesByRecency(stories, options = {}) {
  const nowMs = Number(options.nowMs || Date.now());
  return [...(Array.isArray(stories) ? stories : [])].sort((a, b) => {
    const bucketDiff = topStoryBucket(a, nowMs) - topStoryBucket(b, nowMs);
    if (bucketDiff) return bucketDiff;
    const scoreDiff = topStoryScore(b, nowMs) - topStoryScore(a, nowMs);
    if (scoreDiff) return scoreDiff;
    return storyTimestamp(b) - storyTimestamp(a);
  });
}
