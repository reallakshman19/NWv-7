import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildComparisonOutcome } from '../src/market/features/funds/fundComparison.js';
import { acquireQualifiedReference, projectReferenceObservation } from '../src/market/services/referenceAcquisition.js';
import * as pathGuard from './market_r21_path_guard.mjs';

const request = {sourceId:'mfapi', action:'BROWSER_FETCH', kind:'NAV',
  instrument:{instrumentId:'FUND:123456',type:'FUND',currency:'INR',displayName:'Fixture'},
  url:'https://api.mfapi.in/mf/123456/latest'};
const payload = {schemeCode:'123456',nav:110,date:'2026-11-23',receipt:{
  sourceId:'mfapi',publisher:'MFapi',rights:'BROWSER_DIRECT_CONDITIONAL',accessMode:'DIRECT_ON_DEMAND',
  state:'READY',validity:'VALID',providerAsOf:'2026-11-23',providerClockGranularity:'day',
  originalUrl:request.url,transportStatus:200}};
const project = value => projectReferenceObservation(request,value,value.nav);
const memory = initial => {
  const records = new Map(Object.entries(initial));
  return {getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)};
};

test('comparison retains a common pre-horizon holiday anchor within seven days', () => {
  const observations = [{date:'2025-11-21',nav:100},{date:'2025-11-25',nav:105},{date:'2026-11-24',nav:110}];
  const cache = {'123456':{observations},'654321':{observations}};
  const result = buildComparisonOutcome(Object.keys(cache),cache,'1Y');
  assert.equal(result.metricsByScheme['123456'].returnPercent,10);
  assert.equal(result.metricsByScheme['123456'].isCagr,false);
  assert.equal(result.alignedDates[0],'2025-11-21');
  assert.equal(result.seriesByScheme['123456'][0].normalized,100);
});

test('comparison never substitutes an observation after the target or beyond seven days', () => {
  const observations = [{date:'2025-11-14',nav:100},{date:'2025-11-25',nav:105},{date:'2026-11-24',nav:110}];
  const cache = {'123456':{observations},'654321':{observations}};
  assert.equal(buildComparisonOutcome(Object.keys(cache),cache,'1Y').metricsByScheme['123456'].returnPercent,null);
});

test('reference rejects a different scheme before projecting request identity', async () => {
  await assert.rejects(acquireQualifiedReference(request,async()=>({...payload,schemeCode:'654321'}),{project}),/IDENTITY_MISMATCH/);
});

test('reference rejects a receipt bound to a different scheme endpoint', async () => {
  const receipt = {...payload.receipt,originalUrl:'https://api.mfapi.in/mf/654321/latest'};
  await assert.rejects(acquireQualifiedReference(request,async()=>({...payload,receipt}),{project}),/UNQUALIFIED_RESPONSE/);
});

test('reference preserves the bounded same-scheme history fallback', async () => {
  const receipt = {...payload.receipt,originalUrl:'https://api.mfapi.in/mf/123456?startDate=2026-11-10&endDate=2026-11-24'};
  const value = {...payload,receipt};
  assert.equal(await acquireQualifiedReference(request,async()=>value,{project}),value);
});

test('reference rejects another FX pair before relabelling its rate', async () => {
  const fxRequest = {sourceId:'frankfurter',action:'BROWSER_FETCH',kind:'FX_REFERENCE',
    instrument:{instrumentId:'FX:USD/INR',type:'FX',currency:'INR',displayName:'USD/INR'},
    url:'https://api.frankfurter.dev/v2/rate/usd/inr?providers=ecb'};
  const fxPayload = {base:'OMR',quote:'INR',rate:220,date:'2026-11-23',receipt:{
    ...payload.receipt,sourceId:'frankfurter',publisher:'Frankfurter',originalUrl:fxRequest.url}};
  await assert.rejects(acquireQualifiedReference(fxRequest,async()=>fxPayload,{
    project:value=>projectReferenceObservation(fxRequest,value,value.rate)}),/IDENTITY_MISMATCH/);
});

test('reference cancels promptly when the acquisition ignores its abort signal', async () => {
  const controller = new AbortController();
  let release;
  const acquisition = new Promise(resolve=>{release=resolve;});
  const outcome = acquireQualifiedReference(request,()=>acquisition,{signal:controller.signal,project})
    .then(()=> 'resolved',error=>error.name);
  await Promise.resolve();
  controller.abort();
  const observed = await Promise.race([outcome,new Promise(resolve=>setTimeout(()=>resolve('still pending'),30))]);
  release(payload);
  await outcome;
  assert.equal(observed,'AbortError');
});

test('assurance scope accepts only the reviewed workflow and vNext Markdown reports', () => {
  assert.equal(pathGuard.isMarketVNextAssurancePath('.github/workflows/market_vnext_responsive.yml'),true);
  assert.equal(pathGuard.isMarketVNextAssurancePath('reports/market-vnext/INDEPENDENT_REVIEW.md'),true);
  for (const path of ['.github/workflows/deploy-new.yml','reports/unrelated/a.md',
    'reports/market-vnext/../escape.md','reports/market-vnext/payload.json',null]) {
    assert.equal(pathGuard.isMarketVNextAssurancePath(path),false,String(path));
  }
});

test('watchlist preserves a newer tab write and reports unsaved local changes', async () => {
  const {createWatchlistStore,WATCHLIST_V2_KEY} = await import('../src/market/features/equity/watchlistStore.js');
  const storage = memory({});
  const first = createWatchlistStore({storage}), stale = createWatchlistStore({storage});
  first.addKey('INFY');
  const saved = storage.getItem(WATCHLIST_V2_KEY);
  stale.addKey('TCS');
  assert.equal(storage.getItem(WATCHLIST_V2_KEY),saved);
  assert.equal(stale.getState().isPersistent,false);
  assert.match(stale.getState().errorMessage,/another tab/i);
  assert.deepEqual(createWatchlistStore({storage}).getState().keys,['NSE:INFY']);
});

test('watchlist never overwrites unknown bytes after a failed initial read', async () => {
  const {createWatchlistStore,WATCHLIST_V2_KEY} = await import('../src/market/features/equity/watchlistStore.js');
  const storage = memory({[WATCHLIST_V2_KEY]:'{"schemaVersion":2,"keys":["NSE:INFY"]}'});
  const read = storage.getItem;
  let fail = true;
  storage.getItem = key => {if(fail)throw new Error('denied');return read(key);};
  const store = createWatchlistStore({storage});
  fail = false;
  store.addKey('TCS');
  assert.equal(storage.getItem(WATCHLIST_V2_KEY),'{"schemaVersion":2,"keys":["NSE:INFY"]}');
  assert.equal(store.getState().isPersistent,false);
});

test('watchlist preserves an empty corrupt V2 and ordinary sequential writes still persist', async () => {
  const {createWatchlistStore,WATCHLIST_V2_KEY} = await import('../src/market/features/equity/watchlistStore.js');
  const corrupt = memory({[WATCHLIST_V2_KEY]:'  '});
  createWatchlistStore({storage:corrupt}).addKey('TCS');
  assert.equal(corrupt.getItem(WATCHLIST_V2_KEY),'  ');
  const storage = memory({});
  const store = createWatchlistStore({storage});
  store.addKey('INFY');
  store.addKey('TCS');
  store.removeKey('INFY');
  assert.deepEqual(createWatchlistStore({storage}).getState().keys,['NSE:TCS']);
  assert.equal(store.getState().isPersistent,true);
});
