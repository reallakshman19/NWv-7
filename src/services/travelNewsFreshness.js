/**
 * Travel Local is news, not an open-ended travel-events archive.
 * Match the 36-hour retention window used by Sections Latest.
 * Fail closed when a story's real publication timestamp is missing.
 */
export const TRAVEL_NEWS_RETENTION_HOURS = 36;
export const TRAVEL_FEED_MAX_AGE_HOURS = 12;
export const TRAVEL_NEWS_MAX_ITEMS = 30;
const HOUR_MS = 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export function parseTravelNewsTimestamp(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    const ms = value < 1e11 ? value * 1000 : value;
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (/^\d{10,13}$/.test(text)) return parseTravelNewsTimestamp(Number(text));
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

export function getTravelStoryPublishedMs(story) {
  const keys = [
    'publishedAt', 'published_at', 'pubDate', 'published',
    'publicationDate', 'publishedDate', 'isoDate', 'date', 'timestamp',
  ];
  for (const key of keys) {
    const value = story?.[key];
    if (value !== undefined && value !== null && value !== '') {
      return parseTravelNewsTimestamp(value);
    }
  }
  return null;
}

function inWindow(ms, now, maxAgeHours) {
  return ms !== null &&
    ms <= now + FUTURE_TOLERANCE_MS &&
    now - ms <= maxAgeHours * HOUR_MS;
}

export function isFreshTravelStory(story, options = {}) {
  const now = options.now ?? Date.now();
  const retentionHours = options.retentionHours ?? TRAVEL_NEWS_RETENTION_HOURS;
  return inWindow(getTravelStoryPublishedMs(story), now, retentionHours);
}

export function isFreshTravelPayload(payload, options = {}) {
  const now = options.now ?? Date.now();
  const maxAgeHours = options.maxAgeHours ?? TRAVEL_FEED_MAX_AGE_HOURS;
  // generatedAt is a collector receipt, NOT a substitute for publication time.
  return Boolean(payload && inWindow(parseTravelNewsTimestamp(payload.generatedAt), now, maxAgeHours));
}

export function filterFreshTravelStories(stories, options = {}) {
  return (Array.isArray(stories) ? stories : [])
    .filter(story => isFreshTravelStory(story, options));
}

export function formatTravelStoryAge(story, now = Date.now()) {
  const ms = getTravelStoryPublishedMs(story);
  if (!isFreshTravelStory(story, { now })) return '';
  const minutes = Math.max(0, Math.floor((now - ms) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
