/**
 * NWv7 Market Desk R2.1 - WP-04 Portfolio XIRR Adapter
 *
 * Consumes the shared WP-08 calcXirr contract interface or uses the conforming
 * internal reference solver (annualized with 365.25 day calendar convention).
 *
 * Mathematical specification:
 * NPV(r) = SUM_{i=0..n-1} [ C_i / (1 + r)^((d_i - d_0) / 365.25) ]
 *
 * Golden case: 1-year 10% gain (365 calendar days) produces:
 * (1.1)^(365.25 / 365) - 1 ≈ 10.00718% annualized return.
 */

import { calcXirr } from '../../math/index.js';

const DAYS_PER_YEAR = 365.25;
const MAX_ITERATIONS = 100;
const EPSILON = 1e-7;

/**
 * Calculates day difference in calendar days between two YYYY-MM-DD date strings.
 * Uses UTC to avoid daylight saving shifts.
 * @param {string} d1 
 * @param {string} d0 
 * @returns {number}
 */
export function calendarDayDifference(d1, d0) {
  const [y1, m1, day1] = d1.split('-').map(Number);
  const [y0, m0, day0] = d0.split('-').map(Number);
  const ms1 = Date.UTC(y1, m1 - 1, day1);
  const ms0 = Date.UTC(y0, m0 - 1, day0);
  return Math.round((ms1 - ms0) / 86400000);
}

/**
 * Evaluates Net Present Value (NPV) and its first derivative NPV'(r).
 * @param {Array<{ date: string, amount: number }>} cashFlows 
 * @param {number} rate decimal discount rate (e.g. 0.10)
 * @returns {{ npv: number, derivative: number }}
 */
function evaluateNpvAndDerivative(cashFlows, rate) {
  const d0 = cashFlows[0].date;
  let npv = 0;
  let derivative = 0;

  for (const cf of cashFlows) {
    const days = calendarDayDifference(cf.date, d0);
    const timeFraction = days / DAYS_PER_YEAR;

    const discountFactor = Math.pow(1 + rate, timeFraction);
    npv += cf.amount / discountFactor;

    if (timeFraction !== 0) {
      derivative -= (timeFraction * cf.amount) / (discountFactor * (1 + rate));
    }
  }

  return { npv, derivative };
}

/**
 * Reference internal solver conforming to WP-08 calcXirr contract.
 * Uses Newton-Raphson with bisection fallback for robust convergence.
 *
 * @param {Array<{ date: string, amount: number }>} cashFlows 
 * @param {number} [guess=0.1]
 * @returns {{ ok: boolean, value: number | null, annualizedPercent: number | null, iterations: number, errorCode: string | null }}
 */
export function referenceCalcXirr(cashFlows, guess = 0.1) {
  if (!Array.isArray(cashFlows) || cashFlows.length < 2) {
    return {
      ok: false,
      value: null,
      annualizedPercent: null,
      iterations: 0,
      errorCode: 'INSUFFICIENT_FLOWS'
    };
  }

  // Pre-validate sign alternation
  let hasPos = false;
  let hasNeg = false;
  for (const cf of cashFlows) {
    if (cf.amount > 0) hasPos = true;
    if (cf.amount < 0) hasNeg = true;
  }
  if (!hasPos || !hasNeg) {
    return {
      ok: false,
      value: null,
      annualizedPercent: null,
      iterations: 0,
      errorCode: 'NO_SIGN_CHANGE'
    };
  }

  let rate = guess;
  let iterations = 0;

  // Newton-Raphson iterations
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations += 1;
    // Keep rate in valid mathematical domain (> -1)
    if (rate <= -0.9999) {
      rate = -0.999;
    }

    const { npv, derivative } = evaluateNpvAndDerivative(cashFlows, rate);

    if (Math.abs(npv) < EPSILON) {
      const annualizedPercent = Math.round(rate * 1000000) / 10000;
      return {
        ok: true,
        value: rate,
        annualizedPercent,
        iterations,
        errorCode: null
      };
    }

    if (Math.abs(derivative) < 1e-12) {
      break; // Derivative too flat, switch to bisection
    }

    const nextRate = rate - (npv / derivative);
    if (Math.abs(nextRate - rate) < EPSILON) {
      const annualizedPercent = Math.round(nextRate * 1000000) / 10000;
      return {
        ok: true,
        value: nextRate,
        annualizedPercent,
        iterations,
        errorCode: null
      };
    }

    rate = nextRate;
  }

  // Bisection fallback in [-0.999, 10.0]
  let low = -0.999;
  let high = 10.0;
  let lowNpv = evaluateNpvAndDerivative(cashFlows, low).npv;
  let highNpv = evaluateNpvAndDerivative(cashFlows, high).npv;

  if (lowNpv * highNpv > 0) {
    // Expand upper bound up to 100.0 (10,000%)
    high = 100.0;
    highNpv = evaluateNpvAndDerivative(cashFlows, high).npv;
  }

  if (lowNpv * highNpv <= 0) {
    for (let j = 0; j < 100; j++) {
      iterations += 1;
      const mid = (low + high) / 2;
      const midNpv = evaluateNpvAndDerivative(cashFlows, mid).npv;

      if (Math.abs(midNpv) < EPSILON || (high - low) / 2 < EPSILON) {
        const annualizedPercent = Math.round(mid * 1000000) / 10000;
        return {
          ok: true,
          value: mid,
          annualizedPercent,
          iterations,
          errorCode: null
        };
      }

      if (lowNpv * midNpv <= 0) {
        high = mid;
        highNpv = midNpv;
      } else {
        low = mid;
        lowNpv = midNpv;
      }
    }
  }

  return {
    ok: false,
    value: null,
    annualizedPercent: null,
    iterations,
    errorCode: 'SOLVER_DIVERGENCE'
  };
}

/**
 * Adapt and compute XIRR using an injected WP-08 calcXirr function or reference fallback.
 * @param {Array<{ date: string, amount: number }>} cashFlows 
 * @param {Function} [customSolver] optional solver injected from WP-08 contract
 * @returns {{ ok: boolean, value: number | null, annualizedPercent: number | null, iterations: number, errorCode: string | null }}
 */
export function computePortfolioXirr(cashFlows, customSolver = null) {
  const solver = customSolver || calcXirr;
  if (typeof solver === 'function') {
    try {
      const result = solver(cashFlows);
      if (result && typeof result === 'object' && result.ok) {
        return {
          ok: true,
          value: result.value ?? result.rate,
          annualizedPercent: result.annualizedPercent ?? (typeof result.ratePercent === 'number' ? Number(result.ratePercent.toFixed(2)) : null),
          iterations: result.iterations || 0,
          annualizationBasis: result.annualizationBasis || 365.25,
          errorCode: null
        };
      }
    } catch {
      // Fall through to reference solver if external fails
    }
  }
  return referenceCalcXirr(cashFlows);
}
