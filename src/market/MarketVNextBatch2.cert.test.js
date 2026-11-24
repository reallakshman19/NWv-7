import { describe, expect, it, vi } from 'vitest';
import { buildComparisonOutcome } from './features/funds/FundCompareModal.jsx';
import { fundClient } from './features/funds/fundClient.js';
import { FxClient } from './features/macro/fxClient.js';
import { calculateEventStatus } from './features/events/ipoData.js';
import { calcSip, calcStepUpSip, calcGoalSip } from './math/sipEngine.js';

const point=(date,nav)=>({date,nav});
const json=payload=>vi.fn(async()=>({ok:true,status:200,json:async()=>payload}));
describe('MP09 common-date fund comparison',()=>{
  it('anchors all comparison NAVs and metrics to the same actual dates',()=>{
    const cache={
      '123456':{observations:[point('2026-01-01',100),point('2026-11-20',110),point('2026-11-24',130)]},
      '654321':{observations:[point('2026-01-01',200),point('2026-11-20',220),point('2026-11-23',240)]}
    };
    const result=buildComparisonOutcome(Object.keys(cache),cache,'1Y');
    expect(result.isReady).toBe(true);
    expect(result.alignedDates).toEqual(['2026-01-01','2026-11-20']);
    expect(result.metricsByScheme['123456'].latestNav).toBe(110);
    expect(result.metricsByScheme['654321'].latestNav).toBe(220);
    expect(result.metricsByScheme['123456'].latestDate).toBe('2026-11-20');
  });
  it('does not claim a comparison with only one common date',()=>{
    const cache={'123456':{observations:[point('2026-01-01',100)]},'654321':{observations:[point('2026-01-01',200)]}};
    expect(buildComparisonOutcome(Object.keys(cache),cache,'1Y')).toMatchObject({isReady:false,reason:'INSUFFICIENT_COMMON_DATES'});
  });
  it.each([
    [[point('2026-11-22',100),point('2026-11-22',101)],/Conflicting NAV/],
    [[point('2026-11-25',100)],/Future-dated historical NAV/]
  ])('rejects invalid historical provider observations',async(data,error)=>{
    fundClient.clearCooldown();
    await expect(fundClient.fetchFundHistory('123456',{now:Date.parse('2026-11-24T12:00:00Z'),fetchImpl:json({status:'SUCCESS',meta:{scheme_code:123456,scheme_name:'Fixture Direct Growth'},data})})).rejects.toThrow(error);
  });
});
describe('MP10 FX history qualification',()=>{
  const client=new FxClient();
  it.each([
    [{date:'2026-11-20',base:'USD',quote:'INR',rate:85},/pair mismatch/],
    [{date:'2026-11-20',rate:220},/pair mismatch/],
    [{date:'2026-11-31',base:'OMR',quote:'INR',rate:220},/date range/],
    [{date:'2026-11-19',base:'OMR',quote:'INR',rate:220},/date range/]
  ])('rejects unqualified historical FX row',async(row,error)=>{
    await expect(client.fetchRateHistory('2026-11-20','2026-11-24','OMR','INR',{fetchImpl:json([row])})).rejects.toThrow(error);
  });
  it('rejects inverted date range before transport',async()=>{
    const fetchImpl=vi.fn();
    await expect(client.fetchRateHistory('2026-11-24','2026-11-20','OMR','INR',{fetchImpl})).rejects.toThrow('Invalid FX history date range');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
describe('MP11 calendar lifecycle',()=>{
  const now=Date.parse('2026-11-24T12:00:00Z');
  it.each(['CANCELLED','SUPERSEDED'])('never advertises %s event as upcoming',verification=>{
    expect(calculateEventStatus({startDate:'2026-12-01',verification},now)).toMatchObject({temporalState:verification,isOngoing:false});
  });
  it('rejects a reversed schedule',()=>{
    expect(calculateEventStatus({startDate:'2026-12-02',endDate:'2026-12-01'},now).temporalState).toBe('UNKNOWN');
  });
});
describe('MP12 SIP checkpoints and numeric limits',()=>{
  it('year-one checkpoint is year-one corpus rather than final-horizon compounding',()=>{
    const options={monthlyContribution:1000,nominalAnnualPercent:12,termMonths:24,stepUpValue:100};
    const result=calcStepUpSip(options);
    expect(result.schedule[0].accumulatedValueToDate).toBeCloseTo(calcSip({...options,termMonths:12}).value,8);
    expect(result.schedule.at(-1).accumulatedValueToDate).toBeCloseTo(result.value,8);
  });
  it('handles tiny positive rates without cancellation',()=>{
    const options={monthlyContribution:1000,termMonths:12,nominalAnnualPercent:1e-15};
    expect(calcSip(options).value).toBeCloseTo(12000,8);
    expect(calcGoalSip({targetCorpus:12000,termMonths:12,nominalAnnualPercent:1e-15}).value).toBeCloseTo(1000,8);
  });
  it('rejects non-finite projection results',()=>{
    expect(calcSip({monthlyContribution:1e308,termMonths:1200,nominalAnnualPercent:50}).ok).toBe(false);
    expect(calcStepUpSip({monthlyContribution:1e308,termMonths:24,nominalAnnualPercent:50}).ok).toBe(false);
  });
});
