// Runs without a browser, an external feed, or a Vitest dependency; publication responses are deterministic.
import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { importLegacyMarketServiceForTests } from './market_legacy_service_test_loader.mjs';
const { fetchAllMarketData } = await importLegacyMarketServiceForTests();
import { markMarketPayload, isMarketPayloadUsable } from '../src/services/marketTrust.js';
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const index = (name, symbol, value, ageMs) => ({name, symbol, value, quoteAt: iso(now - ageMs)});
const old = () => ({schemaVersion:'market-v3',sourceMode:'snapshot',fetchedAt:now-120000,generatedAt:iso(now-120000), indices:[index('NIFTY 50','^NSEI','25000',180000),index('SENSEX','^BSESN','82000',180000)]});
const json = (data, ok = true) => ({ok,json:async()=>data});
const mock = (snapshot, overrides = {}) => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('market_snapshot.json')) return json(snapshot);
    return overrides[url] || json(null,false);
  };
};
const lookup = (data,sym) => data.indices.find(row=>row.symbol===sym);
afterEach(()=>delete globalThis.fetch);
test('newer partial publication advances one index and preserves the omitted SENSEX', async()=>{
  const previous=old(); const update={...old(),fetchedAt:now-30000,generatedAt:iso(now-30000),schemaVersion:'market-india-1',indices:[index('NIFTY 50','^NSEI','25200',1000)]};
  mock(update);
  const data=await fetchAllMarketData({forceRefresh:true,previousData:previous});
  assert.equal(data.sourceMode,'snapshot');assert.equal(data.indices.length,2);
  assert.equal(lookup(data,'^NSEI').value,'25200');assert.equal(lookup(data,'^BSESN').value,'82000');
  assert.equal(lookup(data,'^BSESN').quoteAt,previous.indices[1].quoteAt);
});
test('newer Global quote cannot overwrite older India price',async()=>{
  const previous=old();const update={...old(),fetchedAt:now-30000,schemaVersion:'market-india-1',indices:[index('NIFTY 50','^NSEI','26000',3600000),index('S&P 500','^GSPC','6000',1000)]};
  mock(update);
  const data=await fetchAllMarketData({forceRefresh:true,previousData:previous});
  assert.equal(data.sourceMode,'snapshot'); assert.equal(lookup(data,'^NSEI').value,'25000');
  assert.equal(data.indices.length,3);assert.equal(data.globalIndices.length,1);
});
test('equal-clock partial same value does not discard another instrument',async()=>{
  const previous=old();const update={...old(),fetchedAt:now-30000,schemaVersion:'market-india-1',indices:[previous.indices[0]]};
  mock(update);
  const data=await fetchAllMarketData({forceRefresh:true,previousData:previous});
  assert.equal(data.indices.length,2);assert.equal(data.quoteMerge.unchanged,1);
});
test('equal-clock contradictory value does not overwrite original',async()=>{
  const previous=old();const update={...old(),fetchedAt:now-30000,schemaVersion:'market-india-1',indices:[{...previous.indices[0],value:'26000'}]};
  mock(update);
  const data=await fetchAllMarketData({forceRefresh:true,previousData:previous});
  assert.equal(lookup(data,'^NSEI').value,'25000');assert.equal(data.quoteMerge.conflicts,1);
});
test('25-hour in-memory previous cannot be revived after refresh failure',async()=>{
  mock(null);
  const prev={...old(),fetchedAt:now-25*3600000,generatedAt:iso(now-25*3600000)};
  const data=await fetchAllMarketData({forceRefresh:true,previousData:prev});
  assert.equal(data.sourceMode,'failed');assert.equal(data.indices.length,0);
});
test('Global-only snapshot is independently usable',async()=>{
  const snapshot={schemaVersion:'market-india-1',fetchedAt:now-2000,generatedAt:iso(now-2000),indices:[],globalIndices:[index('S&P 500','^GSPC','6000',1000)]};
  mock(snapshot);
  const data=await fetchAllMarketData({forceRefresh:true});
  assert.equal(isMarketPayloadUsable(data),true);assert.equal(data.indices.length,1);assert.equal(data.globalIndices.length,1);
});
test('unknown publication time is not silently replaced by the local clock',()=>{
  const marked=markMarketPayload({indices:[{name:'NIFTY 50',value:'25000'}]},'snapshot');
  assert.equal(marked.fetchedAt,null);assert.equal(marked.generatedAt,null);
});

test('newer partial live row retains SENSEX while updating NIFTY',async()=>{
  const previous=old();
  const when=now-120000;
  globalThis.fetch=async(url)=>{
    if(String(url).endsWith('market_snapshot.json')) return json(previous);
    if(String(url).includes('chart/%5ENSEI?')) return json({chart:{result:[{meta:{regularMarketPrice:25300,regularMarketTime:when/1000}}]}});
    return json(null,false);
  };
  const data=await fetchAllMarketData({forceRefresh:true,previousData:previous,allowLegacyLive:true});
  assert.equal(data.sourceMode,'live');assert.equal(data.indices.length,2);
  assert.equal(lookup(data,'^NSEI').quoteAt,iso(when));
  assert.equal(lookup(data,'^BSESN').quoteAt,previous.indices[1].quoteAt);
});

test('cold publication failure does not invoke any Yahoo/proxy cascade',async()=>{
  let calls=[];globalThis.fetch=async(url)=>{calls.push(String(url));return {ok:false,json:async()=>null};};
  const data=await fetchAllMarketData({forceRefresh:true});
  assert.equal(data.sourceMode,'failed');
  assert.equal(calls.length,1);assert.match(calls[0],/market_snapshot\.json$/);
});
