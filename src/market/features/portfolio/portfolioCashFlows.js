/**
 * NWv7 Market Desk R2.1 - WP-04 Portfolio Cash Flows Engine
 * Extracts and consolidates dated cash flows from portfolio transactions and terminal valuation marks
 * for XIRR calculation.
 */

import { replayPortfolio } from './portfolioAccounting.js';

/**
 * Builds dated cash flows array from transactions and manual price marks.
 * 
 * Rules:
 * 1. BUY: Cash outflow (negative) = -(quantity * price + fee)
 * 2. SELL: Cash inflow (positive) = +(quantity * price - fee)
 * 3. Terminal valuation:
 *    - For open portfolio (active holdings > 0), requires COMPLETE valuation.
 *    - Terminal date must be >= latest transaction date.
 *    - For liquidated portfolio (active holdings === 0), terminal mark is not required (realized-only XIRR).
 * 4. Combines cash flows occurring on the same date.
 * 5. Requires at least one positive and one negative cash flow.
 *
 * @param {Array<object>} transactions 
 * @param {Record<string, { price: number, asOfDate: string }>} manualPriceMarks 
 * @returns {{ ok: boolean, cashFlows?: Array<{ date: string, amount: number }>, terminalDate?: string | null, errorCode?: string, message?: string }}
 */
export function buildPortfolioCashFlows(transactions = [], manualPriceMarks = {}) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return {
      ok: false,
      errorCode: 'NO_TRANSACTIONS',
      message: 'No transactions recorded in this portfolio'
    };
  }

  const replayed = replayPortfolio(transactions, manualPriceMarks);

  if (replayed.hasInvalidLedger) {
    return {
      ok: false,
      errorCode: 'INVALID_LEDGER',
      message: 'Cannot compute cash flows: portfolio contains invalid transaction ledger (oversell detected)'
    };
  }

  // Find latest transaction date
  let latestTxDate = '';
  for (const tx of replayed.sortedTransactions) {
    if (tx.date && tx.date > latestTxDate) {
      latestTxDate = tx.date;
    }
  }

  const dailyAmounts = new Map();

  // Accumulate transaction cash flows
  for (const tx of replayed.sortedTransactions) {
    const qty = Number(tx.quantity);
    const price = Number(tx.price);
    const fee = Number(tx.fee || 0);

    let flowAmount = 0;
    if (tx.type === 'BUY') {
      flowAmount = -(qty * price + fee);
    } else if (tx.type === 'SELL') {
      flowAmount = (qty * price) - fee;
    }

    const current = dailyAmounts.get(tx.date) || 0;
    dailyAmounts.set(tx.date, current + flowAmount);
  }

  let terminalDate = null;

  // Terminal valuation flow
  if (replayed.activeHoldingsCount > 0) {
    if (replayed.valuationStatus !== 'COMPLETE' || replayed.totalCurrentValue === null) {
      return {
        ok: false,
        errorCode: 'INCOMPLETE_VALUATION',
        message: 'Manual price marks required for all active holdings before computing portfolio XIRR'
      };
    }

    // Determine max mark date among active holdings
    let maxMarkDate = '';
    for (const pos of replayed.positions) {
      if (pos.currentQty > 0 && pos.priceAsOfDate) {
        if (pos.priceAsOfDate > maxMarkDate) {
          maxMarkDate = pos.priceAsOfDate;
        }
      }
    }

    if (!maxMarkDate) {
      return {
        ok: false,
        errorCode: 'MISSING_MARK_DATE',
        message: 'Active holdings lack valid as-of dates for valuation'
      };
    }

    if (maxMarkDate < latestTxDate) {
      return {
        ok: false,
        errorCode: 'INCONSISTENT_DATES',
        message: `Terminal valuation date (${maxMarkDate}) cannot precede latest transaction date (${latestTxDate})`
      };
    }

    terminalDate = maxMarkDate;
    const current = dailyAmounts.get(terminalDate) || 0;
    dailyAmounts.set(terminalDate, current + replayed.totalCurrentValue);
  }

  // Convert map to sorted array of cash flows
  const cashFlows = [];
  for (const [date, rawAmount] of dailyAmounts.entries()) {
    const amount = Math.round(rawAmount * 100) / 100;
    // Keep non-zero flows
    if (Math.abs(amount) > 0.001) {
      cashFlows.push({ date, amount });
    }
  }

  cashFlows.sort((a, b) => a.date.localeCompare(b.date));

  // Check pre-solver conditions
  let hasPositive = false;
  let hasNegative = false;
  for (const cf of cashFlows) {
    if (cf.amount > 0) hasPositive = true;
    if (cf.amount < 0) hasNegative = true;
  }

  if (cashFlows.length < 2 || !hasPositive || !hasNegative) {
    return {
      ok: false,
      errorCode: 'INSUFFICIENT_CASH_FLOWS',
      message: 'XIRR requires at least one cash outflow (negative) and one cash inflow or valuation (positive)'
    };
  }

  return {
    ok: true,
    cashFlows,
    terminalDate
  };
}
