import { consumeSectionsSnapshotBudgetExit } from '../adapters/sectionsSnapshotFetcher.js';
import { isLiveMode } from '../utils/fetchMode.js';

export const SERVED_FROM = Object.freeze({
  MEMORY_CACHE: 'memory-cache',
  IN_FLIGHT: 'in-flight',
  STATIC_SNAPSHOT: 'static-snapshot',
  STALE_FALLBACK: 'stale-fallback',
  LIVE_FALLBACK: 'live-fallback',
  LIVE_RSS: 'live-rss',
  EMPTY: 'empty',
  ERROR: 'error',
});

export const REQUIRED_FETCH_PHASES = Object.freeze([
  'memory-cache-hit',
  'in-flight-wait',
  'hybrid-static-snapshot-start',
  'hybrid-static-snapshot-hit',
  'hybrid-stale-fallback',
  'hybrid-snapshot-budget-exceeded',
  'static-host-empty',
  'live-rss-start',
  'live-rss-feed-settled',
  'live-rss-timeout',
  'ranking-start',
  'ranking-complete',
  'ranking-fallback',
]);

const EXTRA_DIAGNOSTIC_FIELDS = [
  'snapshotBudgetExceeded',
  'snapshotElapsedMs',
  'snapshotBudgetMs',
  'liveRssAttempted',
  'liveRssDurationMs',
  'failedFeedCount',
  'successfulFeedCount',
  'timedOutFeedCount',
  'proxyFallbackReason',
  'sectionFetchDurationMs',
];

function copyExtraFields(target, details = {}) {
  EXTRA_DIAGNOSTIC_FIELDS.forEach(field => {
    if (details[field] !== undefined) target[field] = details[field];
  });
  return target;
}

function inferServedFrom(result, budgetExit) {
  if (budgetExit && Array.isArray(result) && result.length > 0) return SERVED_FROM.LIVE_FALLBACK;
  if (budgetExit) return SERVED_FROM.EMPTY;
  if (result?.prefetched && result?.staleReason && Array.isArray(result) && result.length > 0) return SERVED_FROM.STALE_FALLBACK;
  if (result?.prefetched && Array.isArray(result) && result.length === 0) return SERVED_FROM.EMPTY;
  if (result?.prefetched) return SERVED_FROM.STATIC_SNAPSHOT;
  if (Array.isArray(result) && result.length === 0) return SERVED_FROM.EMPTY;
  return SERVED_FROM.LIVE_RSS;
}

function addInferredPhases(trace, servedFrom, details = {}) {
  if (servedFrom === SERVED_FROM.STATIC_SNAPSHOT) {
    markFetchPhase(trace, 'hybrid-static-snapshot-start');
    markFetchPhase(trace, 'hybrid-static-snapshot-hit');
  } else if (servedFrom === SERVED_FROM.STALE_FALLBACK) {
    markFetchPhase(trace, 'hybrid-static-snapshot-start');
    markFetchPhase(trace, 'hybrid-stale-fallback');
  } else if (servedFrom === SERVED_FROM.EMPTY) {
    if (details.snapshotBudgetExceeded) markFetchPhase(trace, 'hybrid-snapshot-budget-exceeded', details);
    markFetchPhase(trace, 'static-host-empty');
  } else if (servedFrom === SERVED_FROM.LIVE_FALLBACK) {
    if (details.snapshotBudgetExceeded) markFetchPhase(trace, 'hybrid-snapshot-budget-exceeded', details);
    markFetchPhase(trace, 'live-rss-start');
    markFetchPhase(trace, 'live-rss-feed-settled', details);
  } else if (servedFrom === SERVED_FROM.LIVE_RSS) {
    markFetchPhase(trace, 'live-rss-start');
    markFetchPhase(trace, details.timedOutFeedCount > 0 ? 'live-rss-timeout' : 'live-rss-feed-settled', details);
  }
  if (servedFrom === SERVED_FROM.ERROR) {
    markFetchPhase(trace, 'ranking-fallback');
  } else if (servedFrom === SERVED_FROM.LIVE_RSS || servedFrom === SERVED_FROM.LIVE_FALLBACK || servedFrom === SERVED_FROM.STATIC_SNAPSHOT || servedFrom === SERVED_FROM.STALE_FALLBACK) {
    markFetchPhase(trace, 'ranking-start');
    markFetchPhase(trace, 'ranking-complete');
  }
}

