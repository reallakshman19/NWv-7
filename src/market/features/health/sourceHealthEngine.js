/**
 * NWv7 Market Desk R2.1 - WP-09 Passive Source Health Engine
 *
 * Audits all 11 registered sources from sourceRegistry.js under zero-boot silence.
 * Decouples registered rights, user request status, transport results,
 * observation freshness, and reachability.
 *
 * Guarantees:
 * 1. Zero network requests on initialization.
 * 2. Does NOT misinterpret an old receipt as proof of current reachability.
 * 3. Does NOT conflate legal LINK_ONLY or NO_PUBLICATION rights with provider failure.
 * 4. Does NOT mislabel generic fetch failures as BLOCKED_BY_CORS.
 */

import { MARKET_SOURCES } from '../../registry/sourceRegistry.js';
import { RECORD_CLASSES } from './receiptsLedger.js';
import { sanitizeSourceUrl } from './privacyGuard.js';

export const ALL_SOURCE_IDS = Object.freeze(Object.keys(MARKET_SOURCES));

/**
 * Builds the initial passive state for all 11 registered sources.
 * Executes zero network requests.
 */
export function buildInitialSourceStates() {
  const states = {};

  for (const [id, meta] of Object.entries(MARKET_SOURCES)) {
    states[id] = {
      sourceId: id,
      publisher: meta.publisher,
      accessMode: meta.accessMode,
      rights: meta.rights,
      allowedActions: [...meta.actions],
      officialUrl: sanitizeSourceUrl(meta.url),
      policyNotes: meta.notes,
      requestStatus: 'NOT_REQUESTED',
      lastTransportStatus: null,
      lastResult: 'UNKNOWN',
      observationStatus: meta.rights === 'NO_PUBLICATION'
        ? 'NO_RIGHTS'
        : meta.accessMode === 'OFFICIAL_LINK'
        ? 'LINK_ONLY'
        : meta.accessMode === 'PROVIDER_EMBED'
        ? 'EMBED_ONLY'
        : 'NOT_REQUESTED',
      providerAsOf: null,
      providerClockGranularity: 'instant',
      lastChecked: null,
      currentReachability: 'UNKNOWN', // Passive monitor cannot claim live reachability
      reasonCode: null,
      errorDetails: []
    };
  }

  return states;
}

/**
 * Updates source state from a processed receipt or activity log record.
 */
export function applyReceiptToSourceState(sourceState, logRecord) {
  if (!sourceState || !logRecord) return sourceState;

  const next = { ...sourceState };

  if (logRecord.recordClass === RECORD_CLASSES.VALID_RECEIPT && logRecord.receipt) {
    const r = logRecord.receipt;
    next.requestStatus = 'REQUESTED';
    next.lastTransportStatus = r.transportStatus;
    next.lastChecked = r.checkedAt || logRecord.capturedAt;
    next.reasonCode = r.reasonCode;
    next.errorDetails = [];
    if (r.state === 'FAILED' || r.state === 'BLOCKED') {
      next.lastResult = 'REQUEST_FAILED';
      // Keep the original date of any last qualified observation. A failed
      // refresh is not proof that old data became current or disappeared.
      if (!next.providerAsOf) next.observationStatus = 'FAILED';
    } else {
      next.lastResult = r.state === 'UNVERIFIED' ? 'UNVERIFIED' : 'SUCCESS';
      if (r.providerAsOf) {
        next.providerAsOf = r.providerAsOf;
        next.providerClockGranularity = r.providerClockGranularity;
      }
      next.observationStatus = r.state;
    }
  } else if (logRecord.recordClass === RECORD_CLASSES.REJECTED_ATTEMPT) {
    next.requestStatus = 'REQUESTED';
    next.lastResult = 'REQUEST_FAILED';
    next.lastChecked = logRecord.capturedAt;
    next.errorDetails = [...(logRecord.errors || [])];
    if (next.observationStatus !== 'READY') {
      next.observationStatus = 'FAILED';
    }
  }

  return next;
}

/**
 * Hydrates passive source states from a list of stored activity log records.
 */
export function hydrateSourceStates(records = []) {
  const states = buildInitialSourceStates();
  if (!Array.isArray(records)) return states;

  // Process in chronological order (oldest to newest)
  const chronological = [...records].reverse();
  for (const rec of chronological) {
    const id = rec?.receipt?.sourceId || rec?.sourceId;
    if (id && states[id]) {
      states[id] = applyReceiptToSourceState(states[id], rec);
    }
  }

  return states;
}
