import {
  getSectionsSnapshotRuntimeSummary,
  loadSectionsSnapshot,
} from './sectionsSnapshotFetcher.js';

const HOUR_MS = 60 * 60 * 1000;

const SLOT_WINDOWS = Object.freeze({
  now: { minAgeMs: 0, maxAgeMs: 4 * HOUR_MS },
  minus4h: { minAgeMs: 4 * HOUR_MS, maxAgeMs: 12 * HOUR_MS },
  minus12h: { minAgeMs: 12 * HOUR_MS, maxAgeMs: 24 * HOUR_MS },
  minus24h: { minAgeMs: 24 * HOUR_MS, maxAgeMs: 36 * HOUR_MS },
});

const SECTION_PRIORITY = Object.freeze([
  'topStories',
  'india',
  'tn',
  'muscat',
  'world',
  'business',
  'technology',
  'sports',
  'entertainment',
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function storyTimestampMs(story) {
  const raw = Number(story?.publishedAt || story?.pubDate || story?.date || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw < 10_000_000_000 ? raw * 1000 : raw;
}

function canonicalStoryKey(story) {
  return normalizeText(
    story?.canonicalUrl ||
    story?.url ||
    story?.link ||
    story?.guid ||
    story?.id ||
    story?.canonicalId ||
    story?.title
  ).toLowerCase();
}

export function buildSectionsAuthorityInsightPool(snapshot) {
  const sections = snapshot?.sections && typeof snapshot.sections === 'object'
    ? snapshot.sections
    : {};

  const seen = new Set();
  const stories = [];

  for (const sectionKey of SECTION_PRIORITY) {
    for (const item of asArray(sections?.[sectionKey])) {
      const publishedAt = storyTimestampMs(item);
      const title = normalizeText(item?.title || item?.headline);
      const url = normalizeText(item?.url || item?.link || item?.guid);
      const key = canonicalStoryKey(item);

      if (!key || !title || !url || publishedAt <= 0 || seen.has(key)) continue;
      seen.add(key);

      const source = normalizeText(item?.source || item?.publisher || item?.sourceGroup, 'Unknown');
      const sourceGroup = normalizeText(item?.sourceGroup || source, 'unknown');

      stories.push({
        ...item,
        id: normalizeText(item?.id || key),
        title,
        headline: title,
        summary: normalizeText(item?.summary || item?.description),
        description: normalizeText(item?.description || item?.summary),
        url,
        link: url,
        publishedAt,
        source,
        sourceGroup,
        category: item?.category || sectionKey,
        _insightSectionsAuthorityFallback: true,
      });
    }
  }

  return stories.sort((a, b) => Number(b.publishedAt || 0) - Number(a.publishedAt || 0));
}

export function createSectionsAuthorityInsightRawFetcher(snapshot) {
  const pool = buildSectionsAuthorityInsightPool(snapshot);
  const referenceMs = Number(snapshot?.fetchedAt || 0) || Date.now();

  return async (slot) => {
    const window = SLOT_WINDOWS[slot];
    if (!window) return [];

    return pool.filter(story => {
      const ageMs = Math.max(0, referenceMs - Number(story.publishedAt || 0));
      return ageMs >= window.minAgeMs && ageMs < window.maxAgeMs;
    });
  };
}

export async function loadSectionsAuthorityInsightFallback({ force = true } = {}) {
  try {
    const snapshot = await loadSectionsSnapshot({ force });
    const runtimeSummary = getSectionsSnapshotRuntimeSummary(snapshot);

    if (runtimeSummary.stale || runtimeSummary.totalStories <= 0) return null;

    const pool = buildSectionsAuthorityInsightPool(snapshot);
    if (pool.length === 0) return null;

    return {
      snapshot,
      pool,
      fetcher: createSectionsAuthorityInsightRawFetcher(snapshot),
      runtimeSummary,
    };
  } catch (error) {
    console.warn(
      '[InsightFetcher] Sections authority fallback unavailable:',
      error?.message || error
    );
    return null;
  }
}

export const __insightSectionsAuthorityFallbackInternalsForTest = {
  SLOT_WINDOWS,
  SECTION_PRIORITY,
  storyTimestampMs,
  canonicalStoryKey,
};
