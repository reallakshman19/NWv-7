/**
 * NWv7 Market Desk R2.1 - WP-06 Unified Currency and Macro Store
 * Manages shared state, exact legacy cache schemas, in-flight request coalescing,
 * race-condition protection, and zero-boot mounting.
 */

import { useSyncExternalStore } from 'react';
import { fxClient } from './fxClient.js';
import { subtractCalendarDays } from './fxMath.js';
import { evaluateFxObservation } from './fxFreshness.js';
import { recordMarketSourceReceipt, recordMarketSourceFailure, recordMarketSourceObservation } from '../health/marketSourceRecorder.js';

export const OMR_INR_STORAGE_KEY = 'nw7.omr-inr.frankfurter.v1';
export const USD_INR_STORAGE_KEY = 'nw7.usd-inr.frankfurter.v1';

const RETAINED_RATE_MS = 7 * 86400000;

function getStorageKeyForPair(base, quote) {
  const b = String(base).toUpperCase();
  const q = String(quote).toUpperCase();
  if (b === 'OMR' && q === 'INR') return OMR_INR_STORAGE_KEY;
  if (b === 'USD' && q === 'INR') return USD_INR_STORAGE_KEY;
  return `nw7.fx-${b.toLowerCase()}-${q.toLowerCase()}.frankfurter.v1`;
}

class MacroStore {
  constructor() {
    this.listeners = new Set();
    this.state = null;
    this.cachedSnapshot = null;
    this.inflightFx = new Map();
    this.requestId = 0;
    this.latestRequestByPair = new Map();

    this.init();
  }

  init() {
    this.inflightFx.clear();
    this.requestId = 0;
    this.latestRequestByPair.clear();

    const cachedOmr = this.readStorageCache(OMR_INR_STORAGE_KEY);
    const cachedUsd = this.readStorageCache(USD_INR_STORAGE_KEY);

    const initialRates = {};
    if (cachedOmr) initialRates['OMR/INR'] = { status: 'ready', value: cachedOmr };
    if (cachedUsd) initialRates['USD/INR'] = { status: 'ready', value: cachedUsd };

    this.state = {
      // Rates by pair: 'OMR/INR' -> { status: 'idle'|'loading'|'ready'|'error', value?: object, error?: string }
      ratesByPair: initialRates,
      // Historical series by pair: 'OMR/INR' -> { 7: [...], 30: [...], 90: [...] }
      historyByPair: {},
      historyLoading: false,
      historyError: null,
      activePair: 'OMR/INR',
      activeHorizonDays: 30,
      revision: 1
    };

    this.updateSnapshot();
  }

  readStorageCache(key) {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.payload || !Number.isFinite(parsed.checkedAt)) {
        return null;
      }

