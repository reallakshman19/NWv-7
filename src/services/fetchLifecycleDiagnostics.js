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

const EXTRA_DIAGNOSTIC_FIELDS = [
  'snapshotBudgetExceeded',
  'snapshotElapsedMs',
  'snapshotBudgetMs',
];

function copyExtraFields(target, details = {}) {
  EXTRA_DIAGNOSTIC_FIELDS.forEach(field => {
    if (details[field] !== undefined) target[field] = details[field];
  });
  return target;
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
  try {
    return await action();
  } finally {
    inFlightMap.delete(cacheKey);
    if (resolveInFlight) resolveInFlight();
  }
}
