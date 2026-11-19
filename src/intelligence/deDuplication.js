import { upAheadDateKey, upAheadTimeMs, occurrenceLink } from '../services/upAheadLifecycle.js';
import { toLocalDateKey } from '../utils/dateKey.js';

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  const stop = new Set(['the', 'a', 'an', 'for', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'with', 'from']);
  return normalizeText(value)
    .split(' ')
    .filter(token => token && token.length > 2 && !stop.has(token));
}

function tokenSimilarity(a, b) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (!setA.size || !setB.size) return 0;

  let overlap = 0;
  for (const token of setA) {
    if (setB.has(token)) overlap += 1;
  }

  return overlap / Math.max(setA.size, setB.size);
}

function normalizeCategory(category) {
  const value = String(category || '').toLowerCase();
  if (['shopping', 'offer'].includes(value)) return 'offer';
  if (['airlines', 'airline_offer'].includes(value)) return 'airline_offer';
  if (['events', 'event', 'sports'].includes(value)) return 'event';
  if (['movies', 'movie'].includes(value)) return 'movie';
  if (['weather_alerts', 'weather_alert'].includes(value)) return 'weather_alert';
  if (['alerts', 'alert', 'civic'].includes(value)) return 'alert';
  return value || 'unknown';
}

function normalizeDateKey(value) {
  return toLocalDateKey(value);
}

function dayDistance(a, b) {
  const da = normalizeDateKey(a);
  const db = normalizeDateKey(b);
  if (!da || !db) return Number.POSITIVE_INFINITY;
  return Math.abs((new Date(da) - new Date(db)) / 86400000);
}

function normalizedLocation(item) {
  return String(item?.locationCanonical || item?.location || '').toLowerCase().trim() || null;
}

function canonicalLink(link) {
  try {
    const url = new URL(link);
    return occurrenceLink(url.href) || null;
  } catch {
    return String(link || '').trim().toLowerCase() || null;
  }
}

function titleFingerprint(item) {
  const text = normalizeText(item?.title || item?.summary || item?.description || '');
  return tokenize(text).slice(0, 10).join(' ');
}

function richerText(a, b, field) {
  const av = String(a?.[field] || '');
  const bv = String(b?.[field] || '');
  return bv.length > av.length ? b?.[field] : a?.[field];
}

export function areLikelyDuplicateItems(a, b, options = {}) {
  const titleThreshold = options.titleThreshold ?? 0.72;
  const requireCategoryMatch = options.requireCategoryMatch !== false;

  const categoryA = normalizeCategory(a?.category);
  const categoryB = normalizeCategory(b?.category);
  if (requireCategoryMatch && categoryA !== categoryB) {
    return { duplicate: false, score: 0, reason: 'category_mismatch' };
  }

  // A publisher-declared session identity is evidence stronger than URL/title
  // similarity. Separate same-day sessions must survive acquisition.
  if (a?.sessionId && b?.sessionId && String(a.sessionId) !== String(b.sessionId)) {
    return { duplicate: false, score: 0, reason: 'distinct_session_ids' };
  }
  const lineageA = [a?.occurrenceId,a?.revisionOf].filter(Boolean);
  const lineageB = [b?.occurrenceId,b?.revisionOf].filter(Boolean);
  if (lineageA.length && lineageB.length) {
    const same = lineageA.some(id=>lineageB.includes(id));
    return {duplicate:same,score:same?1:0,reason:same?'explicit_occurrence_lineage':'distinct_occurrence_ids'};
  }
  const linkA = canonicalLink(a?.link);
  const linkB = canonicalLink(b?.link);
  const locationA = normalizedLocation(a);
  const locationB = normalizedLocation(b);
  if (locationA && locationB && locationA !== locationB) return { duplicate: false, score: 0, reason: 'location_mismatch' };
  const dateA = upAheadDateKey(a), dateB = upAheadDateKey(b);
  const dateGap = dayDistance(dateA, dateB);
  // Dated occurrences are never fuzzy-matched across dates or sessions.
  if (dateA && dateB && dateA !== dateB) return { duplicate: false, score: 0, reason: 'date_gap_too_large' };
  const startA=upAheadTimeMs(a?.eventStartAt), startB=upAheadTimeMs(b?.eventStartAt);
  if (startA && startB && startA !== startB) return { duplicate: false, score: 0, reason: 'session_mismatch' };
  if (linkA && linkB && linkA === linkB && Boolean(dateA) === Boolean(dateB)
      && (!dateA || normalizeText(a?.title) === normalizeText(b?.title) || tokenSimilarity(a?.title,b?.title)>=titleThreshold)) {
    return { duplicate: true, score: 1, reason: 'same_canonical_link' };
  }
  if (dateA && dateB && linkA && linkB && linkA !== linkB) {
    try {
      const x = new URL(linkA), y = new URL(linkB);
      if (x.origin === y.origin && x.pathname === y.pathname && x.search !== y.search) {
        return { duplicate: false, score: 0, reason: 'distinct_link_parameters' };
      }
    } catch {
      // Malformed links cannot establish semantic-query identity.
    }
  }
  if (Boolean(dateA) !== Boolean(dateB)) return { duplicate: false, score: 0, reason: 'date_precision_mismatch' };

  const score = tokenSimilarity(titleFingerprint(a), titleFingerprint(b));
  return {
    duplicate: score >= titleThreshold,
    score,
    reason: score >= titleThreshold ? 'fuzzy_title_match' : 'title_below_threshold',
    diagnostics: {
      categoryA,
      categoryB,
      linkA,
      linkB,
      locationA,
      locationB,
      dateGap,
      titleA: a?.title,
      titleB: b?.title
    }
  };
}

