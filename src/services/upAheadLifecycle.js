import { addCalendarDays, isCalendarDateKey, parsePublicationDate, toLocalDateKey, toUtcCalendarDateKey } from '../utils/dateKey.js';
import { upAheadCityLocation } from './upAheadLocation.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// These supported venue cities use fixed offsets for current and upcoming events.
const EVENT_OFFSETS_MS = { chennai: 5.5 * HOUR_MS, trichy: 5.5 * HOUR_MS, muscat: 4 * HOUR_MS };
export const UP_AHEAD_SOURCE_LOOKBACK_MS = 7 * 24 * HOUR_MS;

export function upAheadTimeMs(value) {
  if (!value) return 0;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
    return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return isCalendarDateKey(value) ? (Date.parse(`${value}T00:00:00`) || 0) : 0;
  }
  return new Date(value).getTime() || 0;
}

export function upAheadDateKey(item) {
  const key = item?.eventDateKey;
  if (key != null && key !== '') {
    // Explicit day keys may have been transported as numeric UTC midnight.
    if (typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key)) return isCalendarDateKey(key) ? key : null;
    const ms = upAheadTimeMs(key);
    return ms ? toUtcCalendarDateKey(ms) : null;
  }
  const value = item?.eventDate || item?.date || item?.releaseDate || item?.planDate;
  if (value != null && value !== '') {
    const ms = upAheadTimeMs(value);
    if (item?.publicationOnlyId && ['day', 'range'].includes(item.datePrecision) && ms && ms % DAY_MS === 0) return toUtcCalendarDateKey(ms);
    return toLocalDateKey(value);
  }
  const ms = upAheadTimeMs(item?.eventStartAt);
  if (!ms) return null;
  // Collector's day-precision eventStartAt is a UTC calendar sentinel. Legacy
  // numeric midnight rows predate datePrecision; explicit timed rows retain
  // local instant semantics. Offset-bearing holiday rows already carry keys.
  const numeric = typeof item.eventStartAt === 'number' || /^\d+$/.test(String(item.eventStartAt));
  if (numeric && (item.datePrecision === 'day' || (!item.datePrecision && ms % DAY_MS === 0))) return toUtcCalendarDateKey(ms);
  return upAheadEventDayKey(ms, item);
}

function eventOffset(item) {
  const city = upAheadCityLocation(item);
  if (Object.hasOwn(EVENT_OFFSETS_MS, city)) return EVENT_OFFSETS_MS[city];
  // The collector's calendar keys share a UTC clock when a venue is unknown.
  // Legacy timed rows without a recognized venue retain their local date keys.
  return !item?.eventStartAt || item.datePrecision === 'day' ? 0 : null;
}

function eventMidnight(key, item) {
  if (!isCalendarDateKey(key)) return 0;
  const offset = eventOffset(item);
  return offset == null ? upAheadTimeMs(key) : Date.parse(`${key}T00:00:00Z`) - offset;
}

export function upAheadEventDayKey(value, item) {
  if (isCalendarDateKey(value)) return value;
  const offset = eventOffset(item);
  const ms = upAheadTimeMs(value);
  if (!ms) return null;
  return offset == null ? toLocalDateKey(ms) : toUtcCalendarDateKey(ms + offset);
}

function isUtcDaySentinel(value, item) {
  const numeric = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value));
  const ms = upAheadTimeMs(value);
  return Boolean(numeric && item.datePrecision === 'day' && ms && ms % DAY_MS === 0);
}

function isInclusiveEndDay(value, item) {
  const ms = upAheadTimeMs(value);
  return Boolean(['day', 'range'].includes(item?.datePrecision)
    && isCalendarDateKey(item?.eventDateEndKey) && ms && ms % DAY_MS === 0
    && toUtcCalendarDateKey(ms) === item.eventDateEndKey);
}

