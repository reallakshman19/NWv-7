import { recordDiagnostic } from './diagnosticsStore.js';

export const UP_AHEAD_DIRECT_PAGE_EVENT = 'upAheadDataset.direct_page_load';
const EDGE_EVENT = 'upAheadDataset.api_edge_diagnostics';

/**
 * The actual /up-ahead route calls upAheadDataset.load() directly instead of
 * useDataset(). Publish a compact receipt so Data Health can see that run.
 * Never store the raw dataset or user planner entries in diagnostics.
 */
let nextDirectAttempt = 0;

function compactEdge(details) {
  if (!details || typeof details !== 'object') return null;
  return {
    source: details.source || 'unknown',
    reason: details.reason || 'unknown',
    freshness: details.freshness || 'unknown',
    ageSeconds: details.ageSeconds || 'unknown',
  };
}

/** Tie every direct-page receipt to only its own API attempt, never to an older event. */
export function publishDirectUpAheadEnvelope(envelope, { requestedPagePolicy = 'unknown' } = {}) {
  const attemptId = 'up-ahead-page-' + (++nextDirectAttempt);
  const edge = (envelope?.diagnostics || []).findLast(
    item => item?.event === EDGE_EVENT && item?.details,
  );
  const edgeDetails = compactEdge(edge?.details);
  const edgeEvent = edgeDetails
    ? recordDiagnostic({
      datasetId: 'upAhead',
      event: EDGE_EVENT,
      severity: edge.severity || 'info',
      message: edge.message || 'Direct Up Ahead Worker response',
      details: { ...edgeDetails, attemptId },
    })
    : null;
  const sourceMode = envelope?.data?.sourceMode || 'unknown';
  const transport = sourceMode === 'dataset-api' ? 'worker-http'
    : ['snapshot', 'static'].includes(sourceMode) ? 'published-json'
      : sourceMode === 'cache' ? 'retained-cache' : 'other';
  const details = {
    attemptId,
    edgeDiagnosticEventId: edgeEvent?.id || null,
    edgeApiDiagnostics: edgeDetails,
    ok: envelope?.ok === true,
    source: envelope?.source || 'unknown',
    sourceMode,
    freshness: envelope?.freshness || 'unknown',
    fallbackUsed: Boolean(envelope?.fallbackUsed),
    providerProvenance: {
      transport,
      effectiveProvider: sourceMode === 'dataset-api' ? 'up-ahead-worker'
        : ['snapshot', 'static'].includes(sourceMode) ? 'github-static'
          : sourceMode === 'cache' ? 'retained-cache' : sourceMode,
      upstreamSource: edgeDetails?.source || null,
      requestedPagePolicy,
    },
    payloadHash: envelope?.payloadHash || null,
    fetchedAt: envelope?.fetchedAt || null,
    lastGoodAt: envelope?.lastGoodAt || null,
    validation: envelope?.validation || null,
    slo: envelope?.slo || null,
    error: envelope?.error || null,
  };
  recordDiagnostic({
    datasetId: 'upAhead',
    event: UP_AHEAD_DIRECT_PAGE_EVENT,
    severity: details.ok ? 'info' : 'warn',
    message: 'Up Ahead page provider result',
    details,
  });
  return details;
}

export function getDirectUpAheadEnvelopeEntry(diagnostics = []) {
  const last = [...diagnostics].reverse().find(item =>
    item?.event === UP_AHEAD_DIRECT_PAGE_EVENT
    && item?.datasetId === 'upAhead'
    && item?.details && typeof item.details === 'object');
  if (!last) return null;
  return {
    datasetId: 'upAhead (page)',
    cacheKey: 'upAhead|page-direct',
    origin: 'direct-page',
    capturedAt: last.ts || null,
    envelope: { ...last.details },
  };
}

export function combineDatasetHealthEntries(cached = [], diagnostics = []) {
  const direct = getDirectUpAheadEnvelopeEntry(diagnostics);
  if (!direct) return cached;
  return [...cached.filter(entry => entry.cacheKey !== direct.cacheKey), direct];
}
