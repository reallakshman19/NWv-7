/**
 * NWv7 Market Desk R2.1 - WP-08
 * XIRR Numerical Solver: Transformed-Domain Multi-Root Solver with ACT/365.25 Basis
 *
 * Contract: market-r21-contract-v1
 * Convention: NWv7 XIRR (ACT/365.25)
 * Equation: NPV(R) = sum_i [ C_i / (1 + R)^((d_i - d_0) / 365.25) ] = 0
 * Transformed variable: x = ln(1 + R) => 1 + R = exp(x)
 */

const DAY_MS = 86400000;
export const DEFAULT_ANNUALIZATION_BASIS = 365.25;

/**
 * Parses date inputs into clean epoch days.
 * Supports ISO strings 'YYYY-MM-DD', timestamps, or Date instances.
 */
export function parseDateToDays(dateInput) {
  if (dateInput == null) return null;
  if (dateInput instanceof Date) {
    if (Number.isNaN(dateInput.getTime())) return null;
    return Math.floor(dateInput.getTime() / DAY_MS);
  }
  if (typeof dateInput === 'number' && Number.isFinite(dateInput)) {
    return Math.floor(dateInput / DAY_MS);
  }
  if (typeof dateInput === 'string') {
    const s = dateInput.trim();
    // Support YYYY-MM-DD
    const mIso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (mIso) {
      const y = Number(mIso[1]), m = Number(mIso[2]), d = Number(mIso[3]);
      const date = new Date(Date.UTC(y, m - 1, d));
      if (Number.isNaN(date.getTime())) return null;
      return Math.floor(date.getTime() / DAY_MS);
    }
    // Support DD-MM-YYYY
    const mDmy = /^(\d{2})-(\d{2})-(\d{4})/.exec(s);
    if (mDmy) {
      const d = Number(mDmy[1]), m = Number(mDmy[2]), y = Number(mDmy[3]);
      const date = new Date(Date.UTC(y, m - 1, d));
      if (Number.isNaN(date.getTime())) return null;
      return Math.floor(date.getTime() / DAY_MS);
    }
    const parsed = Date.parse(s);
    if (Number.isFinite(parsed)) return Math.floor(parsed / DAY_MS);
  }
  return null;
}

/**
 * Normalizes, validates, and coalesces cash flows.
 */
export function normalizeCashFlows(rawCashFlows = []) {
  if (!Array.isArray(rawCashFlows) || rawCashFlows.length < 2) {
    return { ok: false, error: 'INVALID_CASH_FLOWS', message: 'Expected at least 2 cash flow entries' };
  }

  const parsed = [];
  for (const entry of rawCashFlows) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: 'INVALID_CASH_FLOWS', message: 'Cash flow entry must be an object' };
    }
    const days = parseDateToDays(entry.date ?? entry.d);
    const amount = Number(entry.amount ?? entry.v ?? entry.cashFlow);
    if (days == null || !Number.isFinite(amount)) {
      return { ok: false, error: 'INVALID_CASH_FLOWS', message: 'Cash flow date or amount is invalid' };
    }
    parsed.push({ days, amount });
  }

  // Sort chronologically
  parsed.sort((a, b) => a.days - b.days);

  // Check if all input dates were identical before coalescing
  if (parsed[0].days === parsed[parsed.length - 1].days) {
    return { ok: false, error: 'IDENTICAL_DATES', message: 'All cash flows occur on identical calendar date' };
  }

  // Coalesce same-day cash flows
  const coalesced = [];
  for (const item of parsed) {
    const last = coalesced[coalesced.length - 1];
    if (last && last.days === item.days) {
      last.amount += item.amount;
    } else {
      coalesced.push({ days: item.days, amount: item.amount });
    }
  }

  // Filter out microscopic floating residual zeros (e.g. 1e-15)
  const nonZero = coalesced.filter(item => Math.abs(item.amount) > 1e-12);

  if (nonZero.length < 2) {
    return { ok: false, error: 'NET_ZERO_CASH_FLOWS', message: 'Net cash flows after coalescing contain fewer than 2 non-zero points' };
  }

  const d0 = nonZero[0].days;
  const dMax = nonZero[nonZero.length - 1].days;
  if (dMax === d0) {
    return { ok: false, error: 'IDENTICAL_DATES', message: 'All non-zero cash flows occur on identical calendar date' };
  }

  let hasPos = false;
  let hasNeg = false;
  let sumAbs = 0;
  for (const item of nonZero) {
    if (item.amount > 0) hasPos = true;
    if (item.amount < 0) hasNeg = true;
    sumAbs += Math.abs(item.amount);
  }

  if (!hasPos || !hasNeg) {
    return { ok: false, error: 'NO_SIGN_CHANGE', message: 'Cash flow series must contain at least one positive and one negative amount' };
  }

  return { ok: true, cashFlows: nonZero, d0, dMax, sumAbs };
}

/**
 * Evaluates NPV(x) and analytical derivative NPV'(x) in the transformed domain x = ln(1 + R).
 */
function evalNpv(x, cashFlows, d0, basis) {
  let npv = 0;
  let dNpv = 0;
  for (const cf of cashFlows) {
    const t = (cf.days - d0) / basis;
    // factor = exp(-x * t)
    const factor = Math.exp(-x * t);
    npv += cf.amount * factor;
    dNpv += -t * cf.amount * factor;
  }
  return { npv, dNpv };
}

/**
 * Searches for all roots of the cash flow series across rate domain.
 */
