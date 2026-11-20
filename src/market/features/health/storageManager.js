/**
 * NWv7 Market Desk R2.1 - WP-09 Storage & Migration Manager
 *
 * Implements non-destructive, versioned, conflict-safe watchlist migration,
 * conflict-aware rollback protocol, in-memory saved-funds normalization,
 * and accurate storage usage measurement.
 *
 * Guarantees:
 * 1. Legacy storage keys ('nw7.india-watchlist.v1', 'nw7.market-saved-funds.v1') are NEVER deleted or overwritten.
 * 2. If new user edits exist in 'nw7.market-watchlist.v2', automatic rollback is BLOCKED to prevent data loss.
 * 3. Saved-funds normalization is in-memory only; no unauthorized V2 keys created.
 * 4. Quota failures leave original records intact without silent data corruption.
 */

import {
  MARKET_LEGACY_STORAGE_KEYS,
  MARKET_R21_STORAGE_KEYS,
  MARKET_STORAGE_RULES
} from '../../contracts/storagePolicy.js';
import {
  planLegacyNseWatchlist,
  planLegacySavedFunds,
  canonicalInstrumentKey,
  MAX_SAVED_EQUITIES
} from '../../contracts/instrumentIdentity.js';

export const MIGRATION_JOURNAL_KEY = 'nw7.market-migration-meta.v1';

export const CACHE_KEYS_ALLOWLIST = Object.freeze([
  'nw7.omr-inr.frankfurter.v1',
  'nw7.usd-inr.frankfurter.v1',
  'nw7.market-fund-nav.v1',
  'nw7.market-fund-history.v1',
  'nw7.market-source-receipts.v1'
]);

export const PROTECTED_KEYS_ALLOWLIST = Object.freeze([
  MARKET_LEGACY_STORAGE_KEYS.watchlist,
  MARKET_LEGACY_STORAGE_KEYS.funds,
  MARKET_LEGACY_STORAGE_KEYS.indexPins,
  MARKET_LEGACY_STORAGE_KEYS.settings,
  MARKET_R21_STORAGE_KEYS.portfolio,
  MARKET_R21_STORAGE_KEYS.watchlistV2
]);

/**
 * Deterministic string fingerprint helper.
 */
export function computeFingerprint(data) {
  if (data == null) return 'fp_null_0';
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `fp_${Math.abs(hash).toString(16)}_${str.length}`;
}

/**
 * Pure preview of legacy NSE watchlist migration.
 * Does not read or write storage.
 */
export function previewWatchlistMigration(legacyArray) {
  if (!Array.isArray(legacyArray)) {
    return {
      canMigrate: false,
      legacyCount: 0,
      plannedV2Keys: [],
      rejected: [],
      changed: false
    };
  }

  const plan = planLegacyNseWatchlist(legacyArray, MAX_SAVED_EQUITIES);
  return {
    canMigrate: plan.keys.length > 0,
    legacyCount: legacyArray.length,
    plannedV2Keys: plan.keys,
    rejected: plan.rejected,
    changed: plan.changed
  };
}

/**
 * Executes safe watchlist migration with write verification and journal record.
 * Preserves legacy key bytes intact.
 */
export function executeWatchlistMigration(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return { ok: false, error: 'STORAGE_UNAVAILABLE' };
  }

  const rawLegacy = storage.getItem(MARKET_LEGACY_STORAGE_KEYS.watchlist);
  if (!rawLegacy) {
    return { ok: false, error: 'NO_LEGACY_WATCHLIST', message: 'No legacy watchlist found to migrate.' };
  }

  let parsedLegacy;
  try {
    parsedLegacy = JSON.parse(rawLegacy);
  } catch (err) {
    return {
      ok: false,
      error: 'CORRUPT_LEGACY_DATA',
      message: 'Legacy watchlist contains malformed JSON.',
      cause: err?.message
    };
  }

  if (!Array.isArray(parsedLegacy)) {
    return { ok: false, error: 'INVALID_LEGACY_SCHEMA', message: 'Legacy watchlist is not an array.' };
  }

  const plan = planLegacyNseWatchlist(parsedLegacy, MAX_SAVED_EQUITIES);
  const validatedKeys = [];
  for (const k of plan.keys) {
    const [ex, sym] = k.split(':');
    if (canonicalInstrumentKey(ex, sym)) {
      validatedKeys.push(k);
    }
  }

  const legacyFp = computeFingerprint(rawLegacy);
  const v2String = JSON.stringify(validatedKeys);
  const v2Fp = computeFingerprint(v2String);

  // Attempt atomic write
  try {
    storage.setItem(MARKET_R21_STORAGE_KEYS.watchlistV2, v2String);
  } catch (err) {
    return {
      ok: false,
      error: 'STORAGE_QUOTA_EXCEEDED',
      message: 'Failed to write V2 watchlist due to storage limits.',
      cause: err?.message
    };
  }

  // Verification readback
  const readback = storage.getItem(MARKET_R21_STORAGE_KEYS.watchlistV2);
  if (readback !== v2String) {
    return {
      ok: false,
      error: 'VERIFICATION_READBACK_FAILED',
      message: 'Written V2 data failed immediate readback verification.'
    };
  }

  // Record migration journal metadata
  const journalEntry = {
    migrationId: 'mig_wl_v1_to_v2',
    migratedAt: new Date().toISOString(),
    sourceKey: MARKET_LEGACY_STORAGE_KEYS.watchlist,
    sourceFingerprint: legacyFp,
    targetKey: MARKET_R21_STORAGE_KEYS.watchlistV2,
    postMigrationV2Fingerprint: v2Fp,
    migratedCount: validatedKeys.length,
    revision: 1
  };

  try {
    storage.setItem(MIGRATION_JOURNAL_KEY, JSON.stringify(journalEntry));
  } catch {
    // Journal write failure does not corrupt V2 data
  }

  return {
    ok: true,
    migratedCount: validatedKeys.length,
    rejectedCount: plan.rejected.length,
    v2Keys: validatedKeys,
    rejected: plan.rejected,
    journal: journalEntry
  };
}

