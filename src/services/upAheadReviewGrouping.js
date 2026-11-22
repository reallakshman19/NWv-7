/**
 * Compact possible workshop listing duplicates for display only.
 *
 * Never asserts shared physical occurrence identity, rewrites source IDs,
 * creates aliases, changes Planner rows, or drops one of the source links.
 * This intentionally targets the investigated Chennai calendar source alone.
 */
export function reviewWorkshopTitle(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(?:2|two)\s*[-\s]*days?\b/g, ' ')
    .replace(/\bworkshops?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function candidateKey(row) {
  if (row?.category !== 'events' || row?.sourceGroup !== 'chennai-calendar'
    || !/workshop/i.test(row.title || '') || row.city !== 'Chennai'
    || !row.venue || !Number.isFinite(Number(row.eventStartAt))
    || Number(row.eventStartAt) <= 0 || !row.id) return null;
  const title = reviewWorkshopTitle(row.title);
  if (!title) return null;
  const link = row.link || row.url;
  try {
    const url = new URL(link);
    if (url.protocol !== 'https:' || !['chennai2go.in', 'www.chennai2go.in'].includes(url.hostname)) return null;
  } catch { return null; }
  return JSON.stringify([row.sourceGroup, row.city, row.venue.toLowerCase().trim(),
    Number(row.eventStartAt), title]);
}

export function groupReviewOnlyEventListings(items = []) {
  const groups = new Map();
  for (const row of items) {
    const key = candidateKey(row);
    if (key) (groups.get(key) || (groups.set(key, []), groups.get(key))).push(row);
  }
  const safe = new Map();
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    const explicitSessions = new Set(members.map(row => String(row.sessionId || '').trim()));
    const explicitOccurrences = new Set(members.map(row => String(row.occurrenceId || '').trim()));
    // Do not visually compress sessions or official occurrence IDs that are
    // actually distinct. Mixed known/unknown metadata is also ambiguous.
    if (explicitSessions.size !== 1 || explicitOccurrences.size !== 1) continue;
    const ids = new Set(members.map(row => row.id));
    const urls = new Set(members.map(row => row.link || row.url));
    if (ids.size !== members.length || urls.size !== members.length) continue;
    safe.set(key, members);
  }
  const emitted = new Set();
  const result = [];
  for (const row of items) {
    const key = candidateKey(row);
    const group = key ? safe.get(key) : null;
    if (!group) { result.push(row); continue; }
    if (emitted.has(key)) continue;
    emitted.add(key);
    result.push({
      ...row,
      reviewGroupCount: group.length,
      // All member objects and source links retained for explicit user choice.
      reviewAlternateListings: group.map(member => ({ ...member })),
      reviewGroupStatus: 'POSSIBLE_DUPLICATE_UNCONFIRMED',
    });
  }
  return result;
}
