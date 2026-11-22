/**
 * NWv7 Market Desk R2.1 - WP-05 Mutual Funds Store & Persistence
 * Manages saved funds watchlist, scheme historical series cache,
 * concurrency queue (max 3), same-day IST caching, and CSV/JSON portability.
 *
 * Conforms to storage keys:
 * - Legacy: nw7.market-saved-funds.v1 (Array of strings, max 12)
 * - R2.1: nw7.market-fund-history.v1 (Schema v1, max 12 schemes, max 4000 obs)
 */

import { useSyncExternalStore } from 'react';
import { MARKET_LEGACY_STORAGE_KEYS, MARKET_R21_STORAGE_KEYS } from '../../contracts/storagePolicy.js';
import { canonicalFundCode, planLegacySavedFunds, MAX_SAVED_FUNDS } from '../../contracts/instrumentIdentity.js';
import { fundClient } from './fundClient.js';
import { sanitizeAndSortNavHistory } from './fundMath.js';

export const SAVED_FUNDS_STORAGE_KEY = MARKET_LEGACY_STORAGE_KEYS.funds; // 'nw7.market-saved-funds.v1'
export const FUND_HISTORY_STORAGE_KEY = MARKET_R21_STORAGE_KEYS.selectedFundHistory; // 'nw7.market-fund-history.v1'

export const MAX_CONCURRENT_REQUESTS = 3;
export const MAX_HISTORY_SCHEMES = 12;
export const MAX_OBSERVATIONS_PER_SCHEME = 4000;

const IST_OFFSET_MS = 19800000; // +05:30
const ONE_DAY_MS = 86400000;

// Formula injection regex
const FORMULA_START_REGEX = /^[=+@\t\r|-]/;

/**
 * Returns YYYY-MM-DD day key in Indian Standard Time (IST).
 * @param {number} ms 
 * @returns {string}
 */
export function getIstDayKey(ms = Date.now()) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Sanitizes CSV cell against formula injection.
 * @param {string|number} value 
 * @returns {string}
 */
export function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return '""';
  const str = String(value);

  let safeStr = str;
  if (FORMULA_START_REGEX.test(safeStr)) {
    safeStr = "'" + safeStr;
  }

  if (/[",\n\r]/.test(safeStr) || safeStr.startsWith("'")) {
    return `"${safeStr.replace(/"/g, '""')}"`;
  }
  return safeStr;
}

/**
 * Unescapes CSV cell and strips leading formula escape quote if present.
 * @param {string} cell 
 * @returns {string}
 */
export function desanitizeCsvCell(cell) {
  if (cell === null || cell === undefined) return '';
  let str = String(cell).trim();

  if (str.startsWith('"') && str.endsWith('"') && str.length >= 2) {
    str = str.slice(1, -1).replace(/""/g, '"');
  }

  if (str.startsWith("'") && FORMULA_START_REGEX.test(str.slice(1))) {
    str = str.slice(1);
  }

  return str.trim();
}

class FundStore {
  constructor() {
    this.listeners = new Set();
    this.state = null;
    this.cachedSnapshot = null;

    // Concurrency queue & in-flight map
    this.inflightRequests = new Map();

    this.init();
  }