export function mergeDuplicatePair(primary, secondary) {
  const mergedSources = [
    ...(primary?.sources || []),
    ...(primary?.source ? [primary.source] : []),
    ...(secondary?.sources || []),
    ...(secondary?.source ? [secondary.source] : [])
  ].filter(Boolean);

  const uniqueSources = [...new Set(mergedSources)];

  const primaryConfidence = Number(primary?.classificationConfidence || primary?.confidence || 0);
  const secondaryConfidence = Number(secondary?.classificationConfidence || secondary?.confidence || 0);
  const revisionA=upAheadTimeMs(primary?.revisionAt || primary?.observedAt);
  const revisionB=upAheadTimeMs(secondary?.revisionAt || secondary?.observedAt);
  const explicitRevision = [primary?.occurrenceId,primary?.revisionOf].filter(Boolean).some(id=>[secondary?.occurrenceId,secondary?.revisionOf].includes(id));
  const winner = explicitRevision && revisionA !== revisionB ? (revisionB>revisionA?secondary:primary) : secondaryConfidence > primaryConfidence ? secondary : primary;
  const loser = winner === primary ? secondary : primary;

  return {
    ...winner,
    title: richerText(winner, loser, 'title') || winner.title,
    summary: richerText(winner, loser, 'summary') || winner.summary,
    description: richerText(winner, loser, 'description') || winner.description,
    eventDate: explicitRevision ? winner.eventDate || winner.date || null : winner.eventDate || loser.eventDate || winner.date || loser.date || null,
    locationCanonical: winner.locationCanonical || loser.locationCanonical || null,
    sources: uniqueSources,
    mergedWith: [...new Set([...(winner.mergedWith || []), winner.canonicalId, loser.canonicalId].filter(Boolean))],
    dedupeDecision: 'merged_duplicate_pair'
  };
}

export function deduplicateCanonicalItems(items, options = {}) {
  const input = Array.isArray(items) ? items : [];
  const consumed = new Set();
  const output = [];

  for (let i = 0; i < input.length; i += 1) {
    if (consumed.has(i)) continue;
    let current = input[i];

    for (let j = i + 1; j < input.length; j += 1) {
      if (consumed.has(j)) continue;
      const result = areLikelyDuplicateItems(current, input[j], options);
      if (!result.duplicate) continue;

      current = mergeDuplicatePair(current, input[j]);
      current.decisionTrace = [...new Set([...(current.decisionTrace || []), `dedupe:${result.reason}`])];
      consumed.add(j);
    }

    output.push(current);
  }

  return output;
}
