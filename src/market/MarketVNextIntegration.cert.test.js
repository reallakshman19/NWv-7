import { describe, expect, it, vi } from 'vitest';
import { acquireQualifiedReference, projectReferenceObservation } from './services/referenceAcquisition.js';

const request={sourceId:'mfapi',action:'BROWSER_FETCH',kind:'NAV',instrument:{instrumentId:'FUND:123456',type:'FUND',currency:'INR',displayName:'Fixture'},url:'https://api.mfapi.in/mf/123456/latest'};
const payload={nav:125,date:'2026-11-23',schemeCode:'123456',receipt:{sourceId:'mfapi',publisher:'MFapi',rights:'BROWSER_DIRECT_CONDITIONAL',accessMode:'DIRECT_ON_DEMAND',state:'READY',validity:'VALID',providerAsOf:'2026-11-23',providerClockGranularity:'day',originalUrl:request.url,transportStatus:200}};
const project=item=>projectReferenceObservation(request,item,item.nav);
describe('MP13 reference acquisition integration',()=>{
  it('returns the existing adapter shape only after qualification',async()=>{
    const acquire=vi.fn(async()=>payload);
    expect(await acquireQualifiedReference(request,acquire,{project})).toBe(payload);
    expect(acquire).toHaveBeenCalledTimes(1);
  });
  it('blocks unauthorized actions before invoking transport',async()=>{
    const acquire=vi.fn();
    await expect(acquireQualifiedReference({...request,action:'PUBLIC_SNAPSHOT'},acquire,{project})).rejects.toThrow('ACTION_NOT_PERMITTED');
    expect(acquire).not.toHaveBeenCalled();
  });
  it('rejects transport payload without a qualified receipt',async()=>{
    await expect(acquireQualifiedReference(request,async()=>({...payload,receipt:null}),{project})).rejects.toThrow('UNQUALIFIED_RESPONSE');
  });
  it('preserves upstream cooldown errors without extra retries',async()=>{
    const error=Object.assign(new Error('rate limited'),{status:429});
    const acquire=vi.fn(async()=>{throw error;});
    await expect(acquireQualifiedReference(request,acquire,{project})).rejects.toBe(error);
    expect(acquire).toHaveBeenCalledTimes(1);
  });
  it('does not execute an already cancelled lookup',async()=>{
    const controller=new AbortController();
    controller.abort();
    const acquire=vi.fn();
    await expect(acquireQualifiedReference(request,acquire,{project,signal:controller.signal})).rejects.toThrow();
    expect(acquire).not.toHaveBeenCalled();
  });
});
