/**
 * NWv7 Market Desk R2.1 - WP-04 Portfolio Store & Persistence
 * Manages portfolio state, transactions ledger, manual price marks,
 * and JSON/CSV import/export with strict formula-injection protection.
 *
 * Conforms to storage key: nw7.market-portfolio.v1
 * Supports React useSyncExternalStore with stable snapshot caching.
 */

import { useSyncExternalStore } from 'react';
import { MARKET_R21_STORAGE_KEYS } from '../../contracts/storagePolicy.js';
import { validateTransactionInputs, validateManualPriceMark, replayPortfolio, sortTransactions } from './portfolioAccounting.js';

export const PORTFOLIO_STORAGE_KEY = MARKET_R21_STORAGE_KEYS.portfolio; // 'nw7.market-portfolio.v1'
export const MAX_PORTFOLIOS = 5;

// Formula injection regex: characters that can initiate formulas or command execution in Excel/Calc
const FORMULA_START_REGEX = /^[=+@\t\r|-]/;

/**
 * Creates default initial state structure.
 * @returns {object}
 */
export function createDefaultPortfolioState() {
  const now = new Date().toISOString();
  return {
    version: 1,
    revision: 1,
    lastModified: now,
    activePortfolioId: 'default',
    storageWarning: null,
    portfolios: [
      {
        id: 'default',
        name: 'Primary Portfolio',
        createdAt: now,
        updatedAt: now,
        transactions: [],
        manualPriceMarks: {}
      }
    ]
  };
}

/**
 * Sanitizes CSV cell against formula injection.
 * Escapes quotes and prefixes formula characters with a single quote.
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

  // Quote if contains commas, quotes, newlines, or leading single quote
  if (/[",\n\r]/.test(safeStr) || safeStr.startsWith("'")) {
    return `"${safeStr.replace(/"/g, '""')}"`;
  }
  return safeStr;
}

/**
 * Unescapes CSV cell value and removes leading formula escape quote if present.
 * @param {string} cell 
 * @returns {string}
 */
export function desanitizeCsvCell(cell) {
  if (cell === null || cell === undefined) return '';
  let str = String(cell).trim();

  // Strip enclosing quotes if present
  if (str.startsWith('"') && str.endsWith('"') && str.length >= 2) {
    str = str.slice(1, -1).replace(/""/g, '"');
  }

  // Strip formula escape quote if present
  if (str.startsWith("'") && FORMULA_START_REGEX.test(str.slice(1))) {
    str = str.slice(1);
  }

  return str.trim();
}

class PortfolioStore {
  constructor() {
    this.listeners = new Set();
    this.state = null;
    this.cachedSnapshot = null;
    this.init();
  }