function eventEndpoint(value, item, end = false) {
  if (end && isInclusiveEndDay(value, item)) return eventMidnight(addCalendarDays(item.eventDateEndKey, 1), item);
  if (isCalendarDateKey(value)) return eventMidnight(value, item);
  if (isUtcDaySentinel(value, item)) return eventMidnight(toUtcCalendarDateKey(upAheadTimeMs(value)), item);
  return upAheadTimeMs(value);
}

export function upAheadEventBounds(item) {
  const day = upAheadDateKey(item);
  const endDay = item?.eventDateEndKey;
  const exclusive = item?.eventDateEndExclusiveKey;
  const hasCalendarRange = Boolean(day && (
    (isCalendarDateKey(endDay) && endDay >= day)
    || (isCalendarDateKey(exclusive) && exclusive > day)
  ));
  const exclusiveKey = isCalendarDateKey(exclusive) && exclusive > day
    ? exclusive
    : addCalendarDays(isCalendarDateKey(endDay) && endDay >= day ? endDay : day, 1);
  return {
    start: eventEndpoint(item?.eventStartAt, item) || eventMidnight(day, item),
    end: eventEndpoint(item?.eventEndAt, item, true) || eventMidnight(exclusiveKey, item),
    hasCalendarRange,
  };
}

export function upAheadPlannerDayKey(item, now = Date.now()) {
  const day = upAheadDateKey(item);
  const today = upAheadEventDayKey(now, item);
  const { start, end } = upAheadEventBounds(item);
  return day && day < today && start > 0 && start <= now && now < end ? today : day;
}

export function getUpAheadWindowStatus(item, { asOfDate = Date.now(), plannerWindowDays = 7 } = {}) {
  const day = upAheadDateKey(item);
  if (!day) return 'missing_date';
  const observed = isCalendarDateKey(asOfDate)
    ? eventMidnight(asOfDate, item)
    : Number(parsePublicationDate(asOfDate) || new Date());
  const today = upAheadEventDayKey(observed, item);
  const { end } = upAheadEventBounds(item);
  if (day < today && !end) return 'before_window';
  if (end && end <= observed) return 'before_window';
  if (day > addCalendarDays(today, plannerWindowDays - 1)) return 'after_window';
  return 'inside_window';
}

