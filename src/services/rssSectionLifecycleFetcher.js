import { fetchPrefetchedSectionNews } from '../adapters/sectionsSnapshotFetcher.js';
import { getRuntimeCapabilities } from '../runtime/runtimeCapabilities.js';
import { getSettings } from '../utils/storage.js';
import { isLiveMode } from '../utils/fetchMode.js';
import { getSectionHealth, recordFetchCount, checkSingleSource } from '../utils/sectionHealth.js';
import { fetchAllEntertainment } from './entertainmentService.js';
import { fetchSectionNews as fetchAggregatorSectionNews } from './rssAggregator.js';
import {
  SERVED_FROM,
  attachFetchDiagnostics,
  createFetchTrace,
  markFetchPhase,
  withInFlightCleanup,
} from './fetchLifecycleDiagnostics.js';

const inFlightFetches = new Map();
const memoryCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
const RSS_FALLBACK_SECTIONS = new Set([
  'world',
  'india',
  'chennai',
  'trichy',
  'local',
  'business',
  'technology',
  'sports',
  'social',
]);

function getCacheKey(section) {
  return String(section || '').trim() || 'unknown';
}

function fromCache(cacheKey, section, limit, trace) {
  const cached = memoryCache.get(cacheKey);
  if (!cached || Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
  const rows = cached.data.slice(0, limit);
  return attachFetchDiagnostics(rows, trace, {
    servedFrom: SERVED_FROM.MEMORY_CACHE,
    ageMs: Date.now() - cached.timestamp,
  });
}

function cacheRows(cacheKey, rows, settings) {
  if (settings.enableCache === false) return;
  memoryCache.set(cacheKey, { timestamp: Date.now(), data: rows });
}

function decoratePrefetchedRows(rows, prefetched, section, servedFrom, trace) {
  rows.prefetched = true;
  rows.prefetchSourceSection = prefetched.sourceSection;
  rows.sectionQuality = prefetched.quality;
  rows.snapshotRuntimeSummary = prefetched.summary;
  rows.staleReason = prefetched.staleReason || null;
  rows.staleFallback = Boolean(prefetched.staleFallback || prefetched.stale);
  rows.health = getSectionHealth(section, rows.length);
  rows.isSingleSource = checkSingleSource(rows);
  return attachFetchDiagnostics(rows, trace, {
    servedFrom,
    ageMs: prefetched.summary?.ageMs,
    staleReason: prefetched.staleReason,
    fallbackReason: prefetched.stale ? 'prefetched-stale' : null,
  });
}

function makeEmptyPrefetched(prefetched, section, trace, reason) {
  const rows = [];
  rows.prefetched = true;
  rows.prefetchSourceSection = prefetched?.sourceSection || section;
  rows.sectionQuality = prefetched?.quality || null;
  rows.snapshotRuntimeSummary = prefetched?.summary || null;
  rows.staleReason = prefetched?.staleReason || reason;
  rows.health = getSectionHealth(section, 0);
  return attachFetchDiagnostics(rows, trace, {
    servedFrom: SERVED_FROM.EMPTY,
    staleReason: rows.staleReason,
    fallbackReason: reason,
  });
}

async function fetchPrefetchedRows(section, limit, settings, trace) {
  if (isLiveMode() || settings.usePrefetchedSections === false) return null;
  markFetchPhase(trace, 'prefetched-snapshot:start');
  const prefetched = await fetchPrefetchedSectionNews(section, Math.max(limit * 3, limit));
  markFetchPhase(trace, 'prefetched-snapshot:done', { itemCount: prefetched.items.length });
  if (prefetched.items.length > 0) {
    const rows = prefetched.items.slice(0, limit);
    const servedFrom = prefetched.stale ? SERVED_FROM.STALE_FALLBACK : SERVED_FROM.STATIC_SNAPSHOT;
    return decoratePrefetchedRows(rows, prefetched, section, servedFrom, trace);
  }
  if (!getRuntimeCapabilities().allowWideFeedFetch) {
    return makeEmptyPrefetched(prefetched, section, trace, prefetched.staleReason || 'prefetched-empty');
  }
  markFetchPhase(trace, 'prefetched-snapshot:live-fallback', { staleReason: prefetched.staleReason || null });
  return null;
}

async function fetchEntertainmentRows(limit, settings, trace) {
  markFetchPhase(trace, 'entertainment-service:start');
  const articles = await fetchAllEntertainment(settings?.entertainment || {});
  markFetchPhase(trace, 'entertainment-service:done', { itemCount: articles.length });
  if (articles.length === 0) return null;
  const rows = articles.slice(0, limit);
  return attachFetchDiagnostics(rows, trace, { servedFrom: SERVED_FROM.LIVE_RSS });
}

async function fetchLiveFallbackRows(section, limit, allowedSources, trace) {
  if (!RSS_FALLBACK_SECTIONS.has(section)) {
    return attachFetchDiagnostics([], trace, {
      servedFrom: SERVED_FROM.EMPTY,
      fallbackReason: 'no-section-feeds',
    });
  }
  markFetchPhase(trace, 'live-rss:start');
  const rows = await fetchAggregatorSectionNews(section, limit, allowedSources);
  markFetchPhase(trace, 'live-rss:done', { itemCount: rows.length });
  return attachFetchDiagnostics(rows, trace, { servedFrom: SERVED_FROM.LIVE_RSS });
}

async function resolveSectionRows(section, limit, allowedSources, settings, trace) {
  try {
    const prefetchedRows = await fetchPrefetchedRows(section, limit, settings, trace);
    if (prefetchedRows) return prefetchedRows;
  } catch (error) {
    markFetchPhase(trace, 'prefetched-snapshot:error', { message: error?.message || String(error) });
    if (!getRuntimeCapabilities().allowWideFeedFetch) {
      return makeEmptyPrefetched(null, section, trace, 'prefetched-unavailable');
    }
  }
  if (section === 'entertainment') {
    const entertainmentRows = await fetchEntertainmentRows(limit, settings, trace);
    if (entertainmentRows) return entertainmentRows;
  }
  return fetchLiveFallbackRows(section, limit, allowedSources, trace);
}

export async function fetchSectionNews(section, limit = 10, allowedSources = null) {
  if (limit === 0) return [];
  const cacheKey = getCacheKey(section);
  const settings = getSettings();
  const trace = createFetchTrace({ datasetId: 'sections', section, fetchMode: isLiveMode() ? 'live' : 'hybrid' });
  const cached = !isLiveMode() && settings.enableCache !== false ? fromCache(cacheKey, section, limit, trace) : null;
  if (cached) return cached;
  if (inFlightFetches.has(cacheKey)) return inFlightFetches.get(cacheKey);
  let resolveInFlight;
  const waitForCleanup = new Promise(resolve => { resolveInFlight = resolve; });
  const promise = withInFlightCleanup(inFlightFetches, cacheKey, resolveInFlight, async () => {
    const rows = await resolveSectionRows(section, limit, allowedSources, settings, trace);
    cacheRows(cacheKey, rows, settings);
    recordFetchCount(section, rows.length);
    return rows;
  });
  inFlightFetches.set(cacheKey, promise.then(result => result).finally(() => waitForCleanup));
  return promise;
}

export function clearLifecycleSectionCache() {
  const size = memoryCache.size;
  memoryCache.clear();
  inFlightFetches.clear();
  return size;
}
