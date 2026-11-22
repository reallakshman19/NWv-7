/**
 * NWv7 Market Desk R2.1 - WP-04 Portfolio Accounting Engine
 * Pure, deterministic long-only equity accounting using moving weighted-average cost basis.
 *
 * NOTE: Analytical P&L only. Moving weighted-average cost is NOT tax-calculated capital gains
 * (Indian Income Tax Act Sec 45(2A) requires FIFO for tax-grade reporting).
 */

import { parseInstrumentKey, canonicalInstrumentKey } from '../../contracts/instrumentIdentity.js';

export const TRANSACTION_TYPES = Object.freeze(['BUY', 'SELL']);
export const VALUATION_STATUSES = Object.freeze(['COMPLETE', 'PARTIAL', 'LIQUIDATED', 'INVALID']);
export const POSITION_STATUSES = Object.freeze(['VALID', 'INVALID_LEDGER']);

/**
 * Validates transaction input attributes.
 * @param {object} input 
 * @returns {{ ok: boolean, errors: string[], sanitized: object | null }}
 */
export function validateTransactionInputs(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['Transaction data must be an object'], sanitized: null };
  }

  const errors = [];

  // 1. Transaction Type
  const type = typeof input.type === 'string' ? input.type.trim().toUpperCase() : '';
  if (!TRANSACTION_TYPES.includes(type)) {
    errors.push('Transaction type must be BUY or SELL');
  }

  // 2. Instrument Key / Symbol & Exchange
  let instrumentKey = input.instrumentKey;
  let parsed = null;
  if (typeof instrumentKey === 'string' && instrumentKey.trim()) {
    parsed = parseInstrumentKey(instrumentKey.trim());
    if (!parsed) {
      errors.push(`Invalid instrument key format: ${instrumentKey}. Expected format: EXCHANGE:SYMBOL (e.g. NSE:INFY)`);
    }
  } else if (typeof input.symbol === 'string' && typeof input.exchange === 'string') {
    const canonical = canonicalInstrumentKey(input.exchange, input.symbol);
    if (canonical) {
      parsed = parseInstrumentKey(canonical);
      instrumentKey = canonical;
    } else {
      errors.push(`Invalid exchange (${input.exchange}) or symbol (${input.symbol})`);
    }
  } else {
    errors.push('Instrument key or exchange and symbol required');
  }

  // 3. Trade Date (YYYY-MM-DD, valid calendar day)
  const dateStr = typeof input.date === 'string' ? input.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    errors.push('Trade date must be in YYYY-MM-DD format');
  } else {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    if (
      dateObj.getUTCFullYear() !== y ||
      dateObj.getUTCMonth() !== m - 1 ||
      dateObj.getUTCDate() !== d ||
      y < 1990 || y > 2100
    ) {
      errors.push(`Invalid calendar date: ${dateStr}`);
    }
  }

  // 4. Sequence Index (for deterministic same-day ordering, integer 0..999)
  let sequenceIndex = 0;
  if (input.sequenceIndex !== undefined && input.sequenceIndex !== null && input.sequenceIndex !== '') {
    const seq = Number(input.sequenceIndex);
    if (!Number.isInteger(seq) || seq < 0 || seq > 999) {
      errors.push('Sequence index must be an integer between 0 and 999');
    } else {
      sequenceIndex = seq;
    }
  }

  // 5. Quantity (positive integer)
  const quantity = Number(input.quantity);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    errors.push('Quantity must be a positive integer greater than 0');
  }

  // 6. Unit Price (positive number > 0, max 4 decimal places)
  const price = Number(input.price);
  if (!Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(Math.round(price * 10000)) || Math.round(price * 10000) <= 0) {
    errors.push('Unit price must be a positive number greater than 0');
  } else {
    const roundedPrice = Math.round(price * 10000) / 10000;
    if (Math.abs(price - roundedPrice) > 1e-6) {
      errors.push('Unit price cannot have more than 4 decimal places');
    }
  }

  // 7. Brokerage / Statutory Fees (non-negative number >= 0, default 0, max 2 decimal places)
  let fee = 0;
  if (input.fee !== undefined && input.fee !== null && input.fee !== '') {
    const feeNum = Number(input.fee);
    if (!Number.isFinite(feeNum) || feeNum < 0 || !Number.isSafeInteger(Math.round(feeNum * 100))) {
      errors.push('Fee must be a non-negative number');
    } else {
      const roundedFee = Math.round(feeNum * 100) / 100;
      if (Math.abs(feeNum - roundedFee) > 1e-4) {
        errors.push('Fee cannot have more than 2 decimal places');
      }
      fee = roundedFee;
    }
  }

  // All ledger amounts must remain representable in integer cents.
  if (Number.isFinite(price) && Number.isSafeInteger(quantity) && quantity > 0 &&
      !Number.isSafeInteger(Math.round((quantity * price + fee) * 100))) {
    errors.push('Trade value exceeds safe accounting range');
  }

  // 8. Notes (optional string, max 280 chars)
  let notes = '';
  if (input.notes !== undefined && input.notes !== null) {
    if (typeof input.notes !== 'string') {
      errors.push('Notes must be a text string');
    } else if (input.notes.length > 280) {
      errors.push('Notes cannot exceed 280 characters');
    } else {
      notes = input.notes.trim();
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, sanitized: null };
  }

  const sanitized = {
    id: input.id || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    type,
    instrumentKey: parsed.key,
    exchange: parsed.exchange,
    symbol: parsed.symbol,
    date: dateStr,
    sequenceIndex,
    quantity,
    price: Math.round(price * 10000) / 10000,
    fee: Math.round(fee * 100) / 100,
    notes,
    createdAt: input.createdAt || new Date().toISOString()
  };

  return { ok: true, errors: [], sanitized };
}

