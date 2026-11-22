// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { validateTransactionInputs, validateManualPriceMark, replayPortfolio } from './portfolioAccounting.js';
import { MAX_PORTFOLIOS, portfolioStore } from './portfolioStore.js';

const buy = (overrides = {}) => ({
  type: 'BUY', instrumentKey: 'NSE:INFY', date: '2026-11-20',
  quantity: 2, price: 100, fee: 0, ...overrides
});

describe('Market R3A — portfolio safety and durability', () => {
  beforeEach(() => {
    localStorage.clear();
    portfolioStore.init();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    portfolioStore.init();
  });

  it('rejects Infinity, unsafe monetary ranges, and non-finite fees', () => {
    expect(validateTransactionInputs(buy({ price: Infinity })).ok).toBe(false);
    expect(validateTransactionInputs(buy({ fee: Infinity })).ok).toBe(false);
    expect(validateTransactionInputs(buy({ quantity: Number.MAX_SAFE_INTEGER + 1 })).ok).toBe(false);
    expect(validateTransactionInputs(buy({ quantity: 1_000_000_000, price: 1_000_000_000 })).ok).toBe(false);
    expect(validateTransactionInputs(buy()).ok).toBe(true);
  });

  it('rejects invalid price marks and calendar dates in direct entry and import', () => {
    expect(validateManualPriceMark('NSE:INFY', Infinity, '2026-11-20').ok).toBe(false);
    expect(validateManualPriceMark('NSE:INFY', 100, '2026-02-30').ok).toBe(false);
    expect(validateManualPriceMark('NSE:INFY', 100, '2026-11-20').ok).toBe(true);
    const revision = portfolioStore.getSnapshot().revision;
    const result = portfolioStore.importJson(JSON.stringify({
      version: 1,
      portfolio: {
        name: 'Imported',
        transactions: [],
        manualPriceMarks: { 'NSE:INFY': { price: 'Infinity', asOfDate: '2026-11-20' } }
      }
    }));
    expect(result.ok).toBe(false);
    expect(portfolioStore.getSnapshot().revision).toBe(revision);
    expect(portfolioStore.setManualPriceMark('default', 'NSE:INFY', 100, '2026-02-30').ok).toBe(false);
  });

  it('never values a position from a corrupt legacy non-finite mark', () => {
    const tx = validateTransactionInputs(buy()).sanitized;
    const result = replayPortfolio([tx], {
      'NSE:INFY': { price: Infinity, asOfDate: '2026-11-20' }
    });
    expect(result.valuationStatus).toBe('PARTIAL');
    expect(result.totalCurrentValue).toBeNull();
  });

  it('rejects an over-capacity import without importing a partial batch', () => {
    for (let index = 1; index < MAX_PORTFOLIOS - 1; index++) {
      expect(portfolioStore.createPortfolio('Existing ' + index).ok).toBe(true);
    }
    const original = portfolioStore.getSnapshot();
    const payload = JSON.stringify({ version: 1, portfolios: [
      { name: 'First import', transactions: [] },
      { name: 'Second import', transactions: [] }
    ] });

    expect(portfolioStore.importJson(payload, 'NEW_PORTFOLIO')).toMatchObject({
      ok: false, errors: [expect.stringContaining('portfolio limit')]
    });
    expect(portfolioStore.getSnapshot()).toBe(original);
  });

  it('reports the actual count for an import that replaces one portfolio', () => {
    const payload = JSON.stringify({ version: 1, portfolios: [
      { name: 'First import', transactions: [buy()] },
      { name: 'Second import', transactions: [] }
    ] });

    expect(portfolioStore.importJson(payload, 'REPLACE_ACTIVE')).toEqual({ ok: true, importedCount: 1 });
    expect(portfolioStore.getSnapshot().portfolios[0].transactions).toHaveLength(1);
  });

  it('fails closed when browser storage refuses a portfolio save', () => {
    const original = portfolioStore.getSnapshot();
    const failWrite = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new Error('QuotaExceeded'); });
    const result = portfolioStore.createPortfolio('Must Not Persist');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('QuotaExceeded');
    expect(portfolioStore.getSnapshot().portfolios).toHaveLength(original.portfolios.length);
    expect(portfolioStore.getSnapshot().revision).toBe(original.revision);
    expect(portfolioStore.getSnapshot().storageWarning).toContain('QuotaExceeded');
    failWrite.mockRestore();
    expect(portfolioStore.createPortfolio('Saved Successfully').ok).toBe(true);
  });
});
