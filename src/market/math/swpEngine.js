/**
 * NWv7 Market Desk R2.1 - WP-08
 * Systematic Withdrawal Plan (SWP) Engine & Longevity Simulation
 *
 * Contract: market-r21-contract-v1
 * Convention: Constant-return recurrence simulation with beginning-of-month and end-of-month support.
 */

export const SWP_DISCLAIMER =
  'Under the entered constant-return assumption, the modeled balance does not reach zero within the selected horizon. This does not establish real-world perpetual sustainability. Actual investment returns vary; sequence-of-returns volatility, taxes, and fees are not modeled.';

export function calcSwp(options = {}) {
  const corpus = Number(options.initialCorpus ?? options.corpus ?? options.c0);
  const withdrawal = Number(options.monthlyWithdrawal ?? options.withdrawal ?? options.w);
  const annual = Number(options.nominalAnnualPercent ?? options.annualPercent ?? options.annual ?? 0);
  const years = options.termYears ?? options.years;
  const months = options.termMonths ?? options.months;
  const timing = options.withdrawalTiming === 'END_OF_MONTH' ? 'END_OF_MONTH' : 'BEGINNING_OF_MONTH';

  let n = 0;
  if (months != null && Number.isFinite(Number(months))) {
    n = Math.round(Number(months));
  } else if (years != null && Number.isFinite(Number(years))) {
    n = Math.round(Number(years) * 12);
  } else {
    n = 360; // Default 30-year retirement horizon
  }

  if (!Number.isFinite(corpus) || corpus <= 0) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Initial corpus must be a positive finite number' };
  }
  if (!Number.isFinite(withdrawal) || withdrawal <= 0) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Monthly withdrawal must be a positive finite number' };
  }
  if (!Number.isFinite(annual) || annual < -50 || annual > 50) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Nominal annual return must be between -50% and 50%' };
  }
  if (!Number.isFinite(n) || n <= 0 || n > 1200) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Term must be between 1 and 1200 months' };
  }

  const r = annual / 1200;

  // Determine theoretical perpetual non-depletion condition under constant rate r > 0
  let isPerpetualMath = false;
  if (r > 0) {
    if (timing === 'BEGINNING_OF_MONTH') {
      // (Corpus - W) * r >= W  =>  W <= Corpus * r / (1 + r)
      const threshold = (corpus * r) / (1 + r);
      if (withdrawal <= threshold + 1e-9) isPerpetualMath = true;
    } else {
      // Corpus * r >= W
      const threshold = corpus * r;
      if (withdrawal <= threshold + 1e-9) isPerpetualMath = true;
    }
  }

  let balance = corpus;
  let totalWithdrawn = 0;
  let totalInterest = 0;
  let depletionMonth = null;
  const annualSchedule = [];
  let currentYearWithdrawn = 0;
  let currentYearInterest = 0;

  for (let m = 1; m <= n; m++) {
    const startMonthBalance = balance;
    let actualWithdrawal = 0;
    let monthInterest = 0;

    if (timing === 'BEGINNING_OF_MONTH') {
      actualWithdrawal = Math.min(balance, withdrawal);
      balance -= actualWithdrawal;
      monthInterest = balance * r;
      balance += monthInterest;
    } else {
      monthInterest = balance * r;
      balance += monthInterest;
      actualWithdrawal = Math.min(Math.max(0, balance), withdrawal);
      balance -= actualWithdrawal;
    }

    if (balance < 0) balance = 0;

    totalWithdrawn += actualWithdrawal;
    totalInterest += monthInterest;
    currentYearWithdrawn += actualWithdrawal;
    currentYearInterest += monthInterest;

    if (balance <= 1e-9 && depletionMonth == null) {
      depletionMonth = m;
      balance = 0;
    }

    if (m % 12 === 0 || m === n || (depletionMonth != null && m === depletionMonth)) {
      const yearIndex = Math.ceil(m / 12);
      annualSchedule.push({
        year: yearIndex,
        month: m,
        startBalance: startMonthBalance,
        totalWithdrawnYear: currentYearWithdrawn,
        interestEarnedYear: currentYearInterest,
        endBalance: balance
      });
      currentYearWithdrawn = 0;
      currentYearInterest = 0;
    }

    if (balance <= 0 && depletionMonth != null) {
      break;
    }
  }

  const finalBalance = Math.max(0, balance);
  const status = depletionMonth == null ? 'NOT_DEPLETED_IN_SIMULATION' : 'DEPLETED';

  return {
    ok: true,
    value: finalBalance,
    finalBalance,
    initialCorpus: corpus,
    monthlyWithdrawal: withdrawal,
    nominalAnnualPercent: annual,
    termMonths: n,
    withdrawalTiming: timing,
    totalWithdrawn,
    totalInterestEarned: totalInterest,
    depletionMonth,
    depletionYears: depletionMonth ? +(depletionMonth / 12).toFixed(1) : null,
    isPerpetualMath,
    status,
    disclaimer: SWP_DISCLAIMER,
    schedule: annualSchedule
  };
}
