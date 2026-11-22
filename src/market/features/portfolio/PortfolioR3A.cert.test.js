// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { validateTransactionInputs, validateManualPriceMark, replayPortfolio } from './portfolioAccounting.js';
import { portfolioStore } from './portfolioStore.js';

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
