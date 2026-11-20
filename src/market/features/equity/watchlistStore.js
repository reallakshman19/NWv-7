/**
 * Shared in-memory and versioned storage store for the NSE Equity Watchlist.
 * Ensures synchronization between Overview (WatchlistSummary) and Full Workspace (EquityResearchPanel).
 *
 * Implements P0-01 storage contract:
 * - Authoritative record: nw7.market-watchlist.v2 envelope.
 * - Non-destructive in-memory normalization of legacy nw7.india-watchlist.v1 without disk modification.
 * - Graceful degradation to session memory when localStorage throws.
 */
import { useSyncExternalStore } from 'react';
import { planLegacyNseWatchlist } from '../../contracts/instrumentIdentity.js';
import { toCanonicalKey, fromCanonicalKey, MAX_WATCHLIST_LIMIT } from './equityModel.js';

export const WATCHLIST_V2_KEY = 'nw7.market-watchlist.v2';
export const WATCHLIST_V1_KEY = 'nw7.india-watchlist.v1';

export function createWatchlistStore({
  storage = (typeof window !== 'undefined' ? window.localStorage : null),
  storageKeyV2 = WATCHLIST_V2_KEY,
  storageKeyV1 = WATCHLIST_V1_KEY,
  maxLimit = MAX_WATCHLIST_LIMIT,
} = {}) {
  let keys = [];
  let revision = 1;
  let isPersistent = true;
  let errorMessage = null;
  let cachedState = null;
  const subscribers = new Set();

  function invalidateCache() {
    cachedState = null;
  }

  function notify() {
    const state = getState();
    subscribers.forEach((callback) => {
      try {
        callback(state);
      } catch (err) {
        console.error('WatchlistStore subscriber error:', err);
      }
    });
  }

  function getState() {
    if (
      !cachedState ||
      cachedState.revision !== revision ||
      cachedState.isPersistent !== isPersistent ||
      cachedState.errorMessage !== errorMessage
    ) {
      cachedState = Object.freeze({
        keys: [...keys],
        revision,
        isPersistent,
        errorMessage,
        count: keys.length,
        maxLimit,
        isFull: keys.length >= maxLimit,
      });
    }
    return cachedState;
  }

  function trySave() {
    invalidateCache();
    if (!storage) {
      isPersistent = false;
      return;
    }
    try {
      const payload = {
        schemaVersion: 2,
        exchange: 'NSE',
        revision: ++revision,
        keys: [...keys],
        updatedAt: new Date().toISOString(),
      };
      storage.setItem(storageKeyV2, JSON.stringify(payload));
      isPersistent = true;
      errorMessage = null;
    } catch {
      // Storage unavailable or quota exceeded (MKT-030)
      isPersistent = false;
      errorMessage = 'Saved for this session only. Browser storage is unavailable or denied.';
    }
  }

  // --- Initial Load State Machine (P0-01) ---
  function init() {
    if (!storage) {
      isPersistent = false;
      return;
    }

    let v2Raw = null;
    try {
      v2Raw = storage.getItem(storageKeyV2);
    } catch {
      isPersistent = false;
      return;
    }

    if (v2Raw != null && v2Raw.trim() !== '') {
      // Case 1: V2 exists
      try {
        const parsed = JSON.parse(v2Raw);
        if (
          parsed &&
          typeof parsed === 'object' &&
          parsed.schemaVersion === 2 &&
          Array.isArray(parsed.keys)
        ) {
          const valid = [];
          for (const item of parsed.keys) {
            const sym = fromCanonicalKey(item);
            if (sym && valid.length < maxLimit && !valid.includes(`NSE:${sym}`)) {
              valid.push(`NSE:${sym}`);
            }
          }
          keys = valid;
          revision = typeof parsed.revision === 'number' ? parsed.revision : 1;
          isPersistent = true;
          return;
        }
        // Malformed V2
        errorMessage = 'Watchlist V2 storage is malformed. Preserving existing records without overwrite.';
        isPersistent = false;
        return;
      } catch {
        errorMessage = 'Watchlist V2 storage is corrupt. Preserving existing records without overwrite.';
        isPersistent = false;
        return;
      }
    }

    // Case 2: V2 absent, check legacy V1
    let v1Raw = null;
    try {
      v1Raw = storage.getItem(storageKeyV1);
    } catch {
      // Ignore
    }

    if (v1Raw != null && v1Raw.trim() !== '') {
      try {
        const parsedV1 = JSON.parse(v1Raw);
        if (Array.isArray(parsedV1)) {
          // Normalize in-memory only (DO NOT mutate or write to V1 on disk)
          const plan = planLegacyNseWatchlist(parsedV1, maxLimit);
          keys = plan.keys;
          isPersistent = true;
          return;
        }
      } catch {
        // Ignore malformed V1
      }
    }

    // Case 3: Clean state
    keys = [];
    isPersistent = true;
  }

  init();

  return {
    getState,
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    addKey(symbolOrKey) {
      const canonical = symbolOrKey.startsWith('NSE:')
        ? symbolOrKey
        : toCanonicalKey(symbolOrKey);

      if (!canonical) {
        return { ok: false, reason: 'Invalid NSE symbol format' };
      }
      if (keys.includes(canonical)) {
        return { ok: false, reason: `${fromCanonicalKey(canonical) || canonical} is already in watchlist` };
      }
      if (keys.length >= maxLimit) {
        return { ok: false, reason: `Watchlist limit (${maxLimit}) reached. Remove a symbol first.` };
      }

      keys = [...keys, canonical];
      trySave();
      notify();
      return { ok: true, keys: [...keys] };
    },
    removeKey(symbolOrKey) {
      const canonical = symbolOrKey.startsWith('NSE:')
        ? symbolOrKey
        : toCanonicalKey(symbolOrKey);

      if (!canonical || !keys.includes(canonical)) {
        return { ok: false, reason: 'Symbol not found in watchlist' };
      }

      keys = keys.filter(k => k !== canonical);
      trySave();
      notify();
      return { ok: true, keys: [...keys] };
    },
    reorderKeys(fromIndex, toIndex) {
      if (
        fromIndex < 0 ||
        fromIndex >= keys.length ||
        toIndex < 0 ||
        toIndex >= keys.length ||
        fromIndex === toIndex
      ) {
        return { ok: false, reason: 'Invalid reorder indices' };
      }

      const next = [...keys];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      keys = next;

      trySave();
      notify();
      return { ok: true, keys: [...keys] };
    },
    mergeKeys(newKeys) {
      if (!Array.isArray(newKeys)) {
        return { ok: false, reason: 'Input must be an array of keys' };
      }

      const existingSet = new Set(keys);
      const added = [];

      for (const item of newKeys) {
        const canonical = item.startsWith('NSE:') ? item : toCanonicalKey(item);
        if (canonical && !existingSet.has(canonical) && (keys.length + added.length) < maxLimit) {
          existingSet.add(canonical);
          added.push(canonical);
        }
      }

      if (added.length === 0) {
        return { ok: false, reason: 'No new unique symbols could be added', addedCount: 0 };
      }

      keys = [...keys, ...added];
      trySave();
      notify();
      return { ok: true, addedCount: added.length, keys: [...keys] };
    },
  };
}

// Default singleton store for intra-document synchronization across components
export const defaultWatchlistStore = createWatchlistStore();

/**
 * React hook to bind any component to the watchlist store.
 */
export function useWatchlist(store = defaultWatchlistStore) {
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState
  );

  return {
    ...state,
    addKey: store.addKey,
    removeKey: store.removeKey,
    reorderKeys: store.reorderKeys,
    mergeKeys: store.mergeKeys,
  };
}