/**
 * Validate a dated manual price mark for both interactive entry and JSON import.
 * Do not allow invalid calendar days or non-finite monetary values into replay.
 */
export function validateManualPriceMark(instrumentKey, price, asOfDate, recordedAt = null) {
  const parsed = typeof instrumentKey === 'string' ? parseInstrumentKey(instrumentKey) : null;
  if (!parsed) return { ok: false, error: 'Invalid instrument key for manual price mark' };

  const numericPrice = Number(price);
  const scaledPrice = Math.round(numericPrice * 10000);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0 ||
      !Number.isSafeInteger(scaledPrice) || scaledPrice <= 0) {
    return { ok: false, error: 'Price mark must be a finite positive number within safe accounting range' };
  }

  if (typeof asOfDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    return { ok: false, error: 'As-of date must be in YYYY-MM-DD format' };
  }
  const [y, m, d] = asOfDate.split('-').map(Number);
  const actual = new Date(Date.UTC(y, m - 1, d));
  if (y < 1990 || y > 2100 || actual.getUTCFullYear() !== y ||
      actual.getUTCMonth() !== m - 1 || actual.getUTCDate() !== d) {
    return { ok: false, error: 'Invalid as-of calendar date' };
  }

  const safeRecordedAt = typeof recordedAt === 'string' && Number.isFinite(Date.parse(recordedAt))
    ? recordedAt : new Date().toISOString();
  return {
    ok: true,
    sanitized: { price: scaledPrice / 10000, asOfDate, recordedAt: safeRecordedAt }
  };
}

/**
 * Deterministic sort for transactions:
 * 1. date ASC
 * 2. sequenceIndex ASC
 * 3. createdAt ASC
 * 4. id ASC
 * @param {Array<object>} transactions 
 * @returns {Array<object>} sorted shallow copy
 */
export function sortTransactions(transactions) {
  if (!Array.isArray(transactions)) return [];
  return [...transactions].sort((a, b) => {
    // 1. Date comparison
    const dateComp = (a.date || '').localeCompare(b.date || '');
    if (dateComp !== 0) return dateComp;

    // 2. Sequence Index comparison
    const seqA = Number.isInteger(a.sequenceIndex) ? a.sequenceIndex : 0;
    const seqB = Number.isInteger(b.sequenceIndex) ? b.sequenceIndex : 0;
    if (seqA !== seqB) return seqA - seqB;

    // 3. CreatedAt comparison
    const createdComp = (a.createdAt || '').localeCompare(b.createdAt || '');
    if (createdComp !== 0) return createdComp;

    // 4. Stable tiebreaker by ID
    return (a.id || '').localeCompare(b.id || '');
  });
}

