import { recordDiagnostic } from './diagnosticsStore.js';

export const UP_AHEAD_DIRECT_PAGE_EVENT = 'upAheadDataset.direct_page_load';
const EDGE_EVENT = 'upAheadDataset.api_edge_diagnostics';

/**
 * The actual /up-ahead route calls upAheadDataset.load() directly instead of
 * useDataset(). Publish a compact receipt so Data Health can see that run.
 * Never store the raw dataset or user planner entries in diagnostics.
 */
export function publishDirectUpAheadEnvelope(envelope) {
  const edge = (envelope?.diagnostics || []).findLast(
    item => item?.event === EDGE_EVENT && item?.details,
  );
  if (edge) {
    recordDiagnostic({
      datasetId: 'upAhead',
      event: EDGE_EVENT,
      severity: edge.severity || 'info',
      message: edge.message || 'Direct Up Ahead Worker response',
      details: edge.details,
    });
  }
  const details = {
    ok: envelope?.ok === true,
    source: envelope?.source || 'unknown',
    sourceMode: envelope?.data?.sourceMode || 'unknown',
    freshness: envelope?.freshness || 'unknown',
    fallbackUsed: Boolean(envelope?.fallbackUsed),
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
