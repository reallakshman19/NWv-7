import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalEquitySymbol, canonicalTrackedEquityId, TRACKED_EQUITY_SYMBOLS,
  qualifyTrackedEquities, mergeQualifiedEquities, deriveTrackedMovers } from '../src/services/marketEquityPolicy.js';
const now = Date.parse('2026-11-19T13:00:00Z');
const q = (symbol, value, quoteAt = '2026-11-19T10:00:00Z', changes = {}) => ({
  id: 'equity:NSE:' + symbol, symbol, name: symbol, value, quoteAt,
  sourceProvider: 'Yahoo Finance', sourceMode: 'yahoo-free-daily', sourceAuthority: 'third-party',
  exchange: 'NSE', currency: 'INR', cadence: 'daily', changePercent: '2.5', ...changes,
});
test('one 16-symbol producer/browser NSE universe, stable IDs', () => {
  assert.equal(TRACKED_EQUITY_SYMBOLS.length, 16);
  assert.equal(new Set(TRACKED_EQUITY_SYMBOLS).size, 16);
  assert.equal(canonicalEquitySymbol('infy.ns'), 'INFY');
  assert.equal(canonicalTrackedEquityId('infy.ns'), 'equity:NSE:INFY');
  assert.equal(canonicalTrackedEquityId('not-covered.ns'), null);
});
test('qualified observed prices have numeric values and real per-row timestamps', () => {
  assert.equal(qualifyTrackedEquities([q('INFY','1,000')], now).length, 0);
  assert.deepEqual(qualifyTrackedEquities([q('INFY',1000)], now).map(r => [r.id,r.value,r.quoteAt]),
    [['equity:NSE:INFY',1000,'2026-11-19T10:00:00Z']]);
});
test('partial publication advances only the updated share and retains missing shares', () => {
  const previous = {equities:[q('INFY',1000), q('TCS',2000)]};
  const incoming = {equities:[q('INFY',1100,'2026-11-19T11:00:00Z')]};
  const next = mergeQualifiedEquities(previous,incoming,now);
  assert.equal(next.equities.length,2);
  assert.equal(next.equities.find(r=>r.symbol==='INFY').value,1100);
  assert.equal(next.equities.find(r=>r.symbol==='TCS').value,2000);
  assert.equal(next.coverage.quotedCount,2); assert.equal(next.summary.advanced,1);
});
test('older quote does not regress, even if another share is newer', () => {
  const previous = {equities:[q('INFY',1000),q('TCS',2000)]};
  const incoming = {equities:[q('INFY',800,'2026-11-18T10:00:00Z'),q('TCS',2200,'2026-11-19T11:00:00Z')]};
  const next = mergeQualifiedEquities(previous,incoming,now);
  assert.equal(next.equities.find(r=>r.symbol==='INFY').value,1000);
  assert.equal(next.equities.find(r=>r.symbol==='TCS').value,2200);
  assert.equal(next.summary.older,1);
});
test('equal time conflicting values retain old with an explicit conflict', () => {
  const result=mergeQualifiedEquities({equities:[q('INFY',1000)]},{equities:[q('INFY',1050)]},now);
  assert.equal(result.changed,false);assert.equal(result.summary.conflicts,1);
  assert.equal(result.equities[0].value,1000);
});
test('incompatible provider cannot override a dated quote', () => {
  const result = mergeQualifiedEquities({equities:[q('INFY',1000)]},
    {equities:[q('INFY',2000,'2026-11-19T11:00:00Z',{sourceProvider:'SomeOtherVendor'})]},now);
  assert.equal(result.equities[0].value,1000);assert.equal(result.summary.incompatible,1);
});
test('reject foreign exchange, wrong identity, missing clock, expired/future, no provider', () => {
  const attempts=[q('INFY',1000,undefined,{exchange:'BSE'}),q('INFY',1000,undefined,{id:'equity:NSE:TCS'}),
    q('INFY',1000,undefined,{quoteAt:null}),q('INFY',1000,'2026-11-10T11:00:00Z'),
    q('INFY',1000,'2026-11-19T13:06:00Z'),q('INFY',1000,undefined,{sourceProvider:null}),
    q('INFY',1000,undefined,{currency:'USD'}),q('INFY',1000,undefined,{sourceAuthority:'official'}),
    q('INFY',1000,undefined,{value:Infinity}),q('INFY',1000,undefined,{value:-10}),
    q('UNSUPPORTED',1000),q('INFY',1000,undefined,{sourceMode:'seed'})];
  assert.equal(qualifyTrackedEquities(attempts,now).length,0);
  assert.equal(mergeQualifiedEquities(null,{equities:attempts},now).summary.invalid,attempts.length);
});
test('movers share genuine India quote date, unobserved changes remain unknown', () => {
  const result=deriveTrackedMovers([
    q('INFY',1000,'2026-11-19T09:00:00Z',{changePercent:4}),
    q('TCS',2000,'2026-11-19T09:00:00Z',{changePercent:-3}),
    q('SBIN',400,'2026-11-18T09:00:00Z',{changePercent:10}),
    q('WIPRO',100,'2026-11-19T09:00:00Z',{changePercent:null})
  ],now);
  assert.equal(result.sessionDate,'2026-11-19');
  assert.deepEqual(result.gainers.map(r=>r.symbol),['INFY']);
  assert.deepEqual(result.losers.map(r=>r.symbol),['TCS']);
  assert.equal(result.scope,'tracked-universe');
});
test('unavailable symbol is a coverage state, not a fabricated quote',()=>{
  const result=mergeQualifiedEquities(null,{equities:[q('TCS',2000)]},now);
  assert.equal(result.coverage.universeSize,16);
  assert.equal(result.coverage.quotedCount,1);
  assert.ok(result.coverage.unavailableSymbols.includes('INFY'));
  assert.ok(!result.equities.some(r=>r.symbol==='INFY'));
});
test('empty partial publication cannot clear previously verified equities',()=>{
  const result=mergeQualifiedEquities({equities:[q('INFY',1000)]},{equities:[]},now);
  assert.equal(result.equities.length,1);assert.equal(result.changed,false);
});
