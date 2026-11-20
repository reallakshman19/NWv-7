/**
 * NWv7 Market Desk R2.1 - WP-09 Health & Privacy Reactive Store
 *
 * Implements a referentially stable store compatible with useSyncExternalStore.
 * Coordinates cache purge epochs, in-flight race prevention, and cross-tab broadcasts.
 */

import {
  hydrateSourceStates,
  applyReceiptToSourceState
} from './sourceHealthEngine.js';
import {
  readReceiptsLog,
  appendReceiptRecord,
  getReceiptsLogSummary
} from './receiptsLedger.js';
import {
  executeWatchlistMigration,
  rollbackWatchlistMigration,
  checkRollbackEligibility,
  getStorageUsageSummary,
  getNormalizedSavedFunds,
  CACHE_KEYS_ALLOWLIST
} from './storageManager.js';
import { evaluateMarketQuality } from './honestMarketGrading.js';
import { PRIVACY_DISCLOSURE } from './privacyGuard.js';

class HealthStore {
  constructor() {
    this.listeners = new Set();
    this.currentEpoch = 1;
    this.storage = typeof window !== 'undefined' ? window.localStorage : null;
    this.snapshot = null;
    this.init();
  }

  init() {
    const { records } = readReceiptsLog(this.storage);
    const sourceStates = hydrateSourceStates(records);
    const receiptsSummary = getReceiptsLogSummary(this.storage);
    const storageSummary = getStorageUsageSummary(this.storage);
    const rollbackEligibility = checkRollbackEligibility(this.storage);
    const normalizedFunds = getNormalizedSavedFunds(this.storage);
    const qualityEvaluation = evaluateMarketQuality({ sourceStates, receipts: records });

    this.snapshot = Object.freeze({
      epoch: this.currentEpoch,
      sourceStates: Object.freeze(sourceStates),
      receipts: Object.freeze(records),
      receiptsSummary: Object.freeze(receiptsSummary),
      storageSummary: Object.freeze(storageSummary),
      rollbackEligibility: Object.freeze(rollbackEligibility),
      normalizedFunds: Object.freeze(normalizedFunds),
      qualityEvaluation: Object.freeze(qualityEvaluation),
      privacyDisclosure: PRIVACY_DISCLOSURE
    });

    // Wire cross-tab and in-memory cache listeners if window is available
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.handleStorageEvent);
      window.addEventListener('nw7:cache-cleared', this.handleCacheClearedEvent);
    }
  }

  handleStorageEvent = (event) => {
    if (!event || !event.key) return;
    if (CACHE_KEYS_ALLOWLIST.includes(event.key) || event.key.startsWith('nw7.')) {
      this.refresh();
    }
  };

  handleCacheClearedEvent = (event) => {
    if (event?.detail?.epoch && event.detail.epoch > this.currentEpoch) {
      this.currentEpoch = event.detail.epoch;
    }
    this.refresh();
  };

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => {
    return this.snapshot;
  };

  notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('[HealthStore] Listener error:', err);
      }
    }
  }

  refresh() {
    const { records } = readReceiptsLog(this.storage);
    const sourceStates = hydrateSourceStates(records);
    const receiptsSummary = getReceiptsLogSummary(this.storage);
    const storageSummary = getStorageUsageSummary(this.storage);
    const rollbackEligibility = checkRollbackEligibility(this.storage);
    const normalizedFunds = getNormalizedSavedFunds(this.storage);
    const qualityEvaluation = evaluateMarketQuality({ sourceStates, receipts: records });

    this.snapshot = Object.freeze({
      epoch: this.currentEpoch,
      sourceStates: Object.freeze(sourceStates),
      receipts: Object.freeze(records),
      receiptsSummary: Object.freeze(receiptsSummary),
      storageSummary: Object.freeze(storageSummary),
      rollbackEligibility: Object.freeze(rollbackEligibility),
      normalizedFunds: Object.freeze(normalizedFunds),
      qualityEvaluation: Object.freeze(qualityEvaluation),
      privacyDisclosure: PRIVACY_DISCLOSURE
    });

    this.notify();
  }

  recordReceipt(candidate) {
    const result = appendReceiptRecord(this.storage, candidate);
    if (result.ok && result.processedRecord) {
      const sourceId = result.processedRecord.receipt?.sourceId || result.processedRecord.sourceId;
      const currentSources = { ...this.snapshot.sourceStates };
      if (currentSources[sourceId]) {
        currentSources[sourceId] = applyReceiptToSourceState(currentSources[sourceId], result.processedRecord);
      }
    }
    this.refresh();
    return result;
  }

  migrateWatchlist() {
    const result = executeWatchlistMigration(this.storage);
    this.refresh();
    return result;
  }

  rollbackWatchlist(force = false) {
    const result = rollbackWatchlistMigration(this.storage, force);
    this.refresh();
    return result;
  }

  purgeCaches(target = 'all') {
    if (!this.storage || typeof this.storage.removeItem !== 'function') {
      return { persistentDeleted: false, memoryInvalidated: false, keysPurged: [] };
    }

    this.currentEpoch += 1;
    let targetKeys = [];

    if (target === 'fx') {
      targetKeys = ['nw7.omr-inr.frankfurter.v1', 'nw7.usd-inr.frankfurter.v1'];
    } else if (target === 'nav') {
      targetKeys = ['nw7.market-fund-nav.v1', 'nw7.market-fund-history.v1'];
    } else if (target === 'receipts') {
      targetKeys = ['nw7.market-source-receipts.v1'];
    } else if (target === 'all') {
      targetKeys = [...CACHE_KEYS_ALLOWLIST];
    }

    const deletedKeys = [];
    for (const k of targetKeys) {
      try {
        this.storage.removeItem(k);
        deletedKeys.push(k);
      } catch {
        // Individual key removal failed
      }
    }

    const nowIso = new Date().toISOString();

    // Broadcast invalidation event
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('nw7:cache-cleared', {
          detail: {
            target,
            epoch: this.currentEpoch,
            purgedAt: nowIso,
            keysPurged: deletedKeys
          }
        }));
      } catch {
        // Broadcast failed
      }
    }

    this.refresh();

    return {
      persistentDeleted: true,
      memoryInvalidated: true,
      keysPurged: deletedKeys,
      epoch: this.currentEpoch,
      purgedAt: nowIso
    };
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.handleStorageEvent);
      window.removeEventListener('nw7:cache-cleared', this.handleCacheClearedEvent);
    }
    this.listeners.clear();
  }
}

export const healthStore = new HealthStore();
