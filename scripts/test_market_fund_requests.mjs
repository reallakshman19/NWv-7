import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SAVED_FUNDS, normalizeSavedFundCodes, qualifiedFundNav, createMarketFundNavStore, FUND_NAV_CACHE_KEY } from '../src/services/marketFundRequests.js';
const T = Date.parse('2026-11-19T10:00:00Z');
const good = code => ({ code: String(code), name: 'Scheme ' + code + ' Direct Growth', category: 'Equity', nav: 123.45, date: '18-11-2026' });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('code migration deduplicates and bounds saved schemes without changing existing IDs', () => {
  const list = Array.from({ length: 20 }, (_, n) => String(100000+n));
  assert.deepEqual(normalizeSavedFundCodes([list[0], list[0], null, 'not-a-code', ...list]), list.slice(0, 12));
  assert.equal(MAX_SAVED_FUNDS, 12);
});

test('source date cannot be fabricated or rolled forward by reading the cache', () => {
  assert.equal(qualifiedFundNav(good('123456'), '123456', T).date, '18-11-2026');
  assert.equal(qualifiedFundNav({...good('123456'),date:'31-02-2026'}, '123456', T),null);
  assert.equal(qualifiedFundNav({...good('123456'),date:'20-11-2026'}, '123456', T),null);
  assert.equal(qualifiedFundNav({...good('123456'),date:''}, '123456', T),null);
  assert.equal(qualifiedFundNav({...good('123456'),code:'654321'}, '123456', T),null);
  assert.equal(qualifiedFundNav({...good('123456'),nav:Infinity}, '123456', T),null);
});

test('same India day NAV uses qualified cache with original checkedAt and date',async()=>{
  let time=T; let fetches=0; let storage=null;
  const load=async code=>{fetches++;return good(code)};
  const repo=createMarketFundNavStore({load,read:()=>storage,write:(_k,v)=>{storage=v},now:()=>time});
  const first=await repo.request('100001');
  assert.equal(first.delivery,'provider'); assert.equal(first.checkedAt,T);
  time+=3*3600000;
  const second=await repo.request('100001');
  assert.equal(second.delivery,'cache'); assert.equal(second.checkedAt,T); assert.equal(second.date,'18-11-2026');
  assert.equal(fetches,1);assert.equal(storage.version,1);assert.ok(storage.items['100001']);
  // Reopening from the same browser storage still qualifies the original source date.
  const reopen=createMarketFundNavStore({load,read:()=>storage,write:()=>{},now:()=>time});
  assert.equal((await reopen.request('100001')).delivery,'cache');assert.equal(fetches,1);
  time+=24*3600000;
  assert.equal((await repo.request('100001')).delivery,'provider');assert.equal(fetches,2);
});

test('one transport per scheme across concurrent calls',async()=>{
  const pending={};let calls=0;
  const repo=createMarketFundNavStore({load:code=>{calls++;return new Promise(resolve=>pending[code]=resolve)},now:()=>T});
  const a=repo.request('100001'),b=repo.request('100001');
  await flush();assert.equal(calls,1);
  pending['100001'](good('100001'));
  const results=await Promise.all([a,b]);
  assert.equal(results[0].nav,123.45);assert.equal(results[1].nav,123.45);assert.equal(repo.pendingCount(),0);
});

test('cancelling one subscriber leaves the other subscriber intact',async()=>{
  let resolveSource; let abortCount=0;
  const repo=createMarketFundNavStore({load:(_code,{signal})=>{
    signal.addEventListener('abort',()=>abortCount++);
    return new Promise(resolve=>resolveSource=resolve);
  },now:()=>T});
  const controller=new AbortController();
  const a=repo.request('100001',{signal:controller.signal});const b=repo.request('100001');
  await flush(); controller.abort();
  await assert.rejects(a,{name:'AbortError'});
  assert.equal(abortCount,0);
  resolveSource(good('100001'));
  assert.equal((await b).nav,123.45);
});

test('cancelling the last subscriber aborts a transport and replacement reissues safely',async()=>{
  let starts=0;const controllers=[];
  const repo=createMarketFundNavStore({load:(_code,{signal})=>new Promise((resolve,reject)=>{
    starts++; controllers.push(signal);
    signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
  }),now:()=>T});
  const abort=new AbortController();const first=repo.request('100001',{signal:abort.signal});
  await flush(); abort.abort();await assert.rejects(first,{name:'AbortError'});
  assert.equal(controllers[0].aborted,true);
  await flush();const next=new AbortController();const second=repo.request('100001',{signal:next.signal});
  await flush();assert.equal(starts,2);next.abort();await assert.rejects(second,{name:'AbortError'});
});

test('batch loads at most three at once and a bad scheme never hides the others',async()=>{
  let concurrent=0,max=0,total=0;const waiting=[];
  const repo=createMarketFundNavStore({load:code=>{
    concurrent++;total++; max=Math.max(max,concurrent);
    return new Promise((resolve,reject)=>waiting.push({code,done:()=>{concurrent--; if(code==='100004')reject(new Error('source unavailable'));else resolve(good(code))}}));
  },now:()=>T});
  const codes=Array.from({length:12},(_,i)=>String(100001+i));const statuses=[];
  const task=repo.batch(codes,{onItem:item=>statuses.push(item)});
  await flush();assert.equal(total,3);
  while(total<12||concurrent){const current=waiting.splice(0);for(const one of current)one.done();await flush();}
  const result=await task;
  assert.equal(result.total,12);assert.equal(result.requested,12);
  assert.equal(result.results['100004'].status,'error');
  assert.equal(result.results['100005'].status,'ready');
  assert.equal(max,3);assert.equal(total,12);
  assert.equal(statuses.filter(x=>x.status==='ready').length,11);
});

test('batch 429 stops queued requests without retry loops',async()=>{
  let requests=0;
  const repo=createMarketFundNavStore({load:async code=>{
    requests++;
    if(code==='100001')throw Object.assign(new Error('HTTP 429'),{status:429});
    return good(code);
  },now:()=>T});
  const result=await repo.batch(Array.from({length:12},(_,i)=>String(i+100001)));
  assert.equal(result.cooldown,true);assert.ok(requests<=3);
  assert.equal(result.results['100001'].status,'cooldown');
});

test('cancelled batch does not emit late ready rows or start another fetch',async()=>{
  let starts=0, resolves=[];
  const repo=createMarketFundNavStore({load:code=>{starts++;return new Promise(resolve=>resolves.push(()=>resolve(good(code))) );},now:()=>T});
  const controller=new AbortController();let updates=[];
  const task=repo.batch(Array.from({length:8},(_,i)=>String(100001+i)),{signal:controller.signal,onItem:r=>updates.push(r)});
  await flush();assert.equal(starts,3);controller.abort();
  const state=await task;for(const resolve of resolves)resolve();await flush();
  assert.equal(state.cancelled,true);assert.equal(starts,3);assert.equal(updates.filter(x=>x.status==='ready').length,0);
});

test('malformed cached NAV and invalid scheme IDs fail closed',async()=>{
  let calls=0;
  const bad={version:1,items:{'100001':{checkedAt:T-100,nav:{...good('100001'),date:'31-02-2026'}}}};
  const repo=createMarketFundNavStore({load:async code=>{calls++;return good(code)},read:()=>bad,now:()=>T});
  assert.equal((await repo.request('100001')).delivery,'provider');assert.equal(calls,1);
  await assert.rejects(repo.request('../path'),/Invalid fund scheme code/);
});
