import { recordDiagnostic } from './diagnosticsStore.js';

// A10 operator-only receipts: never store story bodies, credentials or Planner data.
export const PAGE_PROVENANCE_EVENT = 'a10.page_result';
const PAGE_IDS = new Set(['main', 'newspaper']);
const latestFingerprint = new Map();
let sequence = 0;

function compactEnvelope(envelope, extra = {}) {
  const source = typeof envelope?.source === 'string' ? envelope.source : 'unknown';
  const freshness = typeof envelope?.freshness === 'string' ? envelope.freshness : 'unknown';
  const quality = envelope?.validation?.passed === true ? 'passed'
    : envelope?.validation?.passed === false ? 'failed' : 'unknown';
  return {
    ok: envelope?.ok === true,
    source,
    freshness,
    fallbackUsed: Boolean(envelope?.fallbackUsed),
    validation: { passed: quality === 'unknown' ? null : quality === 'passed',
      errors: Array.isArray(envelope?.validation?.errors) ? envelope.validation.errors : [],
      warnings: Array.isArray(envelope?.validation?.warnings) ? envelope.validation.warnings : [] },
    slo: envelope?.slo ? { passed: envelope.slo.passed ?? null, score: envelope.slo.score ?? null,
      reasons: Array.isArray(envelope.slo.reasons) ? envelope.slo.reasons : [] } : null,
    fetchedAt: envelope?.fetchedAt ?? null,
    generatedAt: envelope?.generatedAt ?? null,
    lastGoodAt: envelope?.lastGoodAt ?? null,
    payloadHash: envelope?.payloadHash || null,
    error: typeof envelope?.error === 'string' ? envelope.error : null,
    providerProvenance: {
      transport: typeof extra.transport === 'string' ? extra.transport : 'direct-page',
      effectiveProvider: typeof extra.provider === 'string' ? extra.provider : source,
      requestedMode: typeof extra.requestedMode === 'string' ? extra.requestedMode : 'unknown',
    },
  };
}

export function publishPageProvenance(page, envelope, extra = {}) {
  if (!PAGE_IDS.has(page)) throw new Error('Unsupported A10 page id');
  const payload = compactEnvelope(envelope, extra);
  // Deduplicate render churn, but publish any change of source/epoch/quality.
  const fingerprint = JSON.stringify(payload);
  if (latestFingerprint.get(page) === fingerprint) return null;
  latestFingerprint.set(page, fingerprint);
  const attemptId = 'a10-' + page + '-' + (++sequence);
  return recordDiagnostic({
    datasetId: page,
    event: PAGE_PROVENANCE_EVENT,
    severity: payload.ok && payload.validation.passed === true
      && payload.freshness === 'fresh' ? 'info' : 'warn',
    message: page + ' actual page projection receipt (not a provider authority claim)',
    details: { ...payload, attemptId, page },
  });
}

export function getPageProvenanceEntries(diagnostics = []) {
  const selected = new Map();
  for (const event of [...diagnostics].reverse()) {
    if (event?.event !== PAGE_PROVENANCE_EVENT) continue;
    const page = event?.details?.page;
    if (!PAGE_IDS.has(page) || selected.has(page)) continue;
    selected.set(page, {
      datasetId: page + ' (page)',
      cacheKey: page + '|page-direct',
      origin: 'direct-page',
      capturedAt: event.ts || null,
      envelope: { ...event.details },
    });
  }
  return [...selected.values()];
}

export function combinePageProvenanceEntries(cached = [], diagnostics = []) {
  const direct = getPageProvenanceEntries(diagnostics);
  const keys = new Set(direct.map(row => row.cacheKey));
  return [...cached.filter(row => !keys.has(row.cacheKey)), ...direct];
}

export const __a10PageProvenanceInternalsForTest = { compactEnvelope };
