import {
  clearSectionsSnapshotLoadCache,
  getRemainingBudgetMs,
  isSupportedSectionsSnapshot,
  loadSectionsSnapshot,
  makeBudgetError,
  makeBudgetExit,
  SECTION_SNAPSHOT_FOREGROUND_BUDGET_MS,
  SECTION_SNAPSHOT_RETRY_BACKOFF_MS,
} from './sectionsSnapshotLoader.js';

export {
  loadSectionsSnapshot,
  SECTION_SNAPSHOT_FOREGROUND_BUDGET_MS,
  SECTION_SNAPSHOT_RETRY_BACKOFF_MS,
};

export const SECTION_SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const SECTION_ITEM_MAX_AGE_MS = 36 * 60 * 60 * 1000;
export const TOP_STORIES_ITEM_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const TOP_STORIES_WARN_AGE_MS = 6 * 60 * 60 * 1000;

const SECTION_ALIASES = {
  chennai: 'tn',
  tamilnadu: 'tn',
  tamilNadu: 'tn',
  social: 'technology',
  buzz: 'technology',
  top: 'topStories',
  topstories: 'topStories',
  topStories: 'topStories',
  local: 'muscat',
  oman: 'muscat',
};

const LOW_CONFIDENCE_TIMESTAMP_SOURCES = new Set([
  'missing',
  'invalid',
  'fetch_time_fallback',
  'unknown',
]);

const snapshotBudgetExitBySection = new Map();

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function hash(value) {
  const text = String(value || '');
  let h = 0;
  for (let index = 0; index < text.length; index += 1) {
    h = (h << 5) - h + text.charCodeAt(index);
    h |= 0;
  }
  return String(h);
}

function normalizeSectionKey(section) {
  const key = String(section || '').trim();
  return SECTION_ALIASES[key] || SECTION_ALIASES[key.toLowerCase()] || key;
}

function sectionSnapshotAgeMs(snapshot) {
  return Math.max(0, Date.now() - Number(snapshot?.fetchedAt || 0));
}

function isSectionsSnapshotFresh(snapshot, maxAgeMs = SECTION_SNAPSHOT_MAX_AGE_MS) {
  if (!isSupportedSectionsSnapshot(snapshot)) return false;
  const fetchedAt = Number(snapshot?.fetchedAt || 0);
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return false;
  const ageMs = Date.now() - fetchedAt;
  // A future-dated acquisition timestamp must not extend the freshness lease.
  return ageMs >= 0 && ageMs <= maxAgeMs;
}

