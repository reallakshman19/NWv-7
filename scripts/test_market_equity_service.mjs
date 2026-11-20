import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { importLegacyMarketServiceForTests } from './market_legacy_service_test_loader.mjs';
const { fetchAllMarketData, sanitizeMarketPayload } = await importLegacyMarketServiceForTests();
import { isMarketPayloadUsable } from '../src/services/marketTrust.js';
const now = Date.now();
const time = (offset) => new Date(now + offset).toISOString();
const equity = (symbol, value, offset=-180000, extra={}) => ({
  symbol, name:symbol, id:'equity:NSE:' + symbol, value, quoteAt:time(offset), exchange:'NSE', currency:'INR',
  sourceMode:'yahoo-free-daily', sourceProvider:'Yahoo Finance', sourceAuthority:'third-party', cadence:'daily',
  changePercent:2, sourceUrl:'https://query1.finance.yahoo.com/v8/finance/chart/'+symbol+'.NS', ...extra,
});
const index=(name,symbol,value=25000)=>({name,symbol,value,quoteAt:time(-180000)});
const publication=(equities, timestamp=now-120000, others={})=>({
  schemaVersion:'market-india-1', fetchedAt:timestamp, generatedAt:new Date(timestamp).toISOString(),
  sourceMode:'snapshot', indices:[index('NIFTY 50','^NSEI')], equities, ...others,
});
const mock=(data)=> {let calls=0;globalThis.fetch=async (url)=>{
  calls++;if(String(url).endsWith('market_snapshot.json'))return {ok:true,json:async()=>data};
  throw new Error('Unplanned network request: '+url);
};return ()=>calls;};
afterEach(()=>delete globalThis.fetch);
test('consumer exposes all qualified tracked shares from the existing publication',async()=>{
  const symbols=['RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','SBIN','ITC','BHARTIARTL','KOTAKBANK','LT','HINDUNILVR','AXISBANK','BAJFINANCE','MARUTI','WIPRO','SUNPHARMA'];
  const calls=mock(publication(symbols.map((symbol,i)=>equity(symbol,100+i))));
  const data=await fetchAllMarketData({forceRefresh:true});
  assert.equal(calls(),1);assert.equal(data.sourceMode,'snapshot');
  assert.equal(data.equities.length,16);assert.equal(data.equityCoverage.quotedCount,16);
  assert.equal(data.equityCoverage.unavailableSymbols.length,0);
  assert.equal(data.movers.scope,'tracked-universe');
  assert.equal(data.equities.find(r=>r.symbol==='INFY').sourceAuthority,'third-party');
});
test('newer partial share publication retains eligible omitted stocks',async()=>{
  const previous=publication([equity('INFY',1000),equity('TCS',2000)]);
  const updated=publication([equity('INFY',1050,-1000)],now-50000);
  mock(updated);
  const data=await fetchAllMarketData({forceRefresh:true,previousData:previous});
  assert.equal(data.equities.length,2);
  assert.equal(data.equities.find(r=>r.symbol==='INFY').value,1050);
  assert.equal(data.equities.find(r=>r.symbol==='TCS').value,2000);
  assert.equal(data.equities.find(r=>r.symbol==='TCS').quoteAt,new Date(now-180000).toISOString());
  assert.equal(data.equityMerge.advanced,1);
  assert.equal(data.equityCoverage.quotedCount,2);
  assert.equal(data.equityCoverage.sourceAcquiredCount,1);
  assert.equal(data.equityCoverage.retainedCount,1);
});
test('same publication date but newer share observation can be retained',async()=>{
  const previous=publication([equity('INFY',1000)]);
  const updated=publication([equity('INFY',1050,-1000)],previous.fetchedAt);
  mock(updated);
  const data=await fetchAllMarketData({forceRefresh:true,previousData:previous});
  assert.equal(data.sourceMode,'snapshot');assert.equal(data.equities[0].value,1050);
});
test('equal-time contradictory and older equity observations cannot regress',async()=>{
  const previous=publication([equity('INFY',1000),equity('TCS',2000)]);
  const updated=publication([equity('INFY',500),equity('TCS',1000,-3600000)],now-1000);
  mock(updated);
  const data=await fetchAllMarketData({forceRefresh:true,previousData:previous});
  assert.equal(data.equities.find(r=>r.symbol==='INFY').value,1000);
  assert.equal(data.equities.find(r=>r.symbol==='TCS').value,2000);
  assert.equal(data.equityMerge.conflicts,1);
  assert.equal(data.equityMerge.older,1);
});
test('equity-only valid publication is independently usable',async()=>{
  const data=publication([equity('INFY',1000)],now-5000,{indices:[]});
  mock(data);
  const result=await fetchAllMarketData({forceRefresh:true});
  assert.equal(result.indices.length,0);assert.equal(result.equities.length,1);
  assert.equal(isMarketPayloadUsable(result),true);
});
test('stock with missing source clock is omitted rather than dated with collection time',async()=>{
  const data=publication([equity('INFY',1000,-180000,{quoteAt:null}),equity('TCS',2000)]);
  mock(data);
  const result=await fetchAllMarketData({forceRefresh:true});
  assert.equal(result.equities.length,1);assert.equal(result.equities[0].symbol,'TCS');
  assert.equal(result.equityCoverage.unavailableSymbols.includes('INFY'),true);
});
test('cached publication keeps original source clock and cannot create fake prices',()=>{
  const original=publication([equity('INFY',1000)],now-20*60000);
  const state=sanitizeMarketPayload(original,'cache');
  assert.equal(state.equities.length,1);
  assert.equal(state.equities[0].quoteAt,original.equities[0].quoteAt);
  assert.equal(state.fetchedAt,original.fetchedAt);
});
