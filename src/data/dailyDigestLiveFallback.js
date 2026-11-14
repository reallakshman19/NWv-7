import {
  getSectionsSnapshotRuntimeSummary,
  loadSectionsSnapshot,
} from '../adapters/sectionsSnapshotFetcher.js';
import { getSectionsDataSource } from '../utils/sectionsDataSource.js';

const LIVE_DIGEST_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const LIVE_DIGEST_MIN_CARDS = 3;
const LIVE_DIGEST_MIN_SOURCE_GROUPS = 3;
const STORIES_PER_SOURCE = 10;
const CANONICAL_SNAPSHOT_URL = 'https://raw.githubusercontent.com/reallakshman19/NWv-7/main/public/newsdata/sections_latest.json';
const CANONICAL_SNAPSHOT_TIMEOUT_MS = 2000;

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

function normalizeCandidate(item, section, rank, nowMs) {
  if (!item || typeof item !== 'object') return null;

  const title = text(item.title || item.headline);
  const canonicalUrl = normalizeHttpUrl(item.url || item.link || item.guid);
  const publishedAt = timestampMs(item);
  const ageMs = publishedAt > 0 ? Math.max(0, nowMs - publishedAt) : Infinity;

  const source = text(item.source) || text(item.publisher) || text(item.sourceGroup);
  if (!title || !canonicalUrl || !publishedAt || !source || ageMs > LIVE_DIGEST_MAX_AGE_MS) return null;

  return {
    canonicalId: text(item.canonicalId || item.id || canonicalKey(item)),
    title,
    canonicalUrl,
    source,
    sourceGroup: text(item.sourceGroup, source),
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

function compareDigestStories(a, b) {
  const topStoriesFirst = Number(b.section === 'topStories') - Number(a.section === 'topStories');
  return topStoriesFirst || b.impactScore - a.impactScore || b.publishedAt - a.publishedAt || a.rank - b.rank;
}

export function selectLiveDigestCards(snapshot, options = {}) {
  const pool = buildLiveDigestCandidatePool(snapshot, options);
  const bySource = new Map();
  for (const story of pool) {
    if (!bySource.has(story.sourceGroup)) bySource.set(story.sourceGroup, []);
    bySource.get(story.sourceGroup).push(story);
  }

  if (pool.length < LIVE_DIGEST_MIN_CARDS || bySource.size < LIVE_DIGEST_MIN_SOURCE_GROUPS) {
    return {
      cards: [],
      reason: pool.length < LIVE_DIGEST_MIN_CARDS
        ? 'live_digest_insufficient_cards'
        : 'live_digest_insufficient_source_diversity',
      candidateCount: pool.length,
      sourceGroupCount: bySource.size,
    };
  }

  const sources = [...bySource.values()];
  const fullSources = sources.filter(stories => stories.length >= STORIES_PER_SOURCE);
  const selectedSources = fullSources.length >= LIVE_DIGEST_MIN_SOURCE_GROUPS
    ? fullSources
    : sources.sort((a, b) => b.length - a.length).slice(0, LIVE_DIGEST_MIN_SOURCE_GROUPS);
  const selected = selectedSources.flatMap(stories => stories.sort(compareDigestStories).slice(0, STORIES_PER_SOURCE));

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
    sourceGroupCount: selectedSources.length,
  };
}

function digestFromSnapshot(snapshot, nowMs) {
  const summary = getSectionsSnapshotRuntimeSummary(snapshot);
  if (!summary.supported || summary.stale || summary.totalStories <= 0) {
    let reason = 'sections_snapshot_empty';
    if (summary.stale) reason = 'sections_snapshot_stale';
    if (!summary.supported) reason = 'unsupported_snapshot_schema';
    return { status: 'UNAVAILABLE', cards: [], reason, summary };
  }

  const selection = selectLiveDigestCards(snapshot, { nowMs });
  if (selection.cards.length === 0) {
    return { status: 'UNAVAILABLE', cards: [], reason: selection.reason, summary, selection };
  }

  return {
    status: 'READY',
    cards: selection.cards,
    digestDate: null,
    generatedAt: Number(snapshot.fetchedAt),
    summary,
    selection,
  };
}

function isOfficialPagesDeployment() {
  const location = globalThis.window?.location;
  return location?.origin === 'https://reallakshman19.github.io'
    && (location.pathname === '/NWv-7' || location.pathname.startsWith('/NWv-7/'));
}

async function loadCanonicalDigest(primary, nowMs) {
  try {
    const response = await fetch(CANONICAL_SNAPSHOT_URL, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(CANONICAL_SNAPSHOT_TIMEOUT_MS),
    });
    if (!response.ok) return primary;
    const snapshot = await response.json();
    const digest = digestFromSnapshot({
      ...snapshot,
      runtimeDataSource: {
        requested: primary.summary?.dataSource?.requested || getSectionsDataSource(),
        effective: 'github_main',
        fallback: true,
        fallbackReason: primary.reason,
      },
    }, nowMs);
    return digest.status === 'READY' ? digest : primary;
  } catch {
    return primary;
  }
}

export async function loadDailyDigestLiveFallback({ force = true, nowMs } = {}) {
  let primary;
  try {
    const snapshot = await loadSectionsSnapshot({ force });
    primary = digestFromSnapshot(snapshot, nowMs);
  } catch (error) {
    primary = {
      status: 'UNAVAILABLE',
      cards: [],
      reason: error?.message || String(error),
      summary: null,
    };
  }
  if (primary.status === 'READY' || !isOfficialPagesDeployment()) return primary;
  return loadCanonicalDigest(primary, nowMs);
}

export const __dailyDigestLiveFallbackInternalsForTest = {
  LIVE_DIGEST_MAX_AGE_MS,
  LIVE_DIGEST_MIN_CARDS,
  LIVE_DIGEST_MIN_SOURCE_GROUPS,
  STORIES_PER_SOURCE,
  PRIMARY_SECTION_ORDER,
  timestampMs,
  normalizeHttpUrl,
  canonicalKey,
};