export function findXirrRoots(rawCashFlows, options = {}) {
  const norm = normalizeCashFlows(rawCashFlows);
  if (!norm.ok) return norm;

  const { cashFlows, d0, sumAbs } = norm;
  const basis = Number(options.annualizationBasis) || DEFAULT_ANNUALIZATION_BASIS;
  const tolAbs = Number(options.toleranceAbs) || 1e-7;
  const tolRel = Number(options.toleranceRel) || 1e-6;
  const tolResidual = tolAbs + tolRel * sumAbs;

  // Domain search in x = ln(1 + R):
  // R in [-0.999, 10.0] => x in [ln(0.001), ln(11.0)] approx [-6.907755, 2.397895]
  const xMin = Math.log(0.001);
  const xMax = Math.log(11.0);
  const steps = 200;
  const dx = (xMax - xMin) / steps;

  const brackets = [];
  let prevX = xMin;
  let prevEval = evalNpv(prevX, cashFlows, d0, basis);

  for (let i = 1; i <= steps; i++) {
    const currX = xMin + i * dx;
    const currEval = evalNpv(currX, cashFlows, d0, basis);

    if (Math.abs(prevEval.npv) <= tolResidual) {
      brackets.push({ xA: prevX - 1e-6, xB: prevX + 1e-6, approxX: prevX });
    } else if (prevEval.npv * currEval.npv < 0) {
      brackets.push({ xA: prevX, xB: currX, approxX: (prevX + currX) / 2 });
    }

    prevX = currX;
    prevEval = currEval;
  }

  const roots = [];

  for (const b of brackets) {
    let xA = b.xA;
    let xB = b.xB;
    let method = 'NEWTON_RAPHSON';
    let x = (xA + xB) / 2;
    let iter = 0;
    const maxIter = 60;
    let converged = false;

    // Try Newton-Raphson within bracket
    for (iter = 0; iter < 35; iter++) {
      const { npv, dNpv } = evalNpv(x, cashFlows, d0, basis);
      if (Math.abs(dNpv) < 1e-12) {
        method = 'BISECTION';
        break;
      }
      const step = npv / dNpv;
      x = x - step;
      if (x < xA - 0.05 || x > xB + 0.05 || !Number.isFinite(x)) {
        method = 'BISECTION';
        break;
      }
      if (Math.abs(step) < 1e-9 && Math.abs(npv) <= tolResidual) {
        converged = true;
        break;
      }
    }

    // Fallback to Bisection if Newton didn't converge or went out of bounds
    if (!converged || method === 'BISECTION') {
      let evalA = evalNpv(xA, cashFlows, d0, basis).npv;
      let evalB = evalNpv(xB, cashFlows, d0, basis).npv;
      if (evalA * evalB <= 0) {
        for (; iter < maxIter; iter++) {
          x = (xA + xB) / 2;
          const { npv } = evalNpv(x, cashFlows, d0, basis);
          if (Math.abs(npv) <= tolResidual || Math.abs(xB - xA) < 1e-8) {
            converged = true;
            break;
          }
          if (evalA * npv < 0) {
            xB = x;
            evalB = npv;
          } else {
            xA = x;
            evalA = npv;
          }
        }
      }
    }

    if (converged) {
      const finalEval = evalNpv(x, cashFlows, d0, basis);
      if (Math.abs(finalEval.npv) <= tolResidual * 1.5) {
        const rate = Math.exp(x) - 1;
        // Deduplicate
        const isDuplicate = roots.some(r => Math.abs(r.rate - rate) < 1e-4);
        if (!isDuplicate && Number.isFinite(rate)) {
          roots.push({
            rate,
            ratePercent: rate * 100,
            x,
            npv: finalEval.npv,
            iterations: iter + 1,
            method
          });
        }
      }
    }
  }

  // Sort roots ascending by rate
  roots.sort((a, b) => a.rate - b.rate);

  return {
    ok: true,
    roots,
    count: roots.length,
    annualizationBasis: basis,
    cashFlowsCount: cashFlows.length
  };
}

/**
 * Computes canonical NWv7 XIRR (ACT/365.25).
 * Enforces rate uniqueness: fails with MULTIPLE_ROOTS if multiple roots exist.
 */
export function calcXirr(rawCashFlows, options = {}) {
  const rootResult = findXirrRoots(rawCashFlows, options);
  if (!rootResult.ok) {
    return {
      ok: false,
      error: rootResult.error,
      message: rootResult.message || 'XIRR calculation failed pre-flight validation',
      value: null,
      rate: null,
      ratePercent: null
    };
  }

  const { roots, annualizationBasis, cashFlowsCount } = rootResult;

  if (roots.length === 0) {
    return {
      ok: false,
      error: 'DID_NOT_CONVERGE',
      message: 'XIRR numerical solver did not converge to a root within allowed tolerance',
      value: null,
      rate: null,
      ratePercent: null,
      annualizationBasis
    };
  }

  if (roots.length > 1) {
    return {
      ok: false,
      error: 'MULTIPLE_ROOTS',
      message: `Multiple valid internal rates of return exist for this cash flow series (${roots.length} roots discovered)`,
      value: null,
      rate: null,
      ratePercent: null,
      candidates: roots.map(r => r.rate),
      candidatesPercent: roots.map(r => r.ratePercent),
      annualizationBasis
    };
  }

  const single = roots[0];
  return {
    ok: true,
    value: single.rate,
    rate: single.rate,
    ratePercent: single.ratePercent,
    annualizationBasis,
    method: single.method,
    iterations: single.iterations,
    npv: single.npv,
    cashFlowsCount,
    error: null
  };
}
