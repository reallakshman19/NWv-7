// Shared Cloudflare/GitHub authority validity. A nonempty array alone is not
// a successful feed: consumers require a headline, link and usable timestamp.
export const AUTHORITY_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const AUTHORITY_FUTURE_SKEW_MS = 5 * 60 * 1000;
const OTHER_STORY_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const KNOWN_SECTIONS = new Set(['topStories','india','tn','trichy','muscat','world','business','technology','sports','entertainment']);

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function timestamp(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number < 10_000_000_000 ? number * 1000 : number;
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isLiveStory(item) {
  const text = String(item?.title || item?.headline || '') + ' '
    + String(item?.summary || item?.description || '');
  return Boolean(item?.isBreaking || Number(item?.breakingScore || 0) > 0
    || /^live\b/i.test(text)
    || /\b(live\s+blog|live\s+updates?|live\s+coverage|developing|ongoing)\b/i.test(text)
    || String(item?.url || item?.link || '').includes('/live/'));
}

export function isAuthorityStoryUsable(item, section, nowMs = Date.now()) {
  if (!isRecord(item)) return false;
  const headline = String(item.title || item.headline || '').trim();
  if (!headline || !isHttpUrl(item.url || item.link || item.guid)) return false;
  const publishedAt = timestamp(item.publishedAt || item.pubDate || item.date);
  if (!publishedAt || publishedAt > nowMs + AUTHORITY_FUTURE_SKEW_MS) return false;
  const maxAge = section === 'topStories' && !isLiveStory(item)
    ? AUTHORITY_MAX_AGE_MS : OTHER_STORY_MAX_AGE_MS;
  if (nowMs - publishedAt > maxAge) return false;
  const confidence = String(item.timestampConfidence || item.publishedAtConfidence || '').trim().toLowerCase();
  const source = String(item.publishedAtSource || item.timestampSource || '').trim().toLowerCase();
  if (['low', 'unknown', 'fallback'].includes(confidence)
    || ['missing','invalid','fetch_time_fallback','fetch_fallback','fetchedat','unknown','updated_parsed'].includes(source)) return false;
  return true;
}

export function classifySectionsSnapshotAuthority(snapshot, nowMs = Date.now()) {
  if (!isRecord(snapshot) || ![1, 2].includes(Number(snapshot.schemaVersion))) {
    return { valid: false, reason: 'unsupported_snapshot_schema', usableStories: 0 };
  }
  const fetchedAt = Number(snapshot.fetchedAt);
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) {
    return { valid: false, reason: 'snapshot_missing_timestamp', usableStories: 0 };
  }
  if (fetchedAt > nowMs + AUTHORITY_FUTURE_SKEW_MS) {
    return { valid: false, reason: 'snapshot_future_timestamp', usableStories: 0 };
  }
  if (nowMs - fetchedAt > AUTHORITY_MAX_AGE_MS) {
    return { valid: false, reason: 'snapshot_stale', usableStories: 0 };
  }
  if (!isRecord(snapshot.sections)) {
    return { valid: false, reason: 'snapshot_invalid_sections', usableStories: 0 };
  }
  let usableStories = 0;
  for (const [section, items] of Object.entries(snapshot.sections)) {
    if (!KNOWN_SECTIONS.has(section) || !Array.isArray(items)) continue;
    for (const item of items) {
      if (isAuthorityStoryUsable(item, section, nowMs)) usableStories += 1;
    }
  }
  if (usableStories === 0) {
    return { valid: false, reason: 'snapshot_content_unusable', usableStories: 0 };
  }
  return { valid: true, reason: null, usableStories };
}
