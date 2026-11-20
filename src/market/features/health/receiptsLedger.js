/**
 * NWv7 Market Desk R2.1 - WP-09 Local Source Activity Log
 *
 * Implements bounded, client-local activity logging for source receipts.
 * Strictly enforces MARKET_STORAGE_RULES.maxSourceReceipts (100).
 *
 * Note on Integrity:
 * This is a client-side localStorage activity log subject to browser eviction,
 * origin script mutations, and FIFO truncation. It is NOT a tamper-proof
 * forensic audit trail.
 */

import { MARKET_R21_STORAGE_KEYS, MARKET_STORAGE_RULES } from '../../contracts/storagePolicy.js';
import { validateSourceReceipt } from '../../contracts/sourceReceipt.js';
import { sanitizeSourceUrl } from './privacyGuard.js';

export const MAX_RETAINED_RECEIPTS = MARKET_STORAGE_RULES.maxSourceReceipts; // 100
export const RECEIPTS_LOG_STORAGE_KEY = MARKET_R21_STORAGE_KEYS.receipts;

export const RECORD_CLASSES = Object.freeze({
  VALID_RECEIPT: 'VALID_RECEIPT',
  REJECTED_ATTEMPT: 'REJECTED_ATTEMPT',
  STORAGE_DIAGNOSTIC: 'STORAGE_DIAGNOSTIC'
});

/**
 * Normalizes an incoming receipt candidate, validating against WP-00 rules.
 * Separates valid receipts from rejected attempts.
 */
export function processReceiptCandidate(rawCandidate) {
  const check = validateSourceReceipt(rawCandidate);
  const now = new Date().toISOString();

  if (check.ok) {
    return {
      recordClass: RECORD_CLASSES.VALID_RECEIPT,
      capturedAt: now,
      receipt: {
        sourceId: rawCandidate.sourceId,
        publisher: rawCandidate.publisher,
        accessMode: rawCandidate.accessMode,
        rights: rawCandidate.rights,
        state: rawCandidate.state,
        providerAsOf: rawCandidate.providerAsOf || null,
        providerClockGranularity: rawCandidate.providerClockGranularity || 'instant',
        requestedAt: rawCandidate.requestedAt || null,
        checkedAt: rawCandidate.checkedAt || null,
        transportStatus: rawCandidate.transportStatus || null,
        originalUrl: sanitizeSourceUrl(rawCandidate.originalUrl),
        reasonCode: rawCandidate.reasonCode || null,
        validity: rawCandidate.validity || 'VALID'
      },
      errors: []
    };
  }

  return {
    recordClass: RECORD_CLASSES.REJECTED_ATTEMPT,
    capturedAt: now,
    sourceId: rawCandidate?.sourceId || 'unknown',
    attemptedState: rawCandidate?.state || 'UNKNOWN',
    errors: check.errors,
    receipt: null
  };
}

/**
 * Reads existing log entries safely from storage.
 */
export function readReceiptsLog(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return { records: [], corrupt: false };
  }

  const raw = storage.getItem(RECEIPTS_LOG_STORAGE_KEY);
  if (!raw) return { records: [], corrupt: false };

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { records: [], corrupt: true };
    return { records: parsed, corrupt: false };
  } catch {
    return { records: [], corrupt: true };
  }
}

/**
 * Appends a new activity record to the log, enforcing the 100-record FIFO limit.
 */
export function appendReceiptRecord(storage, candidate) {
  if (!storage || typeof storage.setItem !== 'function') {
    return { ok: false, error: 'STORAGE_UNAVAILABLE' };
  }

  const processed = processReceiptCandidate(candidate);
  const { records, corrupt } = readReceiptsLog(storage);

  // Prepend newest record
  const updated = [processed, ...records];
  let discardedCount = 0;

  if (updated.length > MAX_RETAINED_RECEIPTS) {
    discardedCount = updated.length - MAX_RETAINED_RECEIPTS;
    updated.length = MAX_RETAINED_RECEIPTS;
  }

  try {
    storage.setItem(RECEIPTS_LOG_STORAGE_KEY, JSON.stringify(updated));
    return {
      ok: true,
      processedRecord: processed,
      retainedCount: updated.length,
      discardedCount,
      wasPruned: discardedCount > 0,
      corruptFound: corrupt
    };
  } catch (err) {
    return {
      ok: false,
      error: 'STORAGE_WRITE_FAILED',
      message: 'Failed to write receipt to localStorage.',
      cause: err?.message
    };
  }
}

/**
 * Generates an activity log summary.
 */
export function getReceiptsLogSummary(storage) {
  const { records, corrupt } = readReceiptsLog(storage);
  const validCount = records.filter(r => r.recordClass === RECORD_CLASSES.VALID_RECEIPT).length;
  const rejectedCount = records.filter(r => r.recordClass === RECORD_CLASSES.REJECTED_ATTEMPT).length;

  let oldestClock = null;
  let newestClock = null;

  for (const r of records) {
    const clock = r.capturedAt || r.receipt?.checkedAt;
    if (clock) {
      if (!newestClock || clock > newestClock) newestClock = clock;
      if (!oldestClock || clock < oldestClock) oldestClock = clock;
    }
  }

  return {
    totalRetained: records.length,
    validReceiptCount: validCount,
    rejectedAttemptCount: rejectedCount,
    oldestRetainedClock: oldestClock,
    newestRetainedClock: newestClock,
    maxRetainedLimit: MAX_RETAINED_RECEIPTS,
    isPruned: records.length >= MAX_RETAINED_RECEIPTS,
    corruptEncountered: corrupt,
    disclaimer: 'Showing up to 100 most recent records. Earlier records are automatically discarded by FIFO pruning.'
  };
}

/**
 * Clears the receipts log safely.
 */
export function clearReceiptsLog(storage) {
  if (!storage || typeof storage.removeItem !== 'function') return false;
  try {
    storage.removeItem(RECEIPTS_LOG_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
