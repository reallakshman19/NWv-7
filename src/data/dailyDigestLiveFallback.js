import {
  getSectionsSnapshotRuntimeSummary,
  loadSectionsSnapshot,
} from '../adapters/sectionsSnapshotFetcher.js';

const LIVE_DIGEST_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const LIVE_DIGEST_MAX_CARDS = 6;
const LIVE_DIGEST_MIN_CARDS = 3;
const LIVE_DIGEST_MIN_SOURCE_GROUPS = 2;
const MAX_PER_SOURCE_GROUP = 2;

const PRIMARY_SECTION_ORDER = Object.freeze([
  'topStories',
  'india',
  'world',
  'business',
  'technology',
  'tn',
  'muscat',
  'sports',
  'entertainment',
]);

const DIVERSITY_SECTION_ORDER = Object.freeze([
  'india',
  'world',
  'business',
  'technology',
  'tn',
  'muscat',
  'sports',
  'entertainment',
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = '') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function timestampMs(item) {
  const raw = Number(item?.publishedAt || item?.pubDate || item?.date || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw < 10_000_000_000 ? raw * 1000 : raw;
}

function normalizeHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') return '';
    [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
      'fbclid',
      'gclid',
    ].forEach(key => url.searchParams.delete(key));
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function canonicalKey(item) {
  const url = normalizeHttpUrl(item?.url || item?.link || item?.guid);
  if (url) return url.toLowerCase();
  return text(item?.title || item?.headline).toLowerCase().replace(/\s+/g, ' ');
}

function sourceGroup(item) {
  return text(item?.sourceGroup || item?.source || item?.publisher, 'Unknown');
}

function normalizeCandidate(item, section, rank, nowMs) {
  if (!item || typeof item !== 'object') return null;

  const title = text(item.title || item.headline);
  const canonicalUrl = normalizeHttpUrl(item.url || item.link || item.guid);
  const publishedAt = timestampMs(item);
  const ageMs = publishedAt > 0 ? Math.max(0, nowMs - publishedAt) : Infinity;

  if (!title || !canonicalUrl || !publishedAt || ageMs > LIVE_DIGEST_MAX_AGE_MS) return null;

  const source = text(item.source || item.publisher || item.sourceGroup, 'Unknown');

  return {
    canonicalId: text(item.canonicalId || item.id || canonicalKey(item)),
    title,
    canonicalUrl,
    source,
    sourceGroup: sourceGroup(item),
    section,
    publishedAt,
    rank,
    impactScore: Number(item.impactScore || item.score || 0),
  };
}

export function buildLiveDigestCandidatePool(snapshot, { nowMs } = {}) {
  const referenceNow = Number(nowMs || snapshot?.fetchedAt || Date.now());
  const sections = snapshot?.sections && typeof snapshot.sections === 'object'
    ? snapshot.sections
    : {};

  const seen = new Set();
  const pool = [];

  for (const section of PRIMARY_SECTION_ORDER) {
    asArray(sections[section]).forEach((item, rank) => {
      const key = canonicalKey(item);
      if (!key || seen.has(key)) return;

      const candidate = normalizeCandidate(item, section, rank, referenceNow);
      if (!candidate) return;

      seen.add(key);
      pool.push(candidate);
    });
  }

  return pool;
}

function canUseSource(candidate, sourceCounts, enforceCap = true) {
  if (!enforceCap) return true;
  return Number(sourceCounts.get(candidate.sourceGroup) || 0) < MAX_PER_SOURCE_GROUP;
}

function pushCandidate(selected, selectedKeys, sourceCounts, candidate, enforceCap = true) {
  const key = candidate.canonicalUrl.toLowerCase();
  if (selectedKeys.has(key) || !canUseSource(candidate, sourceCounts, enforceCap)) return false;

  selected.push(candidate);
  selectedKeys.add(key);
  sourceCounts.set(candidate.sourceGroup, Number(sourceCounts.get(candidate.sourceGroup) || 0) + 1);
  return true;
}

export function selectLiveDigestCards(snapshot, options = {}) {
  const limit = Math.max(1, Math.min(
    LIVE_DIGEST_MAX_CARDS,
    Number(options.limit || LIVE_DIGEST_MAX_CARDS)
  ));
  const pool = buildLiveDigestCandidatePool(snapshot, options);
  const selected = [];
  const selectedKeys = new Set();
  const sourceCounts = new Map();

  const topStories = pool.filter(item => item.section === 'topStories');
  for (const candidate of topStories.slice(0, 4)) {
    if (selected.length >= Math.min(2, limit)) break;
    pushCandidate(selected, selectedKeys, sourceCounts, candidate, true);
  }

  for (const section of DIVERSITY_SECTION_ORDER) {
    if (selected.length >= limit) break;
    const candidate = pool.find(item => item.section === section && !selectedKeys.has(item.canonicalUrl.toLowerCase()));
    if (candidate) pushCandidate(selected, selectedKeys, sourceCounts, candidate, true);
  }

  const rankedRemainder = pool
    .filter(item => !selectedKeys.has(item.canonicalUrl.toLowerCase()))
    .sort((a, b) => {
      const impactDelta = Number(b.impactScore || 0) - Number(a.impactScore || 0);
      if (impactDelta !== 0) return impactDelta;
      const publishedDelta = Number(b.publishedAt || 0) - Number(a.publishedAt || 0);
      if (publishedDelta !== 0) return publishedDelta;
      return Number(a.rank || 0) - Number(b.rank || 0);
    });

  for (const candidate of rankedRemainder) {
    if (selected.length >= limit) break;
    pushCandidate(selected, selectedKeys, sourceCounts, candidate, true);
  }

  for (const candidate of rankedRemainder) {
    if (selected.length >= limit) break;
    pushCandidate(selected, selectedKeys, sourceCounts, candidate, false);
  }

  const uniqueSources = new Set(selected.map(item => item.sourceGroup));

  if (
    selected.length < LIVE_DIGEST_MIN_CARDS ||
    uniqueSources.size < LIVE_DIGEST_MIN_SOURCE_GROUPS
  ) {
    return {
      cards: [],
      reason: selected.length < LIVE_DIGEST_MIN_CARDS
        ? 'live_digest_insufficient_cards'
        : 'live_digest_insufficient_source_diversity',
      candidateCount: pool.length,
      sourceGroupCount: uniqueSources.size,
    };
  }

  return {
    cards: selected.map((candidate, index) => ({
      slot: `L${index + 1}`,
      canonicalId: candidate.canonicalId,
      title: candidate.title,
      canonicalUrl: candidate.canonicalUrl,
      source: candidate.source,
      sourceGroup: candidate.sourceGroup,
      section: candidate.section,
      publishedAt: candidate.publishedAt,
      selectionReason: 'sections_authority_ranked_live_digest',
      deliveryMode: 'LIVE',
    })),
    reason: null,
    candidateCount: pool.length,
    sourceGroupCount: uniqueSources.size,
  };
}

export async function loadDailyDigestLiveFallback({ force = true, nowMs } = {}) {
  try {
    const snapshot = await loadSectionsSnapshot({ force });
    const summary = getSectionsSnapshotRuntimeSummary(snapshot);

    if (summary.stale || summary.totalStories <= 0) {
      return {
        status: 'UNAVAILABLE',
        cards: [],
        reason: summary.stale ? 'sections_snapshot_stale' : 'sections_snapshot_empty',
        summary,
      };
    }

    const selection = selectLiveDigestCards(snapshot, { nowMs });

    if (selection.cards.length === 0) {
      return {
        status: 'UNAVAILABLE',
        cards: [],
        reason: selection.reason,
        summary,
        selection,
      };
    }

    return {
      status: 'READY',
      cards: selection.cards,
      digestDate: null,
      generatedAt: Number(snapshot.fetchedAt || Date.now()),
      summary,
      selection,
    };
  } catch (error) {
    return {
      status: 'UNAVAILABLE',
      cards: [],
      reason: error?.message || String(error),
      summary: null,
    };
  }
}

export const __dailyDigestLiveFallbackInternalsForTest = {
  LIVE_DIGEST_MAX_AGE_MS,
  LIVE_DIGEST_MAX_CARDS,
  LIVE_DIGEST_MIN_CARDS,
  LIVE_DIGEST_MIN_SOURCE_GROUPS,
  MAX_PER_SOURCE_GROUP,
  PRIMARY_SECTION_ORDER,
  DIVERSITY_SECTION_ORDER,
  timestampMs,
  normalizeHttpUrl,
  canonicalKey,
};