/**
 * Replays transaction ledger to compute long-only moving weighted-average cost basis and valuation.
 * If an oversell occurs (sell quantity > current quantity), the instrument is flagged as INVALID_LEDGER
 * and portfolio totals depending on valid state are marked unavailable (fail-closed).
 *
 * @param {Array<object>} transactions 
 * @param {Record<string, { price: number, asOfDate: string, recordedAt?: string }>} manualPriceMarks 
 * @returns {object} Replayed portfolio summary
 */
export function replayPortfolio(transactions = [], manualPriceMarks = {}) {
  const sorted = sortTransactions(transactions);

  // Group transactions by instrument key
  const positionsMap = new Map();

  for (const rawTx of sorted) {
    const key = rawTx.instrumentKey;
    if (!key) continue;

    if (!positionsMap.has(key)) {
      const parsed = parseInstrumentKey(key) || { exchange: 'UNKNOWN', symbol: key };
      positionsMap.set(key, {
        instrumentKey: key,
        exchange: parsed.exchange,
        symbol: parsed.symbol,
        currentQty: 0,
        totalPurchasedQty: 0,
        totalSoldQty: 0,
        remainingCostBasis: 0,
        averageCost: 0,
        realizedPnL: 0,
        totalFeesPaid: 0,
        status: 'VALID',
        oversellDeficit: 0,
        invalidReason: null,
        invalidTxId: null,
        transactionCount: 0
      });
    }

    const pos = positionsMap.get(key);
    pos.transactionCount += 1;

    // If position already failed into invalid ledger, stop updating accounting numbers
    if (pos.status === 'INVALID_LEDGER') {
      continue;
    }

    const qty = Number(rawTx.quantity);
    const price = Number(rawTx.price);
    const fee = Number(rawTx.fee || 0);

    if (rawTx.type === 'BUY') {
      const buyOutflow = qty * price + fee;
      pos.currentQty += qty;
      pos.totalPurchasedQty += qty;
      pos.remainingCostBasis += buyOutflow;
      pos.totalFeesPaid += fee;
      pos.averageCost = pos.currentQty > 0 ? pos.remainingCostBasis / pos.currentQty : 0;
    } else if (rawTx.type === 'SELL') {
      if (qty > pos.currentQty) {
        // Fail-closed oversell error!
        pos.status = 'INVALID_LEDGER';
        pos.oversellDeficit = qty - pos.currentQty;
        pos.invalidReason = `Oversell detected: tried to sell ${qty} units with only ${pos.currentQty} available`;
        pos.invalidTxId = rawTx.id;
        continue;
      }

      // Proportional cost relief under moving weighted-average method
      const unitCost = pos.currentQty > 0 ? pos.remainingCostBasis / pos.currentQty : 0;
      const costRelieved = qty * unitCost;

      // Net sell cash inflow (proceeds net of fee)
      const netSellInflow = (qty * price) - fee;
      const tradeRealizedPnL = netSellInflow - costRelieved;

      pos.currentQty -= qty;
      pos.totalSoldQty += qty;
      pos.remainingCostBasis -= costRelieved;
      pos.realizedPnL += tradeRealizedPnL;
      pos.totalFeesPaid += fee;

      if (pos.currentQty === 0) {
        // Position completely liquidated: prevent floating-point residual
        pos.remainingCostBasis = 0;
        pos.averageCost = 0;
      } else {
        pos.averageCost = pos.remainingCostBasis / pos.currentQty;
      }
    }
  }

  // Value positions against manual price marks
  let hasInvalidLedger = false;
  let allActiveValued = true;
  let activeHoldingsCount = 0;
  let totalRemainingCostBasis = 0;
  let totalRealizedPnL = 0;
  let totalFeesPaid = 0;
  let totalCurrentValue = 0;

  const positions = [];

  for (const pos of positionsMap.values()) {
    if (pos.status === 'INVALID_LEDGER') {
      hasInvalidLedger = true;
    }

    // Clean monetary precision
    pos.remainingCostBasis = Math.round(pos.remainingCostBasis * 100) / 100;
    pos.averageCost = Math.round(pos.averageCost * 10000) / 10000;
    pos.realizedPnL = Math.round(pos.realizedPnL * 100) / 100;
    pos.totalFeesPaid = Math.round(pos.totalFeesPaid * 100) / 100;

    totalRemainingCostBasis += pos.remainingCostBasis;
    totalRealizedPnL += pos.realizedPnL;
    totalFeesPaid += pos.totalFeesPaid;

    if (pos.currentQty > 0) {
      activeHoldingsCount += 1;

      const mark = manualPriceMarks[pos.instrumentKey];
      if (mark && Number.isFinite(mark.price) && mark.price > 0 &&
          Number.isSafeInteger(Math.round(pos.currentQty * mark.price * 100))) {
        pos.currentPrice = mark.price;
        pos.currentValue = Math.round(pos.currentQty * mark.price * 100) / 100;
        pos.unrealizedPnL = Math.round((pos.currentValue - pos.remainingCostBasis) * 100) / 100;
        pos.unrealizedPnLPercent = pos.remainingCostBasis > 0
          ? Math.round(((pos.currentValue - pos.remainingCostBasis) / pos.remainingCostBasis) * 10000) / 100
          : 0;
        pos.priceAsOfDate = mark.asOfDate || null;
        pos.hasValuation = true;
        totalCurrentValue += pos.currentValue;
      } else {
        pos.currentPrice = null;
        pos.currentValue = null;
        pos.unrealizedPnL = null;
        pos.unrealizedPnLPercent = null;
        pos.priceAsOfDate = null;
        pos.hasValuation = false;
        allActiveValued = false;
      }
    } else {
      // Liquidated position
      pos.currentPrice = null;
      pos.currentValue = 0;
      pos.unrealizedPnL = 0;
      pos.unrealizedPnLPercent = 0;
      pos.priceAsOfDate = null;
      pos.hasValuation = true;
    }

    positions.push(pos);
  }

  // Sort positions: active positions first (by remaining basis DESC), then liquidated
  positions.sort((a, b) => {
    if (a.currentQty > 0 && b.currentQty === 0) return -1;
    if (a.currentQty === 0 && b.currentQty > 0) return 1;
    return b.remainingCostBasis - a.remainingCostBasis || a.instrumentKey.localeCompare(b.instrumentKey);
  });

  // Determine portfolio-level valuation and validity status
  let validity = 'VALID';
  let valuationStatus = 'COMPLETE';
  let finalCurrentValue = null;
  let finalUnrealizedPnL = null;
  let finalUnrealizedPnLPercent = null;

  if (hasInvalidLedger) {
    validity = 'INVALID_LEDGER';
    valuationStatus = 'INVALID';
  } else if (activeHoldingsCount === 0) {
    valuationStatus = 'LIQUIDATED';
    finalCurrentValue = 0;
    finalUnrealizedPnL = 0;
    finalUnrealizedPnLPercent = 0;
  } else if (allActiveValued) {
    valuationStatus = 'COMPLETE';
    finalCurrentValue = Math.round(totalCurrentValue * 100) / 100;
    finalUnrealizedPnL = Math.round((finalCurrentValue - totalRemainingCostBasis) * 100) / 100;
    finalUnrealizedPnLPercent = totalRemainingCostBasis > 0
      ? Math.round(((finalCurrentValue - totalRemainingCostBasis) / totalRemainingCostBasis) * 10000) / 100
      : 0;
  } else {
    valuationStatus = 'PARTIAL';
    // Deliberately null: missing marks display "Unavailable", never ₹0.00
    finalCurrentValue = null;
    finalUnrealizedPnL = null;
    finalUnrealizedPnLPercent = null;
  }

  return {
    validity,
    hasInvalidLedger,
    valuationStatus,
    activeHoldingsCount,
    totalHoldingsCount: positions.length,
    transactionsCount: sorted.length,
    totalRemainingCostBasis: Math.round(totalRemainingCostBasis * 100) / 100,
    totalRealizedPnL: Math.round(totalRealizedPnL * 100) / 100,
    totalFeesPaid: Math.round(totalFeesPaid * 100) / 100,
    totalCurrentValue: finalCurrentValue,
    totalUnrealizedPnL: finalUnrealizedPnL,
    totalUnrealizedPnLPercent: finalUnrealizedPnLPercent,
    positions,
    sortedTransactions: sorted
  };
}
