import {
  asArray,
  hasText,
  makeResult,
  parseTimestamp,
  storyTimestamp,
} from './sharedContractUtils.mjs';

const SUPPORTED_SCHEMAS = new Set([1, 2, 3]);
const ROLLING_POOL_MS = 36 * 60 * 60 * 1000;

function isUsableStory(story) {
  if (!story || typeof story !== 'object') return false;
  const hasTitle = hasText(story.title) || hasText(story.headline);
  const hasIdentity = hasText(story.url) || hasText(story.link) || hasText(story.id);
  return hasTitle && hasIdentity;
}

function temporalMetrics(stories, now) {
  const timestamps = stories.map(storyTimestamp).filter(Boolean);
  const inRollingPool = timestamps.filter(ts => now - ts <= ROLLING_POOL_MS).length;
  const spreadMs = timestamps.length > 1 ? Math.max(...timestamps) - Math.min(...timestamps) : 0;
  return { timestampCount: timestamps.length, inRollingPool, spreadMs };
}

export function validateInsightContract(snapshot, options = {}) {
  const errors = [];
  const warnings = [];
  const schema = Number(snapshot?.schemaVersion || 0);
  const fetchedAt = parseTimestamp(snapshot?.fetchedAt);
  const stories = asArray(snapshot?.stories);
  const usableStories = stories.filter(isUsableStory);
  const now = Number(options.nowMs || fetchedAt || Date.now());
  const temporal = temporalMetrics(usableStories, now);

  if (!SUPPORTED_SCHEMAS.has(schema)) errors.push(`Unsupported insight schemaVersion: ${schema}`);
  if (!fetchedAt) errors.push('insight fetchedAt is missing or invalid');
  if (!Array.isArray(snapshot?.stories)) errors.push('insight stories[] is missing');
  if (stories.length === 0) errors.push('insight stories[] is empty');
  if (usableStories.length === 0) errors.push('insight has zero usable stories');
  if (temporal.timestampCount === 0 && usableStories.length > 0) errors.push('insight usable stories have no timestamps');
  if (temporal.inRollingPool === 0 && temporal.timestampCount > 0) warnings.push('insight has no usable stories inside 36h rolling pool');
  if (usableStories.length >= 5 && temporal.spreadMs === 0) warnings.push('insight story timestamps have no temporal spread');

  return makeResult(errors, warnings, {
    schemaVersion: schema,
    fetchedAt,
    storyCount: stories.length,
    usableStoryCount: usableStories.length,
    ...temporal,
    rollingPoolHours: 36,
  });
}
