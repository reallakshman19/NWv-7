import { toLocalDateKey } from '../utils/dateKey.js';

const HOUR_MS = 60 * 60 * 1000;
export const UP_AHEAD_SOURCE_LOOKBACK_MS = 7 * 24 * HOUR_MS;

export function upAheadTimeMs(value) {
  if (!value) return 0;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
    return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Date.parse(`${value}T00:00:00`) || 0;
  }
  return new Date(value).getTime() || 0;
}

export function upAheadDateKey(item) {
  const value = item?.eventDateKey || item?.eventDate || item?.date
    || item?.releaseDate || item?.planDate || item?.eventStartAt;
  return toLocalDateKey(upAheadTimeMs(value));
}

export function upAheadExpiryMs(item) {
  if (!item || item.suppressionReason || item.displayEligible === false) return 0;
  const deadlines = [item.expiryAt, item.eventEndAt, item.lifecycle?.displayUntil]
    .map(upAheadTimeMs)
    .filter(Boolean);
  if (deadlines.length) return Math.min(...deadlines);

  const dateKey = item.eventDateEndKey || upAheadDateKey(item);
  if (dateKey) {
    const end = new Date(upAheadTimeMs(dateKey));
    end.setDate(end.getDate() + 1);
    return end.getTime();
  }

  const timestamp = upAheadTimeMs(item.publishedAt || item.publishDate || item.firstSeenAt || item.observedAt);
  // Legacy records without a usable timestamp are still readable. Newly acquired
  // undated cards carry the acquisition time and can age out.
  if (!timestamp) return Infinity;
  const category = String(item.category || '').toLowerCase();
  if (['offer', 'shopping', 'airline_offer', 'airlines'].includes(category)) {
    return timestamp + 48 * HOUR_MS;
  }
  if (['alert', 'alerts', 'weather_alert', 'weather_alerts', 'civic'].includes(category)) {
    return timestamp + 24 * HOUR_MS;
  }
  return timestamp + UP_AHEAD_SOURCE_LOOKBACK_MS;
}

export function isUpAheadItemActive(item, now = Date.now()) {
  return now < upAheadExpiryMs(item);
}

function occurrenceLink(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(name)) url.searchParams.delete(name);
    }
    url.searchParams.sort();
    return url.href;
  } catch {
    return '';
  }
}

export function upAheadIdentityKeys(item) {
  const keys = [item.hiddenKey, item.canonicalId, item.id, ...(item.upAheadIds || [])]
    .filter(id => id && !/^https?:\/\//i.test(id))
    .map(id => `id:${id}`);
  const link = occurrenceLink(item.link || item.url);
  const date = upAheadDateKey(item) || '';
  if (link) keys.push(`link:${link}:${date}`);

  const title = String(item.title || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const location = String(item.locationCanonical || item.city || item.region || '').toLowerCase().trim();
  if (title && (date || !link)) keys.push(`title:${title}:${location}:${date}`);
  return keys;
}

// Stable identity keeps a saved or dismissed occurrence attached to a revision.
// Later observations update the details without moving the item to the end.
export function mergeUpAheadItems(items) {
  const indexes = new Map();
  const merged = [];
  for (const item of items) {
    if (!item) continue;
    const keys = upAheadIdentityKeys(item);
    if (!keys.length) continue;
    const matches = [...new Set(keys.map(key => indexes.get(key)).filter(index => index !== undefined))];
    const index = matches.length ? Math.min(...matches) : merged.length;
    const existing = merged[index];
    let result = item;
    if (existing) {
      const latest = upAheadTimeMs(item.observedAt) >= upAheadTimeMs(existing.observedAt) ? item : existing;
      const previous = latest === item ? existing : item;
      const ids = [item, ...matches.map(match => merged[match])].flatMap(row => [
        row.hiddenKey, row.canonicalId, row.id, ...(row.upAheadIds || []),
      ]);
      result = {
        ...previous,
        ...latest,
        hiddenKey: existing.hiddenKey || existing.canonicalId || existing.id || latest.hiddenKey,
        firstSeenAt: existing.firstSeenAt || item.firstSeenAt,
        upAheadIds: [...new Set(ids.filter(Boolean))],
      };
    }
    for (const match of matches) {
      if (match !== index) merged[match] = null;
    }
    if (matches.length > 1) {
      for (const [key, match] of indexes) {
        if (matches.includes(match)) indexes.set(key, index);
      }
    }
    merged[index] = result;
    for (const key of [...keys, ...upAheadIdentityKeys(result)]) indexes.set(key, index);
  }
  return merged.filter(Boolean);
}