      const { payload, checkedAt } = parsed;
      const now = Date.now();
      // The cache TTL applies to retrieval, not the provider observation date.
      // Re-evaluate the observation every time a cached rate is read.
      const rate = Number(payload.rate);
      const classification = evaluateFxObservation(payload.date, now);
      if (checkedAt >= 0 && checkedAt <= now &&
          now - checkedAt < RETAINED_RATE_MS &&
          Number.isFinite(rate) && rate > 0 &&
          getStorageKeyForPair(payload.base, payload.quote) === key &&
          classification) {
        return {
          base: payload.base,
          quote: payload.quote,
          rate,
          date: payload.date,
          referenceProvider: payload.referenceProvider === 'ecb' && key === USD_INR_STORAGE_KEY ? 'ecb' : null,
          ...classification,
          checkedAt,
          payload
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  writeStorageCache(key, payload, checkedAt = Date.now()) {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      // Conforms strictly to existing schema: { payload, checkedAt }
      const record = JSON.stringify({ payload, checkedAt });
      window.localStorage.setItem(key, record);
    } catch {
      // Quota or access error, gracefully ignored
    }
  }

  updateSnapshot() {
    this.cachedSnapshot = Object.freeze({
      ...this.state,
      ratesByPair: { ...this.state.ratesByPair },
      historyByPair: { ...this.state.historyByPair },
      macroByKey: { ...this.state.macroByKey }
    });
    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.cachedSnapshot;
  getServerSnapshot = () => this.cachedSnapshot;

  setActivePair(pair) {
    this.state.activePair = pair;
    this.updateSnapshot();
  }

  setActiveCountry(country) {
    this.state.activeCountry = country;
    this.updateSnapshot();
  }

  setActiveHorizonDays(days) {
    this.state.activeHorizonDays = days;
    this.updateSnapshot();
  }

  // Fetch FX Rate on-demand with request coalescing and race protection
  async fetchRate(base = 'OMR', quote = 'INR', { force = false, signal } = {}) {
    const pairKey = `${base.toUpperCase()}/${quote.toUpperCase()}`;
    const storageKey = getStorageKeyForPair(base, quote);

    // Never treat a recently retrieved but expired observation as current.
    const existingReady = this.state.ratesByPair[pairKey];
    if (!force && existingReady?.status === 'ready' &&
        evaluateFxObservation(existingReady.value?.date)?.freshness !== 'EXPIRED' &&
        evaluateFxObservation(existingReady.value?.date)) {
      return existingReady.value;
    }

    if (this.inflightFx.has(pairKey)) {
      return this.inflightFx.get(pairKey);
    }

    const currentReqId = ++this.requestId;
    this.latestRequestByPair.set(pairKey, currentReqId);

    this.state.ratesByPair[pairKey] = {
      ...this.state.ratesByPair[pairKey],
      status: 'loading',
      error: null
    };
    this.updateSnapshot();

    const startedAt = Date.now();
    const fetchPromise = (async () => {
      try {
        const result = await fxClient.fetchLatestRate(base, quote, { signal });
        const existing = this.state.ratesByPair[pairKey]?.value;
        if (existing?.date > result.date) {
          throw new Error('The provider returned an older observation');
        }
        recordMarketSourceReceipt(result.receipt);

        // Race protection
        if (currentReqId === this.latestRequestByPair.get(pairKey)) {
          this.state.ratesByPair[pairKey] = {
            status: 'ready',
            value: result,
            error: null
          };
          this.state.revision += 1;
          this.writeStorageCache(storageKey, result.payload, result.checkedAt);
          this.updateSnapshot();
        }
        return result;
      } catch (err) {
        recordMarketSourceFailure('frankfurter', err, startedAt);
        if (currentReqId === this.latestRequestByPair.get(pairKey)) {
          // If we have an existing cached rate, retain it with a warning
          const existing = this.state.ratesByPair[pairKey]?.value;
          if (existing) {
            this.state.ratesByPair[pairKey] = {
              status: 'ready',
              value: {
                ...existing,
                ...evaluateFxObservation(existing.date),
                stale: true,
                warning: `Rate refresh failed (${err.message}). Retained dated reference only.`
              },
              error: err.message || 'Rate acquisition failed'
            };
          } else {
            this.state.ratesByPair[pairKey] = {
              status: 'error',
              error: err.message || 'Rate acquisition failed'
            };
          }
          this.state.revision += 1;
          this.updateSnapshot();
        }
        throw err;
      } finally {
        this.inflightFx.delete(pairKey);
      }
    })();

    this.inflightFx.set(pairKey, fetchPromise);
    return fetchPromise;
  }

  // Fetch FX History on-demand
  async fetchRateHistory(base = 'OMR', quote = 'INR', days = 30, { signal } = {}) {
    const pairKey = `${base.toUpperCase()}/${quote.toUpperCase()}`;

    // Check in-memory history cache
    if (this.state.historyByPair[pairKey]?.[days]) {
      return this.state.historyByPair[pairKey][days];
    }

    const historyRequestedAt = Date.now();
    this.state.historyLoading = true;
    this.state.historyError = null;
    this.updateSnapshot();

    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const startIso = subtractCalendarDays(todayIso, days);

      const series = await fxClient.fetchRateHistory(startIso, todayIso, base, quote, { signal });
      recordMarketSourceObservation({
        sourceId: 'frankfurter',
        providerAsOf: series.at(-1)?.date,
        requestedAt: historyRequestedAt,
        sourceUrl: `https://api.frankfurter.dev/v2/rates?from=${startIso}&to=${todayIso}&base=${base.toLowerCase()}&quotes=${quote.toLowerCase()}`,
        state: 'HISTORICAL'
      });

      const currentPairHist = this.state.historyByPair[pairKey] || {};
      this.state.historyByPair[pairKey] = {
        ...currentPairHist,
        [days]: series
      };
      this.state.historyLoading = false;
      this.state.revision += 1;
      this.updateSnapshot();

      return series;
    } catch (err) {
      recordMarketSourceFailure('frankfurter', err, historyRequestedAt);
      this.state.historyLoading = false;
      this.state.historyError = err.message || 'Failed to load historical rate series';
      this.updateSnapshot();
      throw err;
    }
  }
}

export const macroStore = new MacroStore();

export function useMacroStore() {
  const state = useSyncExternalStore(
    macroStore.subscribe,
    macroStore.getSnapshot,
    macroStore.getServerSnapshot
  );

  return {
    state,
    actions: macroStore
  };
}
