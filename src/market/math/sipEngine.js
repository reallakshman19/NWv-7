/**
 * NWv7 Market Desk R2.1 - WP-08
 * SIP Compounding Engine: Regular SIP, Step-Up SIP & Target Goal Planner
 *
 * Contract: market-r21-contract-v1
 * Convention: End-of-month payments, nominal annual rate / 1200
 */

/**
 * Validates and normalizes common SIP inputs.
 */
function normalizeSipInputs(options = {}) {
  const p = Number(options.monthlyContribution ?? options.monthly ?? options.payment ?? options.p);
  const years = options.termYears ?? options.years;
  const months = options.termMonths ?? options.months;
  const annual = Number(options.nominalAnnualPercent ?? options.annualPercent ?? options.annual ?? options.rate);
  const timing = options.contributionTiming === 'BEGINNING_OF_MONTH' ? 'BEGINNING_OF_MONTH' : 'END_OF_MONTH';

  let n = 0;
  if (months != null && Number.isFinite(Number(months))) {
    n = Math.round(Number(months));
  } else if (years != null && Number.isFinite(Number(years))) {
    n = Math.round(Number(years) * 12);
  }

  if (!Number.isFinite(p) || p < 0) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Monthly contribution must be a non-negative finite number' };
  }
  if (!Number.isFinite(n) || n <= 0 || n > 1200) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Term must be between 1 and 1200 months' };
  }
  if (!Number.isFinite(annual) || annual < 0 || annual > 50) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Nominal annual return must be between 0% and 50%' };
  }

  const r = annual / 1200;
  return { ok: true, p, n, annual, r, timing };
}

/**
 * Computes standard regular SIP future value.
 */
export function calcSip(options = {}) {
  const norm = normalizeSipInputs(options);
  if (!norm.ok) return norm;

  const { p, n, annual, r, timing } = norm;
  const invested = p * n;

  let futureValue = 0;
  if (r === 0) {
    futureValue = invested;
  } else {
    const base = p * Math.expm1(n * Math.log1p(r)) / r;
    futureValue = timing === 'BEGINNING_OF_MONTH' ? base * (1 + r) : base;
  }

  if (![invested,futureValue].every(Number.isFinite)) return {ok:false,error:'INVALID_INPUT',message:'Calculated corpus exceeds numeric range'};
  const gain = futureValue - invested;

  return {
    ok: true,
    value: futureValue,
    invested,
    gain,
    futureValue,
    monthlyContribution: p,
    termMonths: n,
    nominalAnnualPercent: annual,
    contributionTiming: timing,
    monthlyRate: r
  };
}

/**
 * Computes Step-Up / Top-Up SIP with month-by-month schedule.
 */
export function calcStepUpSip(options = {}) {
  const norm = normalizeSipInputs(options);
  if (!norm.ok) return norm;

  const { p, n, annual, r, timing } = norm;
  const stepUpType = options.stepUpType === 'PERCENT' ? 'PERCENT' : 'AMOUNT';
  const stepUpValue = Number(options.stepUpValue ?? options.stepUp ?? 0);

  if (!Number.isFinite(stepUpValue) || stepUpValue < 0) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Step-up value must be a non-negative finite number' };
  }

  let totalInvested = 0;
  let futureValue = 0;
  const schedule = [];

  for (let m = 1; m <= n; m++) {
    const yearIndex = Math.floor((m - 1) / 12);
    let pm = p;
    if (stepUpType === 'PERCENT') {
      pm = p * Math.pow(1 + stepUpValue / 100, yearIndex);
    } else {
      pm = p + yearIndex * stepUpValue;
    }

    totalInvested += pm;

    // Value at this month, not the final horizon value of contributions to date.
    futureValue = timing === 'BEGINNING_OF_MONTH' ? (futureValue + pm) * (1 + r) : futureValue * (1 + r) + pm;
    if (![pm,totalInvested,futureValue].every(Number.isFinite)) return {ok:false,error:'INVALID_INPUT',message:'Calculated corpus exceeds numeric range'};

    // End of year or end of term boundary
    if (m % 12 === 0 || m === n) {
      const yearNumber = yearIndex + 1;
      schedule.push({
        year: yearNumber,
        month: m,
        monthlyPayment: pm,
        totalInvestedToDate: totalInvested,
        accumulatedValueToDate: futureValue
      });
    }
  }

  const gain = futureValue - totalInvested;

  return {
    ok: true,
    value: futureValue,
    invested: totalInvested,
    gain,
    futureValue,
    monthlyContribution: p,
    termMonths: n,
    nominalAnnualPercent: annual,
    stepUpType,
    stepUpValue,
    contributionTiming: timing,
    schedule
  };
}

/**
 * Computes Target Goal Planner (Inverse SIP).
 */
export function calcGoalSip(options = {}) {
  const target = Number(options.targetCorpus ?? options.target ?? options.goal);
  const years = options.termYears ?? options.years;
  const months = options.termMonths ?? options.months;
  const annual = Number(options.nominalAnnualPercent ?? options.annualPercent ?? options.rate);
  const timing = options.contributionTiming === 'BEGINNING_OF_MONTH' ? 'BEGINNING_OF_MONTH' : 'END_OF_MONTH';

  let n = 0;
  if (months != null && Number.isFinite(Number(months))) {
    n = Math.round(Number(months));
  } else if (years != null && Number.isFinite(Number(years))) {
    n = Math.round(Number(years) * 12);
  }

  if (!Number.isFinite(target) || target <= 0) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Target corpus must be a positive finite number' };
  }
  if (!Number.isFinite(n) || n <= 0 || n > 1200) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Term must be between 1 and 1200 months' };
  }
  if (!Number.isFinite(annual) || annual < 0 || annual > 50) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Nominal annual return must be between 0% and 50%' };
  }

  const r = annual / 1200;
  let requiredMonthly = 0;

  if (r === 0) {
    requiredMonthly = target / n;
  } else {
    const timingFactor = timing === 'BEGINNING_OF_MONTH' ? (1 + r) : 1;
    requiredMonthly = (target * r) / (Math.expm1(n * Math.log1p(r)) * timingFactor);
  }

  const totalInvested = requiredMonthly * n;
  if (![requiredMonthly,totalInvested].every(Number.isFinite)) return {ok:false,error:'INVALID_INPUT',message:'Calculated contribution exceeds numeric range'};
  const totalGain = target - totalInvested;

  return {
    ok: true,
    value: requiredMonthly,
    requiredMonthly,
    targetCorpus: target,
    invested: totalInvested,
    gain: totalGain,
    termMonths: n,
    nominalAnnualPercent: annual,
    contributionTiming: timing
  };
}

/**
 * Legacy positional adapter for backward compatibility with indiaMarketTools.js
 */
export function calculateSip(monthly, years, annualPercent) {
  const result = calcSip({
    monthlyContribution: monthly,
    termYears: years,
    nominalAnnualPercent: annualPercent,
    contributionTiming: 'END_OF_MONTH'
  });
  if (!result.ok) return null;
  return {
    invested: result.invested,
    value: result.value,
    gain: result.gain
  };
}
