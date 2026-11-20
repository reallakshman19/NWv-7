/**
 * NWv7 Market Desk R2.1 - WP-08
 * CAGR, Absolute Return & Calendar-Day Engine
 *
 * Contract: market-r21-contract-v1
 * Convention: ACT/365.25 annualization basis
 */

import { parseDateToDays, DEFAULT_ANNUALIZATION_BASIS } from './xirrSolver.js';

export function calcAbsoluteReturn(startValue, endValue) {
  const v0 = Number(startValue);
  const v1 = Number(endValue);
  if (!Number.isFinite(v0) || !Number.isFinite(v1) || v0 <= 0) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Values must be positive finite numbers' };
  }
  const gain = v1 - v0;
  const returnPercent = (gain / v0) * 100;
  return { ok: true, value: returnPercent, returnPercent, gain };
}

export function calcCagr(options = {}) {
  const v0 = Number(options.startValue ?? options.initialValue ?? options.v0);
  const v1 = Number(options.endValue ?? options.finalValue ?? options.v1);
  const basis = Number(options.annualizationBasis) || DEFAULT_ANNUALIZATION_BASIS;

  let elapsedDays = null;
  if (options.days != null && Number.isFinite(Number(options.days))) {
    elapsedDays = Number(options.days);
  } else if (options.startDate != null && options.endDate != null) {
    const d0 = parseDateToDays(options.startDate);
    const d1 = parseDateToDays(options.endDate);
    if (d0 != null && d1 != null) {
      elapsedDays = d1 - d0;
    }
  }

  if (!Number.isFinite(v0) || v0 <= 0 || !Number.isFinite(v1) || v1 <= 0) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Start and end values must be positive finite numbers' };
  }
  if (!Number.isFinite(elapsedDays) || elapsedDays <= 0) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Elapsed days must be a positive finite number' };
  }

  const ratio = v1 - v0;
  const absReturnPercent = (ratio / v0) * 100;

  const exponent = basis / elapsedDays;
  const cagrDecimal = Math.pow(v1 / v0, exponent) - 1;
  const cagrPercent = cagrDecimal * 100;
  const isShortTerm = elapsedDays < 365;

  return {
    ok: true,
    value: cagrPercent,
    cagrPercent,
    cagrDecimal,
    absoluteReturnPercent: absReturnPercent,
    elapsedDays,
    annualizationBasis: basis,
    isShortTerm,
    notice: isShortTerm
      ? 'Elapsed horizon is under 1 year (<365 days); annualized return is mathematically projected but absolute return is traditionally preferred.'
      : null
  };
}
