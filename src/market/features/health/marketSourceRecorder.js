/**
 * Connect on-demand browser acquisitions with the bounded, client-local
 * Data Health ledger. Receipt writes are best effort and must never alter
 * successful provider data or turn a failed request into a success.
 */
import { createSourceReceipt, validateSourceReceipt } from '../../contracts/sourceReceipt.js';
import { getMarketSource } from '../../registry/sourceRegistry.js';
import { healthStore } from './healthStore.js';

export function recordMarketSourceReceipt(receipt) {
  if (!receipt || !validateSourceReceipt(receipt).ok) {
    return { ok: false, error: 'UNQUALIFIED_RECEIPT' };
  }
  try {
    return healthStore.recordReceipt(receipt);
  } catch {
    return { ok: false, error: 'RECEIPT_STORAGE_UNAVAILABLE' };
  }
}

export function recordMarketSourceFailure(sourceId, error, requestedAt = Date.now()) {
  // User cancellation is not a provider health failure.
  if (error?.name === 'AbortError') return { ok: false, skipped: 'ABORTED' };
  if (error?.isLocalCooldown) return { ok: false, skipped: 'LOCAL_COOLDOWN' };
  const source = getMarketSource(sourceId);
  if (!source) return { ok: false, error: 'UNKNOWN_SOURCE' };

  const started = Number.isFinite(requestedAt) && requestedAt <= Date.now()
    ? requestedAt : Date.now();
  const httpStatus = Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599
    ? error.status : null;
  const failure = createSourceReceipt({
    sourceId,
    publisher: source.publisher,
    accessMode: source.accessMode,
    rights: source.rights,
    state: 'FAILED',
    validity: 'UNKNOWN',
    // Never invent an observation clock on provider failure.
    providerAsOf: null,
    requestedAt: new Date(started).toISOString(),
    checkedAt: new Date().toISOString(),
    transportStatus: httpStatus,
    originalUrl: source.url || null,
    reasonCode: httpStatus === 429 ? 'HTTP_429'
      : httpStatus ? 'HTTP_ERROR' : 'SOURCE_REQUEST_FAILED'
  });
  return failure.ok ? recordMarketSourceReceipt(failure.receipt)
    : { ok: false, error: 'INVALID_FAILURE_RECEIPT' };
}

/**
 * Record a validated dated historical observation or an undated search result.
 * Undated search/list responses must never be called fresh market observations.
 */
export function recordMarketSourceObservation({
  sourceId,
  providerAsOf = null,
  requestedAt = Date.now(),
  sourceUrl = null,
  state = 'HISTORICAL'
} = {}) {
  const source = getMarketSource(sourceId);
  if (!source || !['HISTORICAL', 'UNVERIFIED', 'NO_RESULTS'].includes(state)) {
    return { ok: false, error: 'INVALID_OBSERVATION_STATE' };
  }
  const dated = state === 'HISTORICAL';
  const receipt = createSourceReceipt({
    sourceId,
    publisher: source.publisher,
    accessMode: source.accessMode,
    rights: source.rights,
    state,
    validity: state === 'UNVERIFIED' ? 'UNKNOWN' : 'VALID',
    providerAsOf: dated ? providerAsOf : null,
    providerClockGranularity: 'day',
    requestedAt: new Date(requestedAt).toISOString(),
    checkedAt: new Date().toISOString(),
    transportStatus: 200,
    originalUrl: sourceUrl || source.url
  });
  return receipt.ok ? recordMarketSourceReceipt(receipt.receipt)
    : { ok: false, error: receipt.errors.join(', ') };
}
