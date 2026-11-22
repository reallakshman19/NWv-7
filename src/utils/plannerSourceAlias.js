/**
 * Read-only compatibility for publisher-ID revisions of the SAME advertised
 * event. This never mutates user-saved Planner IDs or unverified source data.
 * An arbitrary title match, source-group label, or proposed canonicalId is
 * insufficient; require identical HTTPS source URL and full event slot.
 */
function sourceUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    u.hash = '';
    // Only well-known marketing tags are ignorable. Keep significant params
    // (e.g. eventId, sessionId and product variants) in the occurrence key.
    for (const key of [...u.searchParams.keys()]) {
      if (/^(?:utm_[a-z0-9_]+|fbclid)$/i.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    return u.href.replace(/\/$/, '');
  } catch { return null; }
}

function eventSlot(row, date) {
  if (!row || typeof row !== 'object') return null;
  const event = Number(row.eventStartAt);
  if (!Number.isFinite(event) || event <= 0) return null;
  const city = String(row.city || row.locationCanonical || row.location || '').toLowerCase().trim();
  const category = String(row.category || '').toLowerCase().trim();
  if (!city || !category || !date) return null;
  return JSON.stringify([date, city, category, event]);
}

/**
 * True only for a publisher identifier change for one securely scoped source
 * event; never changes the stored row or upgrades source authority.
 */
export function sameSourceBackedPlannerEvent(a, b, date) {
  const urlA = sourceUrl(a?.link || a?.url || a?.sourceUrl);
  const urlB = sourceUrl(b?.link || b?.url || b?.sourceUrl);
  if (!urlA || !urlB || urlA !== urlB) return false;
  const slotA = eventSlot(a,date), slotB = eventSlot(b,date);
  if (!slotA || slotA !== slotB) return false;
  const equalOptional = field => {
    const x = String(a?.[field] || '').trim();
    const y = String(b?.[field] || '').trim();
    // A missing issuer/session/venue ID is not evidence that a known ID is
    // equivalent to an unknown one. Explicit distinct IDs fail closed.
    return x === y;
  };
  if (!['sessionId','occurrenceId','revisionOf','venue'].every(equalOptional)) return false;
  if (a?.sourceGroup && b?.sourceGroup && a.sourceGroup !== b.sourceGroup) return false;
  return true;
}
