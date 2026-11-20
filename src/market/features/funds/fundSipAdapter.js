/**
 * NWv7 Market Desk R2.1 - WP-05 SIP Math Adapter
 * Consumes the WP-08 shared calcSip contract interface or uses the conforming
 * internal reference solver for illustrative scenario calculations.
 *
 * NOTE: Scenario illustration only, not an investment forecast or guarantee of future returns.
 */

import { calcSip } from '../../math/index.js';

/**
 * Conforming reference solver for end-of-month illustrative SIP compounding.
 * @param {number} monthly monthly contribution in INR
 * @param {number} years tenure in years
 * @param {number} annualPercent nominal assumed annual return percentage
 * @returns {{ ok: boolean, invested: number, futureValue: number, estimatedGain: number, months: number, errorCode?: string }}
 */
export function referenceCalcSip(monthly, years, annualPercent) {
  const p = Number(monthly);
  const y = Number(years);
  const rAnn = Number(annualPercent);

  if (!Number.isFinite(p) || p <= 0) {
    return { ok: false, invested: 0, futureValue: 0, estimatedGain: 0, months: 0, errorCode: 'INVALID_MONTHLY_AMOUNT' };
  }
  if (!Number.isFinite(y) || y <= 0 || y > 50) {
    return { ok: false, invested: 0, futureValue: 0, estimatedGain: 0, months: 0, errorCode: 'INVALID_TENURE_YEARS' };
  }
  if (!Number.isFinite(rAnn) || rAnn < 0 || rAnn > 100) {
    return { ok: false, invested: 0, futureValue: 0, estimatedGain: 0, months: 0, errorCode: 'INVALID_RETURN_PERCENT' };
  }

  const months = Math.round(y * 12);
  const invested = Math.round(p * months * 100) / 100;
  const rMonth = rAnn / 1200;

  let futureValue;
  if (rMonth === 0) {
    futureValue = invested;
  } else {
    futureValue = p * ((Math.pow(1 + rMonth, months) - 1) / rMonth);
  }

  const roundedFv = Math.round(futureValue * 100) / 100;
  const estimatedGain = Math.round((roundedFv - invested) * 100) / 100;

  return {
    ok: true,
    invested,
    futureValue: roundedFv,
    estimatedGain,
    months
  };
}

/**
 * Computes illustrative SIP scenario using WP-08 contract solver or reference fallback.
 * @param {number} monthly 
 * @param {number} years 
 * @param {number} annualPercent 
 * @param {Function} [customSolver] optional solver injected from WP-08
 * @returns {{ ok: boolean, invested: number, futureValue: number, estimatedGain: number, months: number, errorCode?: string }}
 */
export function computeFundSip(monthly, years, annualPercent, customSolver = null) {
  if (typeof customSolver === 'function') {
    try {
      const outcome = customSolver(monthly, years, annualPercent);
      if (outcome && typeof outcome === 'object' && outcome.ok) {
        return outcome;
      }
    } catch {
      // Fall through to shared solver
    }
  }
  try {
    const outcome = calcSip({
      monthlyContribution: monthly,
      termYears: years,
      nominalAnnualPercent: annualPercent,
      contributionTiming: 'END_OF_MONTH'
    });
    if (outcome && outcome.ok) {
      return {
        ok: true,
        invested: Math.round(outcome.invested * 100) / 100,
        futureValue: Math.round(outcome.futureValue * 100) / 100,
        estimatedGain: Math.round(outcome.gain * 100) / 100,
        months: outcome.termMonths
      };
    }
  } catch {
    // Fallback to referenceCalcSip
  }
  return referenceCalcSip(monthly, years, annualPercent);
}
