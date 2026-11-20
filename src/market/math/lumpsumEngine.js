/**
 * NWv7 Market Desk R2.1 - WP-08
 * Lumpsum Compounding & Inflation-Adjusted Purchasing Power Engine
 *
 * Contract: market-r21-contract-v1
 * Formula: A = P * (1 + r/k)^(k * t)
 * Real Value = A / (1 + inflation)^t
 */

export function calcLumpsum(options = {}) {
  const p = Number(options.principal ?? options.amount ?? options.lumpsum);
  const t = Number(options.termYears ?? options.years);
  const annual = Number(options.nominalAnnualPercent ?? options.annualPercent ?? options.rate);
  const k = Number(options.compoundingFrequency ?? options.frequency ?? 4); // Default 4 = Quarterly
  const inflationAnnual = Number(options.inflationAnnualPercent ?? options.inflation ?? 6.0);

  if (!Number.isFinite(p) || p < 0) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Principal amount must be a non-negative finite number' };
  }
  if (!Number.isFinite(t) || t <= 0 || t > 100) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Term in years must be between 0 and 100' };
  }
  if (!Number.isFinite(annual) || annual < 0 || annual > 50) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Nominal annual return must be between 0% and 50%' };
  }
  if (![1, 2, 4, 12].includes(k)) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Compounding frequency must be 1 (Annual), 2 (Semi-Annual), 4 (Quarterly), or 12 (Monthly)' };
  }
  if (!Number.isFinite(inflationAnnual) || inflationAnnual < 0 || inflationAnnual > 30) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Inflation rate must be between 0% and 30%' };
  }

  const r = annual / 100;
  const inf = inflationAnnual / 100;

  // Future value nominal
  let futureValue = 0;
  if (r === 0) {
    futureValue = p;
  } else {
    futureValue = p * Math.pow(1 + r / k, k * t);
  }

  const totalGain = futureValue - p;
  const effectiveAnnualRate = r === 0 ? 0 : Math.pow(1 + r / k, k) - 1;

  // Real purchasing power
  const realFutureValue = futureValue / Math.pow(1 + inf, t);
  const wealthErosionAmount = Math.max(0, futureValue - realFutureValue);
  const wealthErosionPercent = futureValue > 0 ? (wealthErosionAmount / futureValue) * 100 : 0;
  const realRateOfReturn = (1 + r) / (1 + inf) - 1;

  return {
    ok: true,
    value: futureValue,
    nominalFutureValue: futureValue,
    principal: p,
    totalGain,
    termYears: t,
    nominalAnnualPercent: annual,
    compoundingFrequency: k,
    effectiveAnnualRatePercent: effectiveAnnualRate * 100,
    inflationAnnualPercent: inflationAnnual,
    realFutureValue,
    wealthErosionAmount,
    wealthErosionPercent,
    realRateOfReturnPercent: realRateOfReturn * 100,
    inflationAssumptionNotice: 'Inflation adjustment is based on a user-entered hypothetical assumption (default 6.0%), not an official CPI publication.'
  };
}
