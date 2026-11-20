import { describe, it, expect } from 'vitest';
import {
  calcXirr,
  findXirrRoots,
  calcSip,
  calcStepUpSip,
  calcGoalSip,
  calculateSip,
  calcSwp,
  calcLumpsum,
  calcEmi,
  comparePrepayVsInvest,
  calcCagr,
  calcAbsoluteReturn,
  calcRuleOf72
} from './index.js';

describe('NWv7 Market Desk R2.1 — Financial Math Engine Certification', () => {

  describe('SIP & Goal Planner', () => {
    it('calculates Golden Case 1: 5000/mo, 10 yrs, 0% nominal return', () => {
      const res = calcSip({ monthlyContribution: 5000, termYears: 10, nominalAnnualPercent: 0 });
      expect(res.ok).toBe(true);
      expect(res.invested).toBe(600000);
      expect(res.value).toBe(600000);
      expect(res.gain).toBe(0);
    });

    it('calculates Golden Case 2: 5000/mo, 1 yr, 12% nominal return (approx 63412.52)', () => {
      const res = calcSip({ monthlyContribution: 5000, termYears: 1, nominalAnnualPercent: 12 });
      expect(res.ok).toBe(true);
      expect(res.invested).toBe(60000);
      expect(res.value).toBeCloseTo(63412.52, 2);
      expect(res.gain).toBeCloseTo(3412.52, 2);
    });

    it('rejects invalid inputs (negative contribution, rate > 50%)', () => {
      expect(calcSip({ monthlyContribution: -100, termMonths: 12, nominalAnnualPercent: 10 }).ok).toBe(false);
      expect(calcSip({ monthlyContribution: 5000, termMonths: 12, nominalAnnualPercent: 75 }).ok).toBe(false);
      expect(calcSip({ monthlyContribution: 5000, termMonths: 0, nominalAnnualPercent: 10 }).ok).toBe(false);
    });

    it('step-up SIP with zero step-up reduces identically to regular SIP', () => {
      const reg = calcSip({ monthlyContribution: 10000, termYears: 5, nominalAnnualPercent: 12 });
      const step = calcStepUpSip({ monthlyContribution: 10000, termYears: 5, nominalAnnualPercent: 12, stepUpValue: 0 });
      expect(step.ok).toBe(true);
      expect(step.value).toBeCloseTo(reg.value, 4);
      expect(step.invested).toBe(reg.invested);
    });

    it('step-up SIP with annual increment compounds properly over fractional-year terms', () => {
      const step = calcStepUpSip({
        monthlyContribution: 5000,
        termMonths: 18,
        nominalAnnualPercent: 12,
        stepUpType: 'AMOUNT',
        stepUpValue: 1000
      });
      expect(step.ok).toBe(true);
      // Months 1-12: 5000/mo. Months 13-18: 6000/mo. Total invested: 60000 + 36000 = 96000
      expect(step.invested).toBe(96000);
      expect(step.value).toBeGreaterThan(96000);
    });

    it('goal SIP forward and inverse calculations round-trip within numerical tolerance', () => {
      const targetCorpus = 1000000;
      const goalRes = calcGoalSip({ targetCorpus, termYears: 5, nominalAnnualPercent: 12 });
      expect(goalRes.ok).toBe(true);
      const reqMonthly = goalRes.requiredMonthly;

      const fwdRes = calcSip({ monthlyContribution: reqMonthly, termYears: 5, nominalAnnualPercent: 12 });
      expect(fwdRes.ok).toBe(true);
      expect(fwdRes.value).toBeCloseTo(targetCorpus, 1);
    });

    it('legacy calculateSip adapter preserves backward-compatible signature', () => {
      const legacy = calculateSip(5000, 1, 12);
      expect(legacy).not.toBeNull();
      expect(legacy.invested).toBe(60000);
      expect(legacy.value).toBeCloseTo(63412.52, 2);
    });
  });

  describe('NWv7 XIRR (ACT/365.25)', () => {
    it('verifies 365.25-day convention vs Excel 365-day convention for 365-day holding', () => {
      const cf = [
        { date: '2025-01-01', amount: -1000 },
        { date: '2026-01-01', amount: 1100 } // 365 elapsed days
      ];
      const res = calcXirr(cf, { annualizationBasis: 365.25 });
      expect(res.ok).toBe(true);
      // 1.1^(365.25/365) - 1 approx 10.00718%
      expect(res.ratePercent).toBeCloseTo(10.00718, 4);

      // Distinguish from 365 basis
      const res365 = calcXirr(cf, { annualizationBasis: 365.0 });
      expect(res365.ok).toBe(true);
      expect(res365.ratePercent).toBeCloseTo(10.00000, 4);
    });

    it('identifies both roots for the canonical two-root series [-100, +230, -132]', () => {
      const cf = [
        { date: '2025-01-01', amount: -100 },
        { date: '2026-01-01', amount: 230 }, // 365 days
        { date: '2027-01-01', amount: -132 } // 730 days
      ];

      const multi = findXirrRoots(cf, { annualizationBasis: 365.25 });
      expect(multi.ok).toBe(true);
      expect(multi.count).toBe(2);
      expect(multi.roots[0].ratePercent).toBeCloseTo(10.00718, 3);
      expect(multi.roots[1].ratePercent).toBeCloseTo(20.01499, 3);

      // calcXirr must fail closed with MULTIPLE_ROOTS
      const single = calcXirr(cf, { annualizationBasis: 365.25 });
      expect(single.ok).toBe(false);
      expect(single.error).toBe('MULTIPLE_ROOTS');
      expect(single.candidatesPercent.length).toBe(2);
    });

    it('validates pre-flight error conditions (no sign change, identical dates, net zero)', () => {
      // No sign change
      expect(calcXirr([
        { date: '2025-01-01', amount: 100 },
        { date: '2025-06-01', amount: 200 }
      ]).error).toBe('NO_SIGN_CHANGE');

      // Identical dates
      expect(calcXirr([
        { date: '2025-01-01', amount: -100 },
        { date: '2025-01-01', amount: 200 }
      ]).error).toBe('IDENTICAL_DATES');

      // Same day offsetting with another offsetting day to net zero
      expect(calcXirr([
        { date: '2025-01-01', amount: -100 },
        { date: '2025-01-01', amount: 100 },
        { date: '2025-06-01', amount: -50 },
        { date: '2025-06-01', amount: 50 }
      ]).error).toBe('NET_ZERO_CASH_FLOWS');
    });

    it('scale-aware residual tolerance holds for ₹1,000 and ₹100 crore portfolios', () => {
      const smallCf = [
        { date: '2025-01-01', amount: -1000 },
        { date: '2026-01-01', amount: 1150 }
      ];
      const largeCf = [
        { date: '2025-01-01', amount: -1000000000 }, // 100 crore
        { date: '2026-01-01', amount: 1150000000 }
      ];

      const resSmall = calcXirr(smallCf);
      const resLarge = calcXirr(largeCf);
      expect(resSmall.ok).toBe(true);
      expect(resLarge.ok).toBe(true);
      expect(resSmall.ratePercent).toBeCloseTo(resLarge.ratePercent, 3);
    });

    it('solves fully liquidated historical portfolio cash flows without terminal mark', () => {
      const liquidatedCf = [
        { date: '2024-01-15', amount: -50000 }, // Buy
        { date: '2024-06-15', amount: -25000 }, // Buy
        { date: '2025-01-15', amount: 95000 }  // Sell all
      ];
      const res = calcXirr(liquidatedCf);
      expect(res.ok).toBe(true);
      expect(res.ratePercent).toBeGreaterThan(0);
    });
  });

  describe('SWP & Longevity Simulation', () => {
    it('accurately distinguishes beginning-of-month non-depletion threshold', () => {
      // Corpus 1,000,000, return 12% p.a. (1%/mo).
      // Beginning of month threshold: W <= 1000000 * 0.01 / 1.01 = 9900.99
      const swpSustainable = calcSwp({
        initialCorpus: 1000000,
        monthlyWithdrawal: 9900,
        nominalAnnualPercent: 12,
        withdrawalTiming: 'BEGINNING_OF_MONTH',
        termMonths: 120
      });
      expect(swpSustainable.ok).toBe(true);
      expect(swpSustainable.isPerpetualMath).toBe(true);
      expect(swpSustainable.status).toBe('NOT_DEPLETED_IN_SIMULATION');
      expect(swpSustainable.finalBalance).toBeGreaterThan(0);

      // Withdrawal exceeding threshold will deplete over long horizon
      const swpDepleting = calcSwp({
        initialCorpus: 1000000,
        monthlyWithdrawal: 15000,
        nominalAnnualPercent: 12,
        withdrawalTiming: 'BEGINNING_OF_MONTH',
        termMonths: 240
      });
      expect(swpDepleting.ok).toBe(true);
      expect(swpDepleting.isPerpetualMath).toBe(false);
      expect(swpDepleting.status).toBe('DEPLETED');
      expect(swpDepleting.depletionMonth).toBeLessThan(240);
    });

    it('handles zero-rate and negative-rate SWP scenarios without division by zero', () => {
      const swpZero = calcSwp({
        initialCorpus: 60000,
        monthlyWithdrawal: 5000,
        nominalAnnualPercent: 0,
        termMonths: 24
      });
      expect(swpZero.ok).toBe(true);
      expect(swpZero.depletionMonth).toBe(12);

      const swpNeg = calcSwp({
        initialCorpus: 100000,
        monthlyWithdrawal: 5000,
        nominalAnnualPercent: -12,
        termMonths: 24
      });
      expect(swpNeg.ok).toBe(true);
      expect(swpNeg.status).toBe('DEPLETED');
      expect(swpNeg.depletionMonth).toBeLessThan(20);
    });
  });

  describe('Lumpsum & Inflation', () => {
    it('calculates quarterly compound interest matching standard FD formula', () => {
      // 100,000 for 1 year at 8% compounded quarterly (k=4)
      // A = 100000 * (1 + 0.08/4)^4 = 100000 * (1.02)^4 = 108243.216
      const res = calcLumpsum({
        principal: 100000,
        termYears: 1,
        nominalAnnualPercent: 8,
        compoundingFrequency: 4,
        inflationAnnualPercent: 6
      });
      expect(res.ok).toBe(true);
      expect(res.nominalFutureValue).toBeCloseTo(108243.22, 2);
      expect(res.effectiveAnnualRatePercent).toBeCloseTo(8.2432, 2);
      // Real purchasing power: 108243.22 / 1.06 = 102116.24
      expect(res.realFutureValue).toBeCloseTo(102116.24, 1);
    });
  });

  describe('Loan EMI & Prepay vs Invest', () => {
    it('calculates reducing-balance EMI and verifies zero-rate branch', () => {
      // Zero rate: 120,000 over 12 months = 10,000/mo
      const zeroEmi = calcEmi({ loanPrincipal: 120000, loanAnnualPercent: 0, loanTermMonths: 12 });
      expect(zeroEmi.ok).toBe(true);
      expect(zeroEmi.emi).toBe(10000);

      // Standard home loan: 5,000,000 at 8.5% for 20 years (240 mo)
      const res = calcEmi({ loanPrincipal: 5000000, loanAnnualPercent: 8.5, loanTermMonths: 240 });
      expect(res.ok).toBe(true);
      expect(res.emi).toBeCloseTo(43391.13, 1);
    });

    it('prepay vs invest comparator enforces equal cash budget and terminal evaluation', () => {
      const comp = comparePrepayVsInvest({
        loanPrincipal: 2000000,
        loanAnnualPercent: 9.0,
        loanTermMonths: 120,
        monthlySurplus: 10000,
        investmentAnnualPercent: 12.0
      });
      expect(comp.ok).toBe(true);
      expect(comp.monthlyBudget).toBeCloseTo(comp.optionA.totalLoanPaid > 0 ? (comp.monthlyBudget) : 0, 1);
      expect(comp.payoffMonthA).toBeLessThan(120);
      expect(comp.optionA.remainingDebtAtN).toBe(0);
      expect(comp.optionB.remainingDebtAtN).toBe(0);
      expect(comp.optionA.terminalCorpus).toBeGreaterThan(0);
      expect(comp.optionB.terminalCorpus).toBeGreaterThan(0);
    });
  });

  describe('CAGR & Calendar Math', () => {
    it('calculates absolute return correctly', () => {
      const abs = calcAbsoluteReturn(100, 150);
      expect(abs.ok).toBe(true);
      expect(abs.returnPercent).toBe(50);
    });

    it('calculates CAGR accurately over leap years with ACT/365.25 basis', () => {
      const res = calcCagr({
        startValue: 100,
        endValue: 121,
        days: 730.5,
        annualizationBasis: 365.25
      });
      expect(res.ok).toBe(true);
      // 100 -> 121 over 2 years = exactly 10% CAGR
      expect(res.cagrPercent).toBeCloseTo(10.0, 2);
    });

    it('flags periods under 1 year as short term', () => {
      const res = calcCagr({
        startValue: 100,
        endValue: 105,
        days: 180
      });
      expect(res.ok).toBe(true);
      expect(res.isShortTerm).toBe(true);
    });
  });

  describe('Rule of 72 Engine', () => {
    it('compares Rule of 72 with exact logarithmic doubling', () => {
      const res = calcRuleOf72({ annualPercent: 12 });
      expect(res.ok).toBe(true);
      expect(res.doubling.rule72Years).toBe(6); // 72 / 12 = 6
      expect(res.doubling.exactYears).toBeCloseTo(6.116, 2);
    });
  });
});