  init() {
    this.state = this.loadFromStorage();
    this.cachedSnapshot = Object.freeze({ ...this.state });

    // Listen to cross-tab storage changes
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (event) => {
        if (event.key === PORTFOLIO_STORAGE_KEY && event.newValue) {
          try {
            const externalState = JSON.parse(event.newValue);
            if (externalState && externalState.revision > this.state.revision) {
              this.state = externalState;
              this.updateSnapshot();
            }
          } catch {
            // Ignore unparseable external changes
          }
        }
      });
    }
  }

  loadFromStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return createDefaultPortfolioState();
    }

    try {
      const raw = window.localStorage.getItem(PORTFOLIO_STORAGE_KEY);
      if (!raw) {
        const defaultState = createDefaultPortfolioState();
        const saved = this.saveToStorage(defaultState);
        if (!saved.ok) defaultState.storageWarning = saved.error;
        return defaultState;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.portfolios)) {
        throw new Error('Invalid portfolio storage schema');
      }

      return {
        ...parsed,
        storageWarning: null
      };
    } catch (err) {
      // Preserve corrupt record non-destructively
      try {
        const raw = window.localStorage.getItem(PORTFOLIO_STORAGE_KEY);
        if (raw) {
          const corruptBackupKey = `${PORTFOLIO_STORAGE_KEY}.corrupt.${Date.now()}`;
          window.localStorage.setItem(corruptBackupKey, raw);
        }
      } catch {
        // Fall through
      }

      const fallback = createDefaultPortfolioState();
      fallback.storageWarning = `Existing storage was unreadable and preserved safely. Error: ${err.message}`;
      return fallback;
    }
  }

  saveToStorage(stateToSave) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ok: false, error: 'Browser local storage is unavailable; portfolio changes were not saved' };
    }
    try {
      const payload = JSON.stringify({
        version: stateToSave.version,
        revision: stateToSave.revision,
        lastModified: stateToSave.lastModified,
        activePortfolioId: stateToSave.activePortfolioId,
        portfolios: stateToSave.portfolios
      });
      window.localStorage.setItem(PORTFOLIO_STORAGE_KEY, payload);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `Unable to save portfolio changes: ${err.message}` };
    }
  }

  updateSnapshot() {
    this.cachedSnapshot = Object.freeze({ ...this.state });
    for (const listener of this.listeners) {
      listener();
    }
  }

  mutate(updater) {
    const nextPortfolios = JSON.parse(JSON.stringify(this.state.portfolios));
    const nextState = {
      ...this.state,
      revision: (this.state.revision || 0) + 1,
      lastModified: new Date().toISOString(),
      portfolios: nextPortfolios,
      storageWarning: null
    };

    updater(nextState);
    // Commit only after a durable browser write. A failed write must not
    // look like success or silently replace the last persisted ledger.
    const saved = this.saveToStorage(nextState);
    if (!saved.ok) {
      this.state = { ...this.state, storageWarning: saved.error };
      this.updateSnapshot();
      return saved;
    }
    this.state = nextState;
    this.updateSnapshot();
    return { ok: true };
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

  // Helper getters
  getActivePortfolio() {
    const portfolio = this.state.portfolios.find(p => p.id === this.state.activePortfolioId);
    return portfolio || this.state.portfolios[0];
  }

  getReplayedPortfolio(portfolioId = null) {
    const targetId = portfolioId || this.state.activePortfolioId;
    const portfolio = this.state.portfolios.find(p => p.id === targetId) || this.state.portfolios[0];
    return replayPortfolio(portfolio.transactions || [], portfolio.manualPriceMarks || {});
  }

  // Portfolio Management Actions
  createPortfolio(name) {
    if (this.state.portfolios.length >= MAX_PORTFOLIOS) {
      return { ok: false, error: `Maximum limit of ${MAX_PORTFOLIOS} portfolios reached` };
    }
    const cleanName = (name || '').trim();
    if (!cleanName) {
      return { ok: false, error: 'Portfolio name cannot be empty' };
    }

    const newId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const saveResult = this.mutate(state => {
      state.portfolios.push({
        id: newId,
        name: cleanName,
        createdAt: now,
        updatedAt: now,
        transactions: [],
        manualPriceMarks: {}
      });
      state.activePortfolioId = newId;
    });
    if (!saveResult.ok) return { ok: false, error: saveResult.error, errors: [saveResult.error] };

    return { ok: true, portfolioId: newId };
  }

  switchPortfolio(portfolioId) {
    if (!this.state.portfolios.some(p => p.id === portfolioId)) {
      return { ok: false, error: 'Portfolio not found' };
    }
    const saveResult = this.mutate(state => {
      state.activePortfolioId = portfolioId;
    });
    if (!saveResult.ok) return { ok: false, error: saveResult.error, errors: [saveResult.error] };
    return { ok: true };
  }

  renamePortfolio(portfolioId, newName) {
    const cleanName = (newName || '').trim();
    if (!cleanName) return { ok: false, error: 'Portfolio name cannot be empty' };

    let found = false;
    const saveResult = this.mutate(state => {
      const p = state.portfolios.find(item => item.id === portfolioId);
      if (p) {
        p.name = cleanName;
        p.updatedAt = new Date().toISOString();
        found = true;
      }
    });
    if (!saveResult.ok) return { ok: false, error: saveResult.error, errors: [saveResult.error] };

    return found ? { ok: true } : { ok: false, error: 'Portfolio not found' };
  }

  deletePortfolio(portfolioId) {
    if (this.state.portfolios.length <= 1) {
      return { ok: false, error: 'Cannot delete the only remaining portfolio' };
    }

    let deleted = false;
    const saveResult = this.mutate(state => {
      const index = state.portfolios.findIndex(p => p.id === portfolioId);
      if (index !== -1) {
        state.portfolios.splice(index, 1);
        if (state.activePortfolioId === portfolioId) {
          state.activePortfolioId = state.portfolios[0].id;
        }
        deleted = true;
      }
    });
    if (!saveResult.ok) return { ok: false, error: saveResult.error, errors: [saveResult.error] };

    return deleted ? { ok: true } : { ok: false, error: 'Portfolio not found' };
  }

  // Transaction Ledger Actions
  addTransaction(portfolioId, txInput) {
    const validation = validateTransactionInputs(txInput);
    if (!validation.ok) {
      return { ok: false, errors: validation.errors };
    }

    const targetId = portfolioId || this.state.activePortfolioId;
    let added = false;

    const saveResult = this.mutate(state => {
      const p = state.portfolios.find(item => item.id === targetId);
      if (p) {
        p.transactions.push(validation.sanitized);
        p.transactions = sortTransactions(p.transactions);
        p.updatedAt = new Date().toISOString();
        added = true;
      }
    });
    if (!saveResult.ok) return { ok: false, error: saveResult.error, errors: [saveResult.error] };

    return added
      ? { ok: true, transaction: validation.sanitized }
      : { ok: false, errors: ['Portfolio not found'] };
  }

  updateTransaction(portfolioId, txId, txInput) {
    const validation = validateTransactionInputs({ ...txInput, id: txId });
    if (!validation.ok) {
      return { ok: false, errors: validation.errors };
    }

    const targetId = portfolioId || this.state.activePortfolioId;
    let updated = false;

    const saveResult = this.mutate(state => {
      const p = state.portfolios.find(item => item.id === targetId);
      if (p) {
        const index = p.transactions.findIndex(t => t.id === txId);
        if (index !== -1) {
          p.transactions[index] = validation.sanitized;
          p.transactions = sortTransactions(p.transactions);
          p.updatedAt = new Date().toISOString();
          updated = true;
        }
      }
    });
    if (!saveResult.ok) return { ok: false, error: saveResult.error, errors: [saveResult.error] };

    return updated
      ? { ok: true, transaction: validation.sanitized }
      : { ok: false, errors: ['Transaction or portfolio not found'] };
  }

  deleteTransaction(portfolioId, txId) {
    const targetId = portfolioId || this.state.activePortfolioId;
    let deleted = false;

    const saveResult = this.mutate(state => {
      const p = state.portfolios.find(item => item.id === targetId);
      if (p) {
        const index = p.transactions.findIndex(t => t.id === txId);
        if (index !== -1) {
          p.transactions.splice(index, 1);
          p.updatedAt = new Date().toISOString();
          deleted = true;
        }
      }
    });
    if (!saveResult.ok) return { ok: false, error: saveResult.error, errors: [saveResult.error] };

    return deleted ? { ok: true } : { ok: false, error: 'Transaction or portfolio not found' };
  }

  // Manual Price Mark Actions
  setManualPriceMark(portfolioId, instrumentKey, price, asOfDate) {
    const validation = validateManualPriceMark(instrumentKey, price, asOfDate);
    if (!validation.ok) return { ok: false, error: validation.error };

    const targetId = portfolioId || this.state.activePortfolioId;
    let setMark = false;

    const saveResult = this.mutate(state => {
      const p = state.portfolios.find(item => item.id === targetId);
      if (p) {
        if (!p.manualPriceMarks) p.manualPriceMarks = {};
        p.manualPriceMarks[instrumentKey] = validation.sanitized;
        p.updatedAt = new Date().toISOString();
        setMark = true;
      }
    });
    if (!saveResult.ok) return { ok: false, error: saveResult.error, errors: [saveResult.error] };

    return setMark ? { ok: true } : { ok: false, error: 'Portfolio not found' };
  }

  deleteManualPriceMark(portfolioId, instrumentKey) {
    const targetId = portfolioId || this.state.activePortfolioId;
    let deleted = false;

    const saveResult = this.mutate(state => {
      const p = state.portfolios.find(item => item.id === targetId);
      if (p && p.manualPriceMarks && p.manualPriceMarks[instrumentKey]) {
        delete p.manualPriceMarks[instrumentKey];
        p.updatedAt = new Date().toISOString();
        deleted = true;
      }
    });
    if (!saveResult.ok) return { ok: false, error: saveResult.error, errors: [saveResult.error] };

    return deleted ? { ok: true } : { ok: false, error: 'Mark or portfolio not found' };
  }

  // JSON Export / Import
  exportJson(portfolioId = null) {
    if (portfolioId) {
      const p = this.state.portfolios.find(item => item.id === portfolioId);
      if (!p) return null;
      return JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        portfolio: p
      }, null, 2);
    }

    return JSON.stringify({
      version: 1,
      revision: this.state.revision,
      exportedAt: new Date().toISOString(),
      activePortfolioId: this.state.activePortfolioId,
      portfolios: this.state.portfolios
    }, null, 2);
  }

  importJson(jsonString, mode = 'REPLACE_ACTIVE') {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      return { ok: false, errors: [`JSON Parse error: ${e.message}`] };
    }

    if (!parsed || parsed.version !== 1) {
      return { ok: false, errors: ['Unsupported schema version. Expected version 1.'] };
    }

    // Determine payload type: single portfolio or full workspace
    const incomingPortfolios = Array.isArray(parsed.portfolios)
      ? parsed.portfolios
      : (parsed.portfolio ? [parsed.portfolio] : []);

    if (incomingPortfolios.length === 0) {
      return { ok: false, errors: ['No portfolio data found in JSON payload'] };
    }

    if (!['REPLACE_ACTIVE', 'NEW_PORTFOLIO', 'MERGE'].includes(mode)) {
      return { ok: false, errors: [`Unsupported import mode: ${mode}`] };
    }

    // Pre-validate all transactions across all incoming portfolios
    const validatedPortfolios = [];
    for (const p of incomingPortfolios) {
      if (!p.name || typeof p.name !== 'string') {
        return { ok: false, errors: ['Portfolio missing valid name'] };
      }
      const validTxList = [];
      if (Array.isArray(p.transactions)) {
        for (let i = 0; i < p.transactions.length; i++) {
          const res = validateTransactionInputs(p.transactions[i]);
          if (!res.ok) {
            return { ok: false, errors: [`Portfolio "${p.name}" transaction #${i + 1} invalid: ${res.errors.join(', ')}`] };
          }
          validTxList.push(res.sanitized);
        }
      }

      const validatedMarks = {};
      if (p.manualPriceMarks != null) {
        if (typeof p.manualPriceMarks !== 'object' || Array.isArray(p.manualPriceMarks)) {
          return { ok: false, errors: [`Portfolio "${p.name}" manual marks must be an object`] };
        }
        for (const [key, mark] of Object.entries(p.manualPriceMarks)) {
          const res = validateManualPriceMark(key, mark?.price, mark?.asOfDate, mark?.recordedAt);
          if (!res.ok) {
            return { ok: false, errors: [`Portfolio "${p.name}" invalid price mark (${key}): ${res.error}`] };
          }
          validatedMarks[key] = res.sanitized;
        }
      }

      validatedPortfolios.push({
        id: p.id || `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: p.name,
        createdAt: p.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        transactions: sortTransactions(validTxList),
        manualPriceMarks: validatedMarks
      });
    }

    // Commit changes according to mode
    const saveResult = this.mutate(state => {
      if (mode === 'REPLACE_ACTIVE') {
        const active = state.portfolios.find(p => p.id === state.activePortfolioId);
        const source = validatedPortfolios[0];
        if (active && source) {
          active.transactions = source.transactions;
          active.manualPriceMarks = source.manualPriceMarks;
          active.updatedAt = new Date().toISOString();
        }
      } else if (mode === 'NEW_PORTFOLIO') {
        for (const p of validatedPortfolios) {
          if (state.portfolios.length < MAX_PORTFOLIOS) {
            state.portfolios.push(p);
            state.activePortfolioId = p.id;
          }
        }
      } else if (mode === 'MERGE') {
        const active = state.portfolios.find(p => p.id === state.activePortfolioId);
        const source = validatedPortfolios[0];
        if (active && source) {
          const existingIds = new Set(active.transactions.map(t => t.id));
          for (const tx of source.transactions) {
            if (!existingIds.has(tx.id)) {
              active.transactions.push(tx);
            }
          }
          active.transactions = sortTransactions(active.transactions);
          active.manualPriceMarks = { ...active.manualPriceMarks, ...source.manualPriceMarks };
          active.updatedAt = new Date().toISOString();
        }
      }
    });
    if (!saveResult.ok) return { ok: false, error: saveResult.error, errors: [saveResult.error] };

    return { ok: true, importedCount: validatedPortfolios.length };
  }

  // CSV Export / Import (Transactions only, with formula injection protection)
  exportCsv(portfolioId = null) {
    const targetId = portfolioId || this.state.activePortfolioId;
    const portfolio = this.state.portfolios.find(p => p.id === targetId) || this.state.portfolios[0];

    const lines = [
      '# NWv7 Portfolio Transactions Export - Manual price marks not included in CSV',
      'Type,Exchange,Symbol,Date,SequenceIndex,Quantity,Price,Fee,Notes'
    ];

    const sorted = sortTransactions(portfolio.transactions || []);
    for (const tx of sorted) {
      const row = [
        sanitizeCsvCell(tx.type),
        sanitizeCsvCell(tx.exchange),
        sanitizeCsvCell(tx.symbol),
        sanitizeCsvCell(tx.date),
        sanitizeCsvCell(tx.sequenceIndex ?? 0),
        sanitizeCsvCell(tx.quantity),
        sanitizeCsvCell(tx.price),
        sanitizeCsvCell(tx.fee ?? 0),
        sanitizeCsvCell(tx.notes ?? '')
      ];
      lines.push(row.join(','));
    }

    return lines.join('\n');
  }

  importCsv(portfolioId = null, csvString, mode = 'APPEND') {
    if (!csvString || typeof csvString !== 'string') {
      return { ok: false, errors: ['CSV content is empty'] };
    }

    const lines = csvString.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
    if (lines.length < 2) {
      return { ok: false, errors: ['CSV must contain a header row and at least one data row'] };
    }

    const headerLine = lines[0];
    const headers = headerLine.split(',').map(h => desanitizeCsvCell(h).toLowerCase());

    const requiredCols = ['type', 'symbol', 'date', 'quantity', 'price'];
    for (const req of requiredCols) {
      if (!headers.includes(req)) {
        return { ok: false, errors: [`Missing required CSV header: ${req}`] };
      }
    }

    const typeIdx = headers.indexOf('type');
    const exchIdx = headers.indexOf('exchange');
    const symIdx = headers.indexOf('symbol');
    const dateIdx = headers.indexOf('date');
    const seqIdx = headers.indexOf('sequenceindex');
    const qtyIdx = headers.indexOf('quantity');
    const priceIdx = headers.indexOf('price');
    const feeIdx = headers.indexOf('fee');
    const notesIdx = headers.indexOf('notes');

    const validatedTxs = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const rawLine = lines[i];
      // Basic CSV cell split handling quoted commas
      const cells = [];
      let inQuotes = false;
      let cur = '';
      for (let c = 0; c < rawLine.length; c++) {
        const char = rawLine[c];
        if (char === '"' && (c === 0 || rawLine[c - 1] !== '\\')) {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cells.push(cur);
          cur = '';
          continue;
        }
        cur += char;
      }
      cells.push(cur);

      const type = desanitizeCsvCell(cells[typeIdx]);
      const exchange = exchIdx !== -1 ? desanitizeCsvCell(cells[exchIdx]) : 'NSE';
      const symbol = desanitizeCsvCell(cells[symIdx]);
      const date = desanitizeCsvCell(cells[dateIdx]);
      const sequenceIndex = seqIdx !== -1 ? Number(desanitizeCsvCell(cells[seqIdx])) : 0;
      const quantity = Number(desanitizeCsvCell(cells[qtyIdx]));
      const price = Number(desanitizeCsvCell(cells[priceIdx]));
      const fee = feeIdx !== -1 ? Number(desanitizeCsvCell(cells[feeIdx])) : 0;
      const notes = notesIdx !== -1 ? desanitizeCsvCell(cells[notesIdx]) : '';

      const txInput = {
        type,
        exchange: exchange || 'NSE',
        symbol,
        date,
        sequenceIndex,
        quantity,
        price,
        fee,
        notes
      };

      const res = validateTransactionInputs(txInput);
      if (!res.ok) {
        errors.push(`Row ${i + 1}: ${res.errors.join('; ')}`);
      } else {
        validatedTxs.push(res.sanitized);
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors, rowCount: lines.length - 1, validCount: validatedTxs.length };
    }

    const targetId = portfolioId || this.state.activePortfolioId;
    let committed = false;

    const saveResult = this.mutate(state => {
      const p = state.portfolios.find(item => item.id === targetId);
      if (p) {
        if (mode === 'REPLACE') {
          p.transactions = sortTransactions(validatedTxs);
        } else {
          // APPEND
          p.transactions = sortTransactions([...p.transactions, ...validatedTxs]);
        }
        p.updatedAt = new Date().toISOString();
        committed = true;
      }
    });
    if (!saveResult.ok) return { ok: false, error: saveResult.error, errors: [saveResult.error] };

    return committed
      ? { ok: true, importedCount: validatedTxs.length }
      : { ok: false, errors: ['Target portfolio not found'] };
  }
}

// Singleton store instance
export const portfolioStore = new PortfolioStore();

/**
 * React hook for consuming portfolio store with useSyncExternalStore.
 * @returns {{ state: object, actions: PortfolioStore }}
 */
export function usePortfolioStore() {
  const state = useSyncExternalStore(
    portfolioStore.subscribe,
    portfolioStore.getSnapshot,
    portfolioStore.getServerSnapshot
  );

  return {
    state,
    actions: portfolioStore
  };
}