function buildCanonicalSectionDiagnostics(cacheKey, startedAt, result) {
  const budgetExit = consumeSectionsSnapshotBudgetExit(cacheKey);
  const servedFrom = inferServedFrom(result, budgetExit);
  const durationMs = Date.now() - startedAt;
  const liveRssAttempted = servedFrom === SERVED_FROM.LIVE_RSS || servedFrom === SERVED_FROM.LIVE_FALLBACK;
  const details = {
    servedFrom,
    fallbackReason: budgetExit?.fallbackReason || result?.staleReason || null,
    snapshotBudgetExceeded: Boolean(budgetExit?.snapshotBudgetExceeded),
    snapshotElapsedMs: budgetExit?.snapshotElapsedMs,
    snapshotBudgetMs: budgetExit?.snapshotBudgetMs,
    liveRssAttempted,
    liveRssDurationMs: liveRssAttempted ? durationMs : 0,
    failedFeedCount: null,
    successfulFeedCount: null,
    timedOutFeedCount: null,
    proxyFallbackReason: budgetExit?.fallbackReason || null,
    sectionFetchDurationMs: durationMs,
  };
  const trace = createFetchTrace({
    datasetId: 'sections',
    section: String(cacheKey || ''),
    fetchMode: isLiveMode() ? 'live' : 'hybrid',
    nowMs: startedAt,
  });
  addInferredPhases(trace, servedFrom, details);
  return { trace, details };
}

function shouldDecorateCanonicalResult(result) {
  if (!Array.isArray(result) || result.fetchDiagnostics) return false;
  if (result.length === 0) return true;
  return result.every(item => item && typeof item === 'object');
}

export function createFetchTrace({ datasetId, section, fetchMode, nowMs = Date.now() }) {
  return {
    datasetId,
    section,
    fetchMode,
    startedAt: nowMs,
    phases: [],
  };
}

export function markFetchPhase(trace, phase, details = {}, nowMs = Date.now()) {
  if (!trace) return trace;
  trace.phases.push({
    phase,
    durationMs: Math.max(0, nowMs - trace.startedAt),
    ...details,
  });
  return trace;
}

export function makeFetchDiagnostics(trace, details = {}, nowMs = Date.now()) {
  const durationMs = trace ? Math.max(0, nowMs - trace.startedAt) : 0;
  return copyExtraFields({
    fetchMode: trace?.fetchMode || details.fetchMode || 'unknown',
    datasetId: trace?.datasetId || details.datasetId || '',
    section: trace?.section || details.section || '',
    servedFrom: details.servedFrom || SERVED_FROM.ERROR,
    durationMs,
    phases: [...(trace?.phases || [])],
    ageMs: Number.isFinite(details.ageMs) ? details.ageMs : null,
    staleReason: details.staleReason || null,
    fallbackReason: details.fallbackReason || null,
  }, details);
}

export function attachFetchDiagnostics(result, trace, details = {}) {
  const diagnostics = makeFetchDiagnostics(trace, details);
  if (!result || typeof result !== 'object') return result;
  result.fetchDiagnostics = diagnostics;
  result.servedFrom = diagnostics.servedFrom;
  result.fetchMode = diagnostics.fetchMode;
  result.ageMs = diagnostics.ageMs;
  result.staleReason = diagnostics.staleReason;
  result.fallbackReason = diagnostics.fallbackReason;
  copyExtraFields(result, diagnostics);
  return result;
}

export async function withInFlightCleanup(inFlightMap, cacheKey, resolveInFlight, action) {
  const startedAt = Date.now();
  try {
    const result = await action();
    if (shouldDecorateCanonicalResult(result)) {
      const { trace, details } = buildCanonicalSectionDiagnostics(cacheKey, startedAt, result);
      return attachFetchDiagnostics(result, trace, details);
    }
    return result;
  } finally {
    inFlightMap.delete(cacheKey);
    if (resolveInFlight) resolveInFlight();
  }
}
