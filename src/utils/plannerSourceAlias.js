/**
 * Compatibility for a changed publisher *record ID* on a specific listing.
 * It does not prove two physical workshop sessions are the same.
 *
 * Fail closed for search pages, venue homepages and unrelated publishers:
 * an unchanged location/time is not an event identity.
 */
function verifiedListingUrl(row) {
  if (row?.sourceGroup !== 'chennai-calendar') return null;
  const input = row?.link || row?.url;
  try {
    const u = new URL(input);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    if (!['chennai2go.in', 'www.chennai2go.in'].includes(u.hostname.toLowerCase())) return null;
    const path = u.pathname.replace(/\/+$/, '');
    // The source's original article URL embeds its own per-listing slug.
    // Generic calendar/search/venue pages can advertise many distinct sessions.
    const match = /^\/event\/([a-z0-9][a-z0-9-]{7,})$/i.exec(path);
    if (!match || /^(?:upcoming|calendar|workshops?|events?|search|category|index|homepage)$/i.test(match[1])) return null;
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(?:utm_[a-z0-9_]+|fbclid)$/i.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    u.pathname = path;
    return u.href;
  } catch { return null; }
}
function normalizedTitle(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function eventSlot(row, date) {
  if (!row || typeof row !== 'object') return null;
  if (!row.eventDateKey || row.eventDateKey !== date) return null;
  const start = Number(row.eventStartAt);
  if (!Number.isFinite(start) || start <= 0) return null;
  const city = String(row.city || row.locationCanonical || '').toLowerCase().trim();
  const category = String(row.category || '').toLowerCase().trim();
  const venue = String(row.venue || '').normalize('NFKC').toLowerCase().trim();
  const title = normalizedTitle(row.title);
  if (city !== 'chennai' || category !== 'events' || !venue || !title) return null;
  return JSON.stringify([date, city, category, start, venue, title]);
}

/**
 * Admits the same immutable source *listing* with a reissued publisher ID.
 * The title, source permalink, date, venue and time must all agree.
 * Do not silently create session aliases for records without this evidence.
 */
export function sameSourceBackedPlannerEvent(a, b, date) {
  const urlA = verifiedListingUrl(a), urlB = verifiedListingUrl(b);
  if (!urlA || !urlB || urlA !== urlB) return false;
  const slotA = eventSlot(a, date), slotB = eventSlot(b, date);
  if (!slotA || slotA !== slotB) return false;
  const sameExplicit = field => String(a?.[field] || '').trim() === String(b?.[field] || '').trim();
  // Missing authoritative IDs must not match populated ones. Distinct session
  // or occurrence IDs never merge even on the same source permalink.
  return ['sessionId', 'occurrenceId', 'revisionOf'].every(sameExplicit);
}