  init() {
    const savedFunds = this.loadSavedFundsFromStorage();
    const historyCache = this.loadHistoryCacheFromStorage();

    this.state = {
      savedCodes: savedFunds,
      navByCode: {}, // code -> { status: 'idle'|'loading'|'ready'|'error'|'cooldown', value?: object, error?: string }
      historyCache: historyCache.schemes || {},
      selectedCode: savedFunds[0] || null,
      cooldownUntil: 0,
      storageWarning: null,
      revision: 1
    };

    this.cachedSnapshot = Object.freeze({ ...this.state });

    // Cross-tab synchronization
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (event) => {
        if (event.key === SAVED_FUNDS_STORAGE_KEY && event.newValue) {
          try {
            const externalCodes = JSON.parse(event.newValue);
            const planned = planLegacySavedFunds(externalCodes);
            if (JSON.stringify(planned.codes) !== JSON.stringify(this.state.savedCodes)) {
              this.state.savedCodes = planned.codes;
              this.updateSnapshot();
            }
          } catch {
            // Ignore
          }
        }
      });
    }
  }

  loadSavedFundsFromStorage() {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const raw = window.localStorage.getItem(SAVED_FUNDS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const planned = planLegacySavedFunds(parsed);
      return planned.codes;
    } catch {
      return [];
    }
  }

  saveSavedFundsToStorage(codes) {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(SAVED_FUNDS_STORAGE_KEY, JSON.stringify(codes));
    } catch (err) {
      this.state.storageWarning = `Unable to persist saved funds: ${err.message}`;
    }
  }

  loadHistoryCacheFromStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { schemaVersion: 1, schemes: {} };
    }
    try {
      const raw = window.localStorage.getItem(FUND_HISTORY_STORAGE_KEY);
      if (!raw) return { schemaVersion: 1, schemes: {} };
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.schemaVersion !== 1 || typeof parsed.schemes !== 'object') {
        throw new Error('Invalid history cache schema');
      }
      return parsed;
    } catch {
      // Preserve corrupt history safely in backup key without wiping
      try {
        const raw = window.localStorage.getItem(FUND_HISTORY_STORAGE_KEY);
        if (raw) {
          const corruptBackupKey = `${FUND_HISTORY_STORAGE_KEY}.corrupt.${Date.now()}`;
          window.localStorage.setItem(corruptBackupKey, raw);
        }
      } catch {
        // Fall through
      }
      return { schemaVersion: 1, schemes: {} };
    }
  }

  saveHistoryCacheToStorage(schemes) {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      // Prune schemes if > MAX_HISTORY_SCHEMES
      const entries = Object.entries(schemes).sort((a, b) => (b[1].checkedAt || 0) - (a[1].checkedAt || 0));
      const prunedEntries = entries.slice(0, MAX_HISTORY_SCHEMES);
      const prunedSchemes = Object.fromEntries(prunedEntries);

      const payload = JSON.stringify({
        schemaVersion: 1,
        lastPrunedAt: new Date().toISOString(),
        schemes: prunedSchemes
      });
      window.localStorage.setItem(FUND_HISTORY_STORAGE_KEY, payload);
    } catch (err) {
      this.state.storageWarning = `Unable to persist fund history cache: ${err.message}`;
    }
  }

  updateSnapshot() {
    this.cachedSnapshot = Object.freeze({
      ...this.state,
      savedCodes: [...this.state.savedCodes],
      navByCode: { ...this.state.navByCode },
      historyCache: { ...this.state.historyCache }
    });
    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => {
    return this.cachedSnapshot;
  };

  getServerSnapshot = () => {
    return this.cachedSnapshot;
  };

  // Saved funds actions
  saveFund(code) {
    const canonical = canonicalFundCode(code);
    if (!canonical) {
      return { ok: false, error: 'Invalid fund scheme code' };
    }

    if (this.state.savedCodes.includes(canonical)) {
      return { ok: true, alreadySaved: true };
    }

    if (this.state.savedCodes.length >= MAX_SAVED_FUNDS) {
      return { ok: false, error: `Maximum of ${MAX_SAVED_FUNDS} saved funds reached` };
    }

    const nextCodes = [...this.state.savedCodes, canonical];
    this.state.savedCodes = nextCodes;
    this.state.revision += 1;
    this.saveSavedFundsToStorage(nextCodes);
    this.updateSnapshot();

    return { ok: true, code: canonical };
  }

  removeFund(code) {
    const canonical = canonicalFundCode(code);
    if (!canonical) return { ok: false, error: 'Invalid code' };

    const nextCodes = this.state.savedCodes.filter(c => c !== canonical);
    this.state.savedCodes = nextCodes;
    this.state.revision += 1;

    if (this.state.selectedCode === canonical) {
      this.state.selectedCode = nextCodes[0] || null;
    }

    this.saveSavedFundsToStorage(nextCodes);
    this.updateSnapshot();

    return { ok: true };
  }

  selectFund(code) {
    const canonical = canonicalFundCode(code);
    if (!canonical) return;
    this.state.selectedCode = canonical;
    this.updateSnapshot();
  }

  // Same-day IST cache lookup
  readCachedNav(code, now = Date.now()) {
    const canonical = canonicalFundCode(code);
    if (!canonical) return null;

    // Check in-memory first
    const inMemory = this.state.navByCode[canonical];
    if (inMemory?.status === 'ready' && inMemory?.value) {
      const checkedAt = inMemory.value.checkedAt;
      if (
        typeof checkedAt === 'number' &&
        now - checkedAt < ONE_DAY_MS &&
        getIstDayKey(checkedAt) === getIstDayKey(now)
      ) {
        return { ...inMemory.value, delivery: 'cache' };
      }
    }

    // Check history cache
    const cachedHistory = this.state.historyCache[canonical];
    if (cachedHistory?.checkedAt) {
      const checkedAt = cachedHistory.checkedAt;
      if (
        now - checkedAt < ONE_DAY_MS &&
        getIstDayKey(checkedAt) === getIstDayKey(now) &&
        cachedHistory.latestNav &&
        cachedHistory.latestDate
      ) {
        return {
          schemeCode: canonical,
          schemeName: cachedHistory.schemeName,
          category: cachedHistory.category,
          fundHouse: cachedHistory.fundHouse,
          plan: cachedHistory.plan,
          option: cachedHistory.option,
          isIdcw: cachedHistory.isIdcw,
          nav: cachedHistory.latestNav,
          date: cachedHistory.latestDate,
          rawDate: cachedHistory.latestDate,
          delivery: 'cache',
          checkedAt
        };
      }
    }

    return null;
  }

  // Network Fetch with request coalescing and concurrency limit
  async fetchSchemeNav(code, { force = false, signal } = {}) {
    const canonical = canonicalFundCode(code);
    if (!canonical) {
      throw new Error(`Invalid scheme code format: ${code}`);
    }

    // 1. Check same-day cache if not forcing
    if (!force) {
      const cached = this.readCachedNav(canonical);
      if (cached) {
        this.state.navByCode[canonical] = { status: 'ready', value: cached };
        this.updateSnapshot();
        return cached;
      }
    }

    // 2. Coalesce concurrent requests for the same scheme
    if (this.inflightRequests.has(canonical)) {
      return this.inflightRequests.get(canonical);
    }

    // 3. Mark loading
    this.state.navByCode[canonical] = {
      ...(this.state.navByCode[canonical] || {}),
      status: 'loading'
    };
    this.updateSnapshot();

    const fetchPromise = (async () => {
      try {
        const item = await fundClient.fetchLatestNav(canonical, { signal });
        this.state.navByCode[canonical] = { status: 'ready', value: item };
        this.updateSnapshot();
        return item;
      } catch (err) {
        const isCooldown = err.status === 429 || fundClient.isCoolingDown();
        const status = isCooldown ? 'cooldown' : 'error';
        const errorMsg = err.message || 'NAV fetch failed';
        // Retain the last observation with its original source date; a failed
        // network check must not erase historical evidence or mark it fresh.
        const previous = this.state.navByCode[canonical]?.value;
        this.state.navByCode[canonical] = {
          status,
          error: errorMsg,
          ...(previous ? { value: previous } : {})
        };
        this.updateSnapshot();
        throw err;
      } finally {
        this.inflightRequests.delete(canonical);
      }
    })();

    this.inflightRequests.set(canonical, fetchPromise);
    return fetchPromise;
  }

  // Fetch full history series for research & charting
  async fetchSchemeHistory(code, { force = false, signal } = {}) {
    const canonical = canonicalFundCode(code);
    if (!canonical) throw new Error(`Invalid scheme code: ${code}`);

    const now = Date.now();
    const existing = this.state.historyCache[canonical];

    // Check same-day cache
    if (!force && existing && existing.checkedAt) {
      if (
        now - existing.checkedAt < ONE_DAY_MS &&
        getIstDayKey(existing.checkedAt) === getIstDayKey(now) &&
        Array.isArray(existing.observations) &&
        existing.observations.length > 0
      ) {
        return existing;
      }
    }

    const history = await fundClient.fetchFundHistory(canonical, { signal, now });

    // Store in history cache
    const nextCache = { ...this.state.historyCache, [canonical]: history };
    this.state.historyCache = nextCache;
    this.state.revision += 1;
    this.saveHistoryCacheToStorage(nextCache);
    this.updateSnapshot();

    return history;
  }

  // Batch loading saved funds with maximum concurrency of 3
  async batchFetchSaved(codes = null, { force = false, signal } = {}) {
    const targetCodes = codes || this.state.savedCodes;
    const list = planLegacySavedFunds(targetCodes).codes;
    if (list.length === 0) return { total: 0, completed: 0 };

    let nextIdx = 0;
    let completed = 0;
    let hasCooldown = false;

    const worker = async () => {
      while (nextIdx < list.length && !signal?.aborted && !hasCooldown) {
        const code = list[nextIdx++];
        try {
          await this.fetchSchemeNav(code, { force, signal });
          completed += 1;
        } catch (err) {
          if (err.status === 429) {
            hasCooldown = true;
          }
        }
      }
    };

    const workerCount = Math.min(MAX_CONCURRENT_REQUESTS, list.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    return { total: list.length, completed, cooldown: hasCooldown };
  }

  // Export / Import
  exportJson() {
    return JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      savedCodes: this.state.savedCodes,
      historyCache: this.state.historyCache
    }, null, 2);
  }

  importJson(jsonString, mode = 'REPLACE') {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      return { ok: false, errors: [`JSON Parse error: ${e.message}`] };
    }

    if (!parsed || parsed.schemaVersion !== 1) {
      return { ok: false, errors: ['Unsupported schema version. Expected version 1.'] };
    }

    const planned = planLegacySavedFunds(parsed.savedCodes || []);
    if (planned.codes.length === 0 && !parsed.historyCache) {
      return { ok: false, errors: ['No valid fund codes or history found in payload'] };
    }

    let nextCodes;
    if (mode === 'REPLACE') {
      nextCodes = planned.codes;
    } else {
      // MERGE
      const combined = [...this.state.savedCodes, ...planned.codes];
      nextCodes = planLegacySavedFunds(combined).codes;
    }

    // Merge history cache
    const incomingSchemes = (parsed.historyCache && typeof parsed.historyCache === 'object')
      ? parsed.historyCache
      : {};

    const cleanSchemes = {};
    for (const [code, val] of Object.entries(incomingSchemes)) {
      const c = canonicalFundCode(code);
      if (c && val && Array.isArray(val.observations)) {
        const sortedObs = sanitizeAndSortNavHistory(val.observations);
        cleanSchemes[c] = {
          ...val,
          schemeCode: c,
          observations: sortedObs.slice(-MAX_OBSERVATIONS_PER_SCHEME),
          truncated: sortedObs.length > MAX_OBSERVATIONS_PER_SCHEME || val.truncated === true,
          fullHistoryVerified: false, // Imported historical data is never automatically assumed provider-verified
          checkedAt: val.checkedAt || Date.now()
        };
      }
    }

    const nextHistory = mode === 'REPLACE'
      ? cleanSchemes
      : { ...this.state.historyCache, ...cleanSchemes };

    this.state.savedCodes = nextCodes;
    this.state.historyCache = nextHistory;
    this.state.revision += 1;

    this.saveSavedFundsToStorage(nextCodes);
    this.saveHistoryCacheToStorage(nextHistory);
    this.updateSnapshot();

    return { ok: true, importedCount: nextCodes.length };
  }

  // CSV Export with formula injection sanitization
  exportCsv() {
    const lines = [
      '# NWv7 Mutual Funds Export - Scheme watchlist and cached metrics',
      'SchemeCode,SchemeName,Category,Plan,Option,LatestNAV,NAVDate,CheckedAt'
    ];

    for (const code of this.state.savedCodes) {
      const navItem = this.state.navByCode[code]?.value || this.readCachedNav(code);
      const row = [
        sanitizeCsvCell(code),
        sanitizeCsvCell(navItem?.schemeName || `Scheme ${code}`),
        sanitizeCsvCell(navItem?.category || 'Mutual Fund'),
        sanitizeCsvCell(navItem?.plan || 'Direct'),
        sanitizeCsvCell(navItem?.option || 'Growth'),
        sanitizeCsvCell(navItem?.nav ?? ''),
        sanitizeCsvCell(navItem?.date ?? ''),
        sanitizeCsvCell(navItem?.checkedAt ? new Date(navItem.checkedAt).toISOString() : '')
      ];
      lines.push(row.join(','));
    }

    return lines.join('\n');
  }

  importCsv(csvString, mode = 'APPEND') {
    if (!csvString || typeof csvString !== 'string') {
      return { ok: false, errors: ['CSV content is empty'] };
    }

    const lines = csvString.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
    if (lines.length < 2) {
      return { ok: false, errors: ['CSV must contain header row and at least one scheme code'] };
    }

    const header = lines[0].split(',').map(h => desanitizeCsvCell(h).toLowerCase());
    const codeIdx = header.findIndex(h => h.includes('code'));
    if (codeIdx === -1) {
      return { ok: false, errors: ['CSV missing SchemeCode column'] };
    }

    const extractedCodes = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',');
      const rawCode = desanitizeCsvCell(cells[codeIdx]);
      const valid = canonicalFundCode(rawCode);
      if (valid) {
        extractedCodes.push(valid);
      }
    }

    if (extractedCodes.length === 0) {
      return { ok: false, errors: ['No valid fund scheme codes found in CSV'] };
    }

    let nextCodes;
    if (mode === 'REPLACE') {
      nextCodes = planLegacySavedFunds(extractedCodes).codes;
    } else {
      nextCodes = planLegacySavedFunds([...this.state.savedCodes, ...extractedCodes]).codes;
    }

    this.state.savedCodes = nextCodes;
    this.state.revision += 1;
    this.saveSavedFundsToStorage(nextCodes);
    this.updateSnapshot();

    return { ok: true, importedCount: nextCodes.length };
  }
}

export const fundStore = new FundStore();

export function useFundStore() {
  const state = useSyncExternalStore(
    fundStore.subscribe,
    fundStore.getSnapshot,
    fundStore.getServerSnapshot
  );

  return {
    state,
    actions: fundStore
  };
}
