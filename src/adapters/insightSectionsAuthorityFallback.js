import {
  getSectionsSnapshotRuntimeSummary,
  loadSectionsSnapshot,
} from './sectionsSnapshotFetcher.js';
import { isAuthorityStoryUsable } from './sectionsSnapshotAuthority.js';

const HOUR_MS = 60 * 60 * 1000;
// Sections publication is already bounded to ten sections of thirty stories.
// A second forty-story slot cap used to discard older corroborating reports
// merely because many newer headlines shared the same acquisition window.
const MAX_AUTHORITY_STORIES = 300;
const MAX_INPUT_ROWS_PER_SECTION = 300;

const SLOT_WINDOWS = Object.freeze({
  now: { minAgeMs: 0, maxAgeMs: 4 * HOUR_MS },
  minus4h: { minAgeMs: 4 * HOUR_MS, maxAgeMs: 12 * HOUR_MS },
  minus12h: { minAgeMs: 12 * HOUR_MS, maxAgeMs: 24 * HOUR_MS },
  minus24h: { minAgeMs: 24 * HOUR_MS, maxAgeMs: 36 * HOUR_MS },
  minus36h: { minAgeMs: 36 * HOUR_MS, maxAgeMs: 48 * HOUR_MS },
  minus48h: { minAgeMs: 48 * HOUR_MS, maxAgeMs: 60 * HOUR_MS },
});

const SECTION_PRIORITY = Object.freeze([
  'topStories',
  'india',
  'tn',
  'trichy',
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

export function buildSectionsAuthorityInsightPool(snapshot, nowMs = Date.now()) {
  const sections = snapshot?.sections && typeof snapshot.sections === 'object'
    ? snapshot.sections
    : {};

  const seen = new Set();
  const stories = [];

  for (const sectionKey of SECTION_PRIORITY) {
    for (const item of asArray(sections?.[sectionKey]).slice(0, MAX_INPUT_ROWS_PER_SECTION)) {
      const publishedAt = storyTimestampMs(item);
      const title = normalizeText(item?.title || item?.headline);
      const url = normalizeText(item?.url || item?.link || item?.guid);
      const key = canonicalStoryKey(item);

      // Insight has a 36h horizon independent of Top Stories ranking.
      if (!key || !title || !url || publishedAt <= 0 || publishedAt > nowMs ||
          !isAuthorityStoryUsable(item, 'insight', nowMs) || seen.has(key)) continue;
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

  stories.sort((a, b) => b.publishedAt - a.publishedAt || a.id.localeCompare(b.id));
  if (stories.length <= MAX_AUTHORITY_STORIES) return stories;

  // Oversized authorities retain evidence from every usable time window.
  // Total normalization work stays bounded, with no publisher-credit change.
  const buckets = Object.values(SLOT_WINDOWS).map(window => stories.filter(story => {
    const age = nowMs - story.publishedAt;
    return age >= window.minAgeMs && age < window.maxAgeMs;
  }));
  const selected = [];
  for (let index = 0; selected.length < MAX_AUTHORITY_STORIES; index += 1) {
    let added = false;
    for (const bucket of buckets) {
      if (bucket[index] && selected.length < MAX_AUTHORITY_STORIES) {
        selected.push(bucket[index]);
        added = true;
      }
    }
    if (!added) break;
  }
  return selected.sort((a, b) => b.publishedAt - a.publishedAt || a.id.localeCompare(b.id));
}

export function createSectionsAuthorityInsightRawFetcher(snapshot) {
  return async (slot) => {
    const referenceMs = Date.now();
    const pool = buildSectionsAuthorityInsightPool(snapshot, referenceMs);
    const window = SLOT_WINDOWS[slot];
    if (!window) return [];

    const inWindow = pool.filter(story => {
      const ageMs = referenceMs - Number(story.publishedAt || 0);
      return ageMs >= window.minAgeMs && ageMs < window.maxAgeMs;
    });
    return inWindow.map(story => ({ ...story, _snapshotObservedAt: referenceMs }));
  };
}

export async function loadSectionsAuthorityInsightFallback({ force = true } = {}) {
  try {
    const snapshot = await loadSectionsSnapshot({ force });
    const runtimeSummary = getSectionsSnapshotRuntimeSummary(snapshot);

    if (runtimeSummary.stale || runtimeSummary.totalStories <= 0) return null;

    const referenceMs = Date.now();
    const pool = buildSectionsAuthorityInsightPool(snapshot, referenceMs);
    if (!pool.some(story => referenceMs - story.publishedAt < SLOT_WINDOWS.minus24h.maxAgeMs)) return null;

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
  MAX_AUTHORITY_STORIES,
  MAX_INPUT_ROWS_PER_SECTION,
};
