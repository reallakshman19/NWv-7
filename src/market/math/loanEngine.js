/**
 * NWv7 Market Desk R2.1 - WP-08
 * Reducing-Balance Loan EMI & Equal-Cash-Budget Prepay vs Invest Comparator
 *
 * Contract: market-r21-contract-v1
 * Principle: Both strategies consume the exact same monthly household budget B = EMI + Surplus
 * and evaluate terminal wealth at the exact same evaluation date N = loanTermMonths.
 */

export const PREPAY_COMPARATOR_DISCLAIMER =
  'This comparison is a mathematical scenario using fixed interest rates and an identical monthly household budget. It does not account for income tax deductions (Sections 24b/80C), prepayment penalties, floating interest rates, liquidity constraints, or investment sequence-of-returns volatility. It does not constitute personal financial advice.';

/**
 * Calculates standard reducing-balance EMI.
 */
export function calcEmi(options = {}) {
  const p = Number(options.loanPrincipal ?? options.principal ?? options.p);
  const annual = Number(options.loanAnnualPercent ?? options.annualPercent ?? options.rate);
  const months = options.loanTermMonths ?? options.months;
  const years = options.loanTermYears ?? options.years;

  let n = 0;
  if (months != null && Number.isFinite(Number(months))) {
    n = Math.round(Number(months));
  } else if (years != null && Number.isFinite(Number(years))) {
    n = Math.round(Number(years) * 12);
  }

  if (!Number.isFinite(p) || p <= 0) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Loan principal must be a positive finite number' };
  }
  if (!Number.isFinite(annual) || annual < 0 || annual > 50) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Loan annual interest rate must be between 0% and 50%' };
  }
  if (!Number.isFinite(n) || n <= 0 || n > 600) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Loan term must be between 1 and 600 months' };
  }

  const r = annual / 1200;
  let emi = 0;

  if (r === 0) {
    emi = p / n;
  } else {
    emi = (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  const totalPayment = emi * n;
  const totalInterest = totalPayment - p;

  return {
    ok: true,
    value: emi,
    emi,
    principal: p,
    loanAnnualPercent: annual,
    termMonths: n,
    totalPayment,
    totalInterest
  };
}

/**
 * Compares Option A (Prepay + Invest) vs Option B (EMI + Invest) under identical monthly budget.
 */
export function comparePrepayVsInvest(options = {}) {
  const emiResult = calcEmi(options);
  if (!emiResult.ok) return emiResult;

  const { emi, principal, termMonths: N, loanAnnualPercent } = emiResult;
  const surplus = Number(options.monthlySurplus ?? options.surplus ?? 0);
  const invAnnual = Number(options.investmentAnnualPercent ?? options.invRate ?? options.investmentRate ?? 12.0);

  if (!Number.isFinite(surplus) || surplus < 0) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Monthly surplus must be a non-negative finite number' };
  }
  if (!Number.isFinite(invAnnual) || invAnnual < -50 || invAnnual > 50) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Investment annual return must be between -50% and 50%' };
  }

  const rLoan = loanAnnualPercent / 1200;
  const rInv = invAnnual / 1200;
  const monthlyBudget = emi + surplus;

  // --- Option B: Regular EMI + Invest Monthly Surplus throughout all N months ---
  let optionBCorpus = 0;
  let optionBTotalInvested = surplus * N;
  let optionBTotalLoanPaid = emi * N;
  let optionBTotalInterest = optionBTotalLoanPaid - principal;

  for (let m = 1; m <= N; m++) {
    optionBCorpus = (optionBCorpus + surplus) * (1 + rInv);
  }

  // --- Option A: Prepay Loan with full budget B, then invest full budget B after payoff ---
  let loanBalance = principal;
  let payoffMonth = N;
  let optionACorpus = 0;
  let optionATotalLoanPaid = 0;
  let optionATotalInvested = 0;

  for (let m = 1; m <= N; m++) {
    if (loanBalance > 0) {
      const monthInterest = loanBalance * rLoan;
      const totalDue = loanBalance + monthInterest;

      if (totalDue <= monthlyBudget) {
        // Loan is completely paid off this month!
        optionATotalLoanPaid += totalDue;
        loanBalance = 0;
        payoffMonth = m;

        // Unused surplus in payoff month is immediately invested into SIP
        const unusedCash = monthlyBudget - totalDue;
        if (unusedCash > 0) {
          optionACorpus = (optionACorpus + unusedCash) * (1 + rInv);
          optionATotalInvested += unusedCash;
        } else {
          optionACorpus = optionACorpus * (1 + rInv);
        }
      } else {
        // Regular prepayment month
        const principalPaid = monthlyBudget - monthInterest;
        loanBalance -= principalPaid;
        optionATotalLoanPaid += monthlyBudget;
        optionACorpus = optionACorpus * (1 + rInv);
      }
    } else {
      // Loan is already paid off; invest entire monthly budget B
      optionACorpus = (optionACorpus + monthlyBudget) * (1 + rInv);
      optionATotalInvested += monthlyBudget;
    }
  }

  const optionATotalInterest = optionATotalLoanPaid - principal;
  const interestSaved = Math.max(0, optionBTotalInterest - optionATotalInterest);
  const netWealthDifference = optionACorpus - optionBCorpus;

  return {
    ok: true,
    monthlyBudget,
    loanPrincipal: principal,
    loanAnnualPercent,
    investmentAnnualPercent: invAnnual,
    termMonths: N,
    monthlySurplus: surplus,
    payoffMonthA: payoffMonth,
    monthsSaved: N - payoffMonth,
    optionA: {
      name: 'Prepay Loan + Invest Freed Budget',
      terminalCorpus: optionACorpus,
      totalLoanPaid: optionATotalLoanPaid,
      totalInterestPaid: optionATotalInterest,
      totalInvested: optionATotalInvested,
      remainingDebtAtN: 0
    },
    optionB: {
      name: 'Regular EMI + Invest Surplus Throughout',
      terminalCorpus: optionBCorpus,
      totalLoanPaid: optionBTotalLoanPaid,
      totalInterestPaid: optionBTotalInterest,
      totalInvested: optionBTotalInvested,
      remainingDebtAtN: 0
    },
    interestSaved,
    netWealthDifference,
    favorableStrategy: netWealthDifference > 0 ? 'OPTION_A_PREPAY' : 'OPTION_B_INVEST',
    disclaimer: PREPAY_COMPARATOR_DISCLAIMER
  };
}
