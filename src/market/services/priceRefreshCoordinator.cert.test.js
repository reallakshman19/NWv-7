import { describe, expect, it, vi } from 'vitest';
import { createPriceRefreshCoordinator } from './priceRefreshCoordinator.js';

const instrument = {instrumentId:'FUND:125497',type:'FUND',currency:'INR',displayName:'Fixture'};
const request = {sourceId:'mfapi',action:'BROWSER_FETCH',instrument,kind:'NAV',url:'https://api.mfapi.in/mf/125497/latest'};
const response = (date = '2026-11-23', value = 100, target = instrument) => ({
  observation:{instrumentId:target.instrumentId,sourceId:'mfapi',receiptId:'r1',kind:'NAV',currency:'INR',value,observedAt:date,tradingDate:date,validity:'VALID'},
  receiptRecord:{id:'r1',receipt:{sourceId:'mfapi',publisher:'MFapi',accessMode:'DIRECT_ON_DEMAND',rights:'BROWSER_DIRECT_CONDITIONAL',state:'READY',validity:'VALID',providerClockGranularity:'day',providerAsOf:date,originalUrl:'https://api.mfapi.in/mf/'+target.instrumentId.slice(5)+'/latest',transportStatus:200}}
});
describe('MP06 scoped refresh', () => {
  it('rejects unauthorized requests before adapter execution', async () => {
    const acquire=vi.fn();
    const coordinator=createPriceRefreshCoordinator();
    const result=await coordinator.refresh({...request,action:'PUBLIC_SNAPSHOT'},acquire);
    expect(result.state).toBe('SOURCE_RESTRICTED');
    expect(acquire).not.toHaveBeenCalled();
  });
  it('deduplicates a concurrent identical request', async () => {
    const coordinator=createPriceRefreshCoordinator();
    const acquire=vi.fn(async()=>response());
    const first=coordinator.refresh(request,acquire);
    const second=coordinator.refresh(request,acquire);
    expect(first).toBe(second);
    expect((await first).observation.value).toBe(100);
    expect(acquire).toHaveBeenCalledTimes(1);
  });
  it('preserves original qualified observation on failure, rejecting older and conflicting values', async () => {
    const coordinator=createPriceRefreshCoordinator({maxRetries:0});
    expect((await coordinator.refresh(request,async()=>response())).state).toBe('QUALIFIED_NATIVE');
    for(const candidate of [response('2026-11-22'),response('2026-11-23',101)]) {
      const result=await coordinator.refresh(request,async()=>candidate);
      expect(result).toMatchObject({state:'UNAVAILABLE',reasonCode:'OLDER_OR_CONFLICTING_OBSERVATION',observation:null});
      expect(result.retainedObservation.observedAt).toBe('2026-11-23');
    }
    const fail=await coordinator.refresh(request,async()=>{throw new Error('network');});
    expect(fail.retainedObservation.value).toBe(100);
  });
  it('retries only bounded transient errors', async () => {
    const coordinator=createPriceRefreshCoordinator({maxRetries:1});
    const acquire=vi.fn().mockRejectedValueOnce(Object.assign(new Error('transient'),{retryable:true})).mockResolvedValueOnce(response());
    expect((await coordinator.refresh(request,acquire)).state).toBe('QUALIFIED_NATIVE');
    expect(acquire).toHaveBeenCalledTimes(2);
  });
  it('times out even if adapter ignores abort', async () => {
    const coordinator=createPriceRefreshCoordinator({timeoutMs:10,maxRetries:0});
    const result=await coordinator.refresh(request,()=>new Promise(()=>{}));
    expect(result.reasonCode).toBe('TIMEOUT');
  });
  it('isolates one failed source request from its sibling', async () => {
    const coordinator=createPriceRefreshCoordinator({maxRetries:0});
    const other={...instrument,instrumentId:'FUND:123456'};
    const results=await coordinator.refreshMany([
      {request,acquire:async()=>{throw new Error('network');}},
      {request:{...request,instrument:other,url:'https://api.mfapi.in/mf/123456/latest'},acquire:async()=>response('2026-11-23',100,other)}
    ]);
    expect(results.map(r=>r.state)).toEqual(['UNAVAILABLE','QUALIFIED_NATIVE']);
  });
  it('rejects malformed responses without retry', async () => {
    const coordinator=createPriceRefreshCoordinator();
    const acquire=vi.fn(async()=>response('2026-11-23',NaN));
    expect((await coordinator.refresh(request,acquire)).reasonCode).toBe('UNQUALIFIED_RESPONSE');
    expect(acquire).toHaveBeenCalledTimes(1);
  });
});