/**
 * Checks rollback eligibility and detects post-migration user edits.
 */
export function checkRollbackEligibility(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return { eligible: false, reason: 'STORAGE_UNAVAILABLE' };
  }

  const v2Raw = storage.getItem(MARKET_R21_STORAGE_KEYS.watchlistV2);
  if (!v2Raw) {
    return { eligible: false, reason: 'NO_V2_DATA', message: 'No V2 watchlist present to rollback.' };
  }

  const journalRaw = storage.getItem(MIGRATION_JOURNAL_KEY);
  if (!journalRaw) {
    // No journal recorded: requires explicit force confirm
    return {
      eligible: false,
      reason: 'NO_MIGRATION_JOURNAL',
      message: 'No migration journal found; V2 modifications cannot be verified.'
    };
  }

  let journal;
  try {
    journal = JSON.parse(journalRaw);
  } catch {
    return {
      eligible: false,
      reason: 'CORRUPT_MIGRATION_JOURNAL',
      message: 'Migration journal is unreadable.'
    };
  }

  const currentV2Fp = computeFingerprint(v2Raw);
  if (currentV2Fp !== journal.postMigrationV2Fingerprint) {
    return {
      eligible: false,
      reason: 'CONFLICT_NEW_EDITS_PRESENT',
      message: 'New user edits detected in V2 watchlist. Automatic rollback is blocked to prevent permanent data loss.',
      journalFingerprint: journal.postMigrationV2Fingerprint,
      currentFingerprint: currentV2Fp
    };
  }

  return {
    eligible: true,
    reason: 'UNMODIFIED_POST_MIGRATION',
    journal
  };
}

/**
 * Executes rollback if eligible or forced.
 * Leaves legacy key 100% untouched.
 */
export function rollbackWatchlistMigration(storage, force = false) {
  const eligibility = checkRollbackEligibility(storage);

  if (!eligibility.eligible && !force) {
    return {
      ok: false,
      reason: eligibility.reason,
      message: eligibility.message,
      blocked: true
    };
  }

  try {
    storage.removeItem(MARKET_R21_STORAGE_KEYS.watchlistV2);
    storage.removeItem(MIGRATION_JOURNAL_KEY);
    return {
      ok: true,
      rolledBack: true,
      message: 'V2 watchlist cleanly removed. Legacy watchlist active.'
    };
  } catch (err) {
    return {
      ok: false,
      error: 'STORAGE_WRITE_FAILED',
      message: 'Failed to remove V2 keys from storage.',
      cause: err?.message
    };
  }
}

/**
 * In-memory saved funds normalization adapter.
 * Reads legacy key, normalizes in-memory, NEVER writes back to storage.
 */
export function getNormalizedSavedFunds(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return { codes: [], rejected: [], rawCount: 0 };
  }

  const raw = storage.getItem(MARKET_LEGACY_STORAGE_KEYS.funds);
  if (!raw) return { codes: [], rejected: [], rawCount: 0 };

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { codes: [], rejected: [], rawCount: 0 };
    const plan = planLegacySavedFunds(parsed, MARKET_STORAGE_RULES.maxSavedFunds);
    return {
      codes: plan.codes,
      rejected: plan.rejected,
      rawCount: parsed.length
    };
  } catch {
    return { codes: [], rejected: [], rawCount: 0 };
  }
}

/**
 * Measures exact UTF-8 byte usage for known NWv7 keys without parsing private holdings.
 */
export function getStorageUsageSummary(storage, originEstimate = null) {
  if (!storage || typeof storage.getItem !== 'function') {
    return {
      knownPayloadBytes: 0,
      perKeyBytes: {},
      itemCounts: {},
      estimatedOriginQuotaBytes: null
    };
  }

  const encoder = new TextEncoder();
  const allKnownKeys = [
    ...PROTECTED_KEYS_ALLOWLIST,
    ...CACHE_KEYS_ALLOWLIST,
    MIGRATION_JOURNAL_KEY
  ];

  let totalBytes = 0;
  const perKeyBytes = {};
  const itemCounts = {};

  for (const k of allKnownKeys) {
    try {
      const val = storage.getItem(k);
      if (val != null) {
        const bytes = encoder.encode(val).length;
        perKeyBytes[k] = bytes;
        totalBytes += bytes;

        // Count items without leaking private contents
        if (k === MARKET_R21_STORAGE_KEYS.watchlistV2 || k === MARKET_LEGACY_STORAGE_KEYS.watchlist) {
          try {
            const arr = JSON.parse(val);
            if (Array.isArray(arr)) itemCounts[k] = arr.length;
          } catch {
            itemCounts[k] = 0;
          }
        } else if (k === MARKET_LEGACY_STORAGE_KEYS.funds) {
          try {
            const arr = JSON.parse(val);
            if (Array.isArray(arr)) itemCounts[k] = arr.length;
          } catch {
            itemCounts[k] = 0;
          }
        } else if (k === MARKET_R21_STORAGE_KEYS.receipts) {
          try {
            const arr = JSON.parse(val);
            if (Array.isArray(arr)) itemCounts[k] = arr.length;
          } catch {
            itemCounts[k] = 0;
          }
        }
      }
    } catch {
      // Key unreadable
    }
  }

  return {
    knownPayloadBytes: totalBytes,
    perKeyBytes,
    itemCounts,
    estimatedOriginQuotaBytes: originEstimate != null ? Number(originEstimate) : null
  };
}
