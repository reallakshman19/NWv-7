/**
 * NWv7 Market Desk R2.1 - WP-08
 * Rule of 72, 114, 144 & Exact Logarithmic Doubling Engine
 *
 * Contract: market-r21-contract-v1
 */

export function calcRuleOf72(options = {}) {
  const r = Number(options.annualPercent ?? options.rate);
  if (!Number.isFinite(r) || r <= 0 || r > 100) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Annual rate must be a positive number between 0% and 100%' };
  }

  // Exact logarithmic doubling/tripling/quadrupling
  const logFactor = Math.log(1 + r / 100);
  const exactDoublingYears = Math.log(2) / logFactor;
  const exactTriplingYears = Math.log(3) / logFactor;
  const exactQuadruplingYears = Math.log(4) / logFactor;

  // Mental arithmetic rule approximations
  const rule72Years = 72 / r;
  const rule114Years = 114 / r;
  const rule144Years = 144 / r;

  const errorPercent = (Math.abs(rule72Years - exactDoublingYears) / exactDoublingYears) * 100;

  return {
    ok: true,
    annualPercent: r,
    doubling: {
      rule72Years,
      exactYears: exactDoublingYears,
      errorPercent
    },
    tripling: {
      rule114Years,
      exactYears: exactTriplingYears
    },
    quadrupling: {
      rule144Years,
      exactYears: exactQuadruplingYears
    }
  };
}