export function upAheadExpiryMs(item) {
  if (!item || item.suppressionReason || item.displayEligible === false) return 0;
  const { end, hasCalendarRange } = upAheadEventBounds(item);
  const recordedEnd = upAheadTimeMs(item.eventEndAt);
  const convertedDeadline = value => recordedEnd && !isInclusiveEndDay(item.eventEndAt, item) && upAheadTimeMs(value) === recordedEnd
    ? end
    : upAheadTimeMs(value);
  const deadlines = [
    recordedEnd || hasCalendarRange ? end : 0,
    convertedDeadline(item.expiryAt),
    convertedDeadline(item.lifecycle?.displayUntil),
  ].filter(Boolean);
  if (deadlines.length) return Math.min(...deadlines);
  if (end) return end;

  const timestamp = upAheadTimeMs(item.publishedAt || item.publishDate || item.firstSeenAt || item.observedAt);
  // A missing source/event clock cannot grant indefinite feed eligibility.
  // Cache maintenance keeps such legacy rows in a bounded recovery quarantine.
  if (!timestamp) return 0;
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

export function occurrenceLink(value) {
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

const textKey = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const locationKey = item => JSON.stringify([textKey(item.locationCanonical || item.city || item.region), textKey(item.venue || item.venueName || item.address)]);
const startKey = item => item.eventStartAt && !['day','range'].includes(item.datePrecision) && !/^\d{4}-\d{2}-\d{2}$/.test(String(item.eventStartAt)) ? String(upAheadTimeMs(item.eventStartAt)) : '';
const categoryKey = item => ['event','events','sports'].includes(item.category) ? 'event' : item.category || '';
// Raw publisher IDs and URLs are aliases, never unscoped occurrence IDs.
// Explicit occurrence identity (or a source-scoped canonical lineage) is the
// only authority for a reschedule across different date/time slots.
function lineageKeys(item) {
  const keys = [];
  if (item.occurrenceId) keys.push(`occ:${item.occurrenceId}`);
  if (item.revisionOf) keys.push(`occ:${item.revisionOf}`);
  // Existing canonical live IDs can be stable across revisions. Raw snapshot
  // conversion marks its IDs as publication-only, not authoritative lineage.
  if (!item.publicationOnlyId && item.canonicalId && item.source && item.title) {
    keys.push(`canonical:${textKey(item.source)}:${item.canonicalId}:${textKey(item.title)}:${locationKey(item)}:${categoryKey(item)}`);
  }
  return [...new Set(keys)];
}
function slot(item) {
  // A scoped, publisher-declared session ID distinguishes untimed sessions
  // sharing one event page/day; it is not a generic article identity.
  return JSON.stringify([upAheadDateKey(item) || '', startKey(item), locationKey(item), categoryKey(item), textKey(item.title), textKey(item.sessionId)]);
}
function aliases(item) {
  const scope = JSON.stringify([slot(item), item.occurrenceId || item.revisionOf || '']);
  const keys = [item.hiddenKey, item.canonicalId, item.id, ...(item.upAheadIds || [])]
    .filter(id => id && !/^https?:\/\//i.test(id)).map(id => `id:${id}:${scope}`);
  const link = occurrenceLink(item.link || item.url);
  if (link) keys.push(`link:${link}:${scope}`);
  const title = textKey(item.title);
  if (title && !link && (!keys.length || (upAheadDateKey(item) && (item.city || item.locationCanonical || item.venue)))) keys.push(`title:${title}:${scope}`);
  return keys;
}
export function upAheadIdentityKeys(item) {
  return [...new Set([...lineageKeys(item).filter(k => k.startsWith('occ:')), ...aliases(item), ...(item.occurrenceKey ? [item.occurrenceKey] : [])])];
}
export function upAheadOccurrenceKey(item) {
  if (item.occurrenceKey) return item.occurrenceKey;
  const link = occurrenceLink(item.link || item.url);
  return lineageKeys(item).find(k => k.startsWith('occ:')) || (link ? `link:${link}:${slot(item)}` : aliases(item)[0] || `title:${textKey(item.title)}:${slot(item)}`);
}
export function sameUpAheadOccurrence(a, b) {
  if (!a || !b) return false;
  if (a.sessionId && b.sessionId && String(a.sessionId) !== String(b.sessionId)) return false;
  const explicitA = [a.occurrenceId, a.revisionOf].filter(Boolean);
  const explicitB = [b.occurrenceId, b.revisionOf].filter(Boolean);
  if (explicitA.length && explicitB.length && !explicitA.some(x => explicitB.includes(x))) return false;
  if (explicitA.some(x => explicitB.includes(x))) return true;
  // Legacy canonical lineage is only accepted across dates with matching
  // first-seen evidence and a different observation/revision time. Equal
  // observation-time siblings are not revisions. Timed sessions need explicit
  // occurrence lineage to change their start time.
  const lineage = lineageKeys(a).some(k => lineageKeys(b).includes(k));
  const revised = a.firstSeenAt && a.firstSeenAt === b.firstSeenAt
    && upAheadTimeMs(a.observedAt) !== upAheadTimeMs(b.observedAt);
  const explicitRevision = a.revisionAt || b.revisionAt;
  if (lineage && (revised || explicitRevision) && !(startKey(a) && startKey(b) && startKey(a)!==startKey(b))) return true;
  // An occurrence key persisted after an authoritative merge can retain its
  // identity across subsequent copies, but cannot bridge different slots.
  if (a.occurrenceKey && b.occurrenceKey && a.occurrenceKey === b.occurrenceKey && (explicitA.length || explicitB.length)) return true;
  if (slot(a) !== slot(b)) return false;
  return aliases(a).some(k => aliases(b).includes(k)) || Boolean(a.occurrenceKey && a.occurrenceKey === b.occurrenceKey);
}

// Category routes may project one advertised occurrence into several tabs.
// Compare its remaining identity (date, time, venue, session and article aliases)
// when constructing a combined feed, while keeping each category's own rows.
export function sameUpAheadDisplayOccurrence(a, b) {
  return sameUpAheadOccurrence(a, b) || Boolean(a && b && sameUpAheadOccurrence(
    { ...a, category: 'event' }, { ...b, category: 'event' },
  ));
}
function compareRevision(a, b) {
  const explicit = upAheadTimeMs(a.revisionAt || a.updatedAt) - upAheadTimeMs(b.revisionAt || b.updatedAt);
  if (explicit) return explicit;
  const observed = upAheadTimeMs(a.observedAt) - upAheadTimeMs(b.observedAt);
  if (observed) return observed;
  // A deterministic tie is not a claim that one publisher is authoritative.
  const key = x => JSON.stringify([upAheadDateKey(x), startKey(x), x.source || '', x.id || '', x.title || '', x.description || '']);
  return key(a).localeCompare(key(b));
}
function combineOccurrence(existing, item, latest) {
  const previous = latest === item ? existing : item;
  const ids = [item,existing].flatMap(x => [x.hiddenKey,x.canonicalId,x.id,...(x.upAheadIds||[])]);
  const seen = [existing.firstSeenAt,item.firstSeenAt].filter(Boolean).sort((a,b)=>upAheadTimeMs(a)-upAheadTimeMs(b));
  const result = { ...previous, ...latest,
    hiddenKey: existing.hiddenKey || existing.canonicalId || existing.id || latest.hiddenKey,
    occurrenceKey: existing.occurrenceKey,
    firstSeenAt: seen[0], upAheadIds: [...new Set(ids.filter(Boolean))],
    _timelineEligible: Boolean(existing._timelineEligible || item._timelineEligible),
  };
  // Across a reschedule, stale validity fields must not expire the new date.
  if (slot(previous) !== slot(latest)) for (const field of ['eventStartAt','eventEndAt','eventDateEndKey','expiryAt','lifecycle','planDate','eventDate','date','releaseDate']) {
    if (!Object.hasOwn(latest,field)) delete result[field];
  }
  return result;
}
export function mergeUpAheadItems(items, { preferEventCategory = false } = {}) {
  const merged = [];
  // Process stable lineages first, so an older revision cannot bridge two
  // independent occurrences through a common article alias.
  for (const row of [...(items || [])].filter(Boolean).sort(compareRevision)) {
    if (!row || !upAheadIdentityKeys(row).length) continue;
    const item = { ...row, occurrenceKey: upAheadOccurrenceKey(row) };
    const index = merged.findIndex(existing => preferEventCategory
      ? sameUpAheadDisplayOccurrence(existing, item) : sameUpAheadOccurrence(existing, item));
    if (index < 0) { merged.push(item); continue; }
    const existing = merged[index];
    let latest = compareRevision(item, existing) > 0 ? item : existing;
    if (preferEventCategory && item.category !== existing.category) {
      const priority = x => Number(isUpAheadItemActive(x)) * 2 + Number(['events','movies','festivals','sports'].includes(x.category));
      if (priority(item) !== priority(existing)) latest = priority(item) > priority(existing) ? item : existing;
    }
    merged[index] = combineOccurrence(existing,item,latest);
  }
  // A later same-slot duplicate may have arrived before its authoritative
  // reschedule. Resolve only rows that still describe the same occurrence.
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i=0;i<merged.length;i++) for (let j=i+1;j<merged.length;j++) {
      if (!(preferEventCategory ? sameUpAheadDisplayOccurrence(merged[i],merged[j]) : sameUpAheadOccurrence(merged[i],merged[j]))) continue;
      const a=merged[i], b=merged[j], latest=compareRevision(a,b)>=0?a:b;
      merged[i]=combineOccurrence(a,b,latest);
      merged.splice(j,1); changed=true; break outer;
    }
  }
  return merged.sort((a,b)=>(upAheadDateKey(a)||'').localeCompare(upAheadDateKey(b)||'') || upAheadOccurrenceKey(a).localeCompare(upAheadOccurrenceKey(b)));
}