function itemTimestampMs(item) {
  const raw = Number(item?.publishedAt || item?.pubDate || item?.date || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw < 10_000_000_000 ? raw * 1000 : raw;
}

function isLowConfidenceTimestamp(item) {
  const explicitConfidence = String(item?.timestampConfidence || '').toLowerCase();
  if (explicitConfidence === 'low') return true;
  const source = String(item?.publishedAtSource || item?.timestampSource || '').toLowerCase();
  if (LOW_CONFIDENCE_TIMESTAMP_SOURCES.has(source)) return true;
  return itemTimestampMs(item) <= 0;
}

function isLiveLikeStory(item) {
  const text = `${item?.title || item?.headline || ''} ${item?.summary || item?.description || ''}`;
  return Boolean(
    item?.isBreaking ||
    Number(item?.breakingScore || 0) > 0 ||
    /^live\b/i.test(text) ||
    /\b(live\s+blog|live\s+updates?|live\s+coverage|developing|ongoing)\b/i.test(text) ||
    String(item?.url || item?.link || '').includes('/live/')
  );
}

function maxAgeForSection(sourceSection, item) {
  if (sourceSection === 'topStories') {
    return isLiveLikeStory(item) ? SECTION_ITEM_MAX_AGE_MS : TOP_STORIES_ITEM_MAX_AGE_MS;
  }
  return SECTION_ITEM_MAX_AGE_MS;
}

function isFreshSectionItem(item, sourceSection = '', now = Date.now()) {
  const publishedAt = itemTimestampMs(item);
  if (!publishedAt) return false;
  // Missing/low-confidence and future publisher times are unqualified in EVERY section.
  if (isLowConfidenceTimestamp(item)) return false;
  const ageMs = now - publishedAt;
  return ageMs >= 0 && ageMs <= maxAgeForSection(sourceSection, item);
}

function recordSnapshotBudgetExit(section, error) {
  const budgetExit = makeBudgetExit(error);
  if (!budgetExit) return;
  snapshotBudgetExitBySection.set(String(section || ''), budgetExit);
  snapshotBudgetExitBySection.set(normalizeSectionKey(section), budgetExit);
}

function normalizePrefetchedSectionItem(item, requestedSection, sourceSection) {
  const title = safeText(item.title || item.headline, 'Untitled');
  const description = safeText(item.description || item.summary, '');
  const url = safeText(item.url || item.link || item.guid, '');
  const source = safeText(item.source || item.sourceGroup, 'Unknown');
  const publishedAt = itemTimestampMs(item);
  return {
    ...item,
    id: safeText(item.id || hash(url || title)),
    title,
    headline: title,
    description,
    summary: description,
    link: url,
    url,
    source,
    sourceGroup: safeText(item.sourceGroup || source, source),
    publishedAt,
    fetchedAt: Number(item.fetchedAt || Date.now()),
    time: publishedAt ? new Date(publishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unknown',
    section: requestedSection,
    sourceSection,
    impactScore: Number(item.impactScore || 0),
    imageUrl: item.imageUrl || item.image || null,
    _prefetchedSection: true,
  };
}

export function getSectionsSnapshotRuntimeSummary(snapshot) {
  const sections = snapshot?.sections && typeof snapshot.sections === 'object' ? snapshot.sections : {};
  return {
    schemaVersion: Number(snapshot?.schemaVersion || 0),
    supported: isSupportedSectionsSnapshot(snapshot),
    fetchedAt: Number(snapshot?.fetchedAt || 0),
    ageMs: sectionSnapshotAgeMs(snapshot),
    stale: !isSectionsSnapshotFresh(snapshot),
    contentHash: snapshot?.contentHash || '',
    sectionCount: Object.keys(sections).length,
    totalStories: Object.values(sections).reduce((sum, items) => sum + safeArray(items).length, 0),
    hasSectionQuality: Boolean(snapshot?.sectionQuality),
    sectionQuality: snapshot?.sectionQuality || null,
    dataSource: snapshot?.runtimeDataSource || {
      requested: 'github_static',
      effective: snapshot?.preview?.dataSource === 'cloudflare_d1'
        ? 'cloudflare_preview'
        : 'github_static',
      fallback: false,
      fallbackReason: null,
    },
    preview: snapshot?.preview || null,
  };
}

export function selectPrefetchedSectionItems(snapshot, section, limit = 10) {
  if (!isSupportedSectionsSnapshot(snapshot)) {
    return {
      items: [],
      sourceSection: normalizeSectionKey(section),
      quality: null,
      summary: getSectionsSnapshotRuntimeSummary(snapshot),
      stale: true,
      staleReason: 'unsupported_snapshot_schema',
    };
  }
  const requestedSection = String(section || '');
  const sourceSection = normalizeSectionKey(section);
  const sectionItems = safeArray(snapshot?.sections?.[sourceSection]);
  const snapshotStale = !isSectionsSnapshotFresh(snapshot);
  const now = Date.now();
  const lowConfidenceTimestampCount = sectionItems.filter(isLowConfidenceTimestamp).length;
  const freshSectionItems = sectionItems.filter(item => isFreshSectionItem(item, sourceSection, now));
  const staleReason = snapshotStale
    ? (sourceSection === 'topStories' ? 'top_stories_snapshot_stale' : 'sections_snapshot_stale')
    : sectionItems.length > 0 && freshSectionItems.length === 0
      ? 'section_items_stale'
      : lowConfidenceTimestampCount > 0 && sourceSection === 'topStories'
        ? 'top_stories_low_confidence_timestamps'
        : null;
  // Snapshot expiration is an absolute admission gate for every section.
  // A fresh article inside an expired generation is not a current headline.
  if (snapshotStale) {
    return {
      items: [],
      sourceSection,
      quality: snapshot?.sectionQuality?.[sourceSection] || null,
      summary: getSectionsSnapshotRuntimeSummary(snapshot),
      stale: true,
      staleReason,
      staleFallback: false,
      blockedBySnapshotStaleness: true,
      staleItemCount: sectionItems.length,
      lowConfidenceTimestampCount,
      itemMaxAgeMs: sourceSection === 'topStories'
        ? TOP_STORIES_ITEM_MAX_AGE_MS : SECTION_ITEM_MAX_AGE_MS,
    };
  }
  // Never repopulate current cards with expired or unverified stories when
  // the last fresh story disappears.
  const candidateItems = freshSectionItems;
  const items = candidateItems
    .map(item => normalizePrefetchedSectionItem(item, requestedSection, sourceSection))
    .sort((a, b) => Number(b.publishedAt || 0) - Number(a.publishedAt || 0))
    .slice(0, Math.max(0, Number(limit || 0)));
  return {
    items,
    sourceSection,
    quality: snapshot?.sectionQuality?.[sourceSection] || null,
    summary: getSectionsSnapshotRuntimeSummary(snapshot),
    stale: Boolean(staleReason),
    staleReason,
    staleFallback: false,
    staleItemCount: Math.max(0, sectionItems.length - freshSectionItems.length),
    lowConfidenceTimestampCount,
    itemMaxAgeMs: sourceSection === 'topStories' ? TOP_STORIES_ITEM_MAX_AGE_MS : SECTION_ITEM_MAX_AGE_MS,
  };
}

export async function fetchPrefetchedSectionNews(section, limit = 10, options = {}) {
  try {
    const snapshot = await loadSectionsSnapshot(options);
    return selectPrefetchedSectionItems(snapshot, section, limit);
  } catch (error) {
    recordSnapshotBudgetExit(section, error);
    throw error;
  }
}

export function consumeSectionsSnapshotBudgetExit(section) {
  const keys = [String(section || ''), normalizeSectionKey(section)];
  const budgetExit = keys.map(key => snapshotBudgetExitBySection.get(key)).find(Boolean) || null;
  keys.forEach(key => snapshotBudgetExitBySection.delete(key));
  return budgetExit;
}

export function clearSectionsSnapshotCache() {
  clearSectionsSnapshotLoadCache();
  snapshotBudgetExitBySection.clear();
}

export const __sectionsSnapshotInternalsForTest = {
  isSectionsSnapshotFresh,
  isFreshSectionItem,
  isLowConfidenceTimestamp,
  itemTimestampMs,
  getRemainingBudgetMs,
  makeBudgetError,
  makeBudgetExit,
};

export default fetchPrefetchedSectionNews;
