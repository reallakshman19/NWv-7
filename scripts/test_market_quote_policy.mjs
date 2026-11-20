import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalIndexId, indexQuoteTime, indexValue, mergeQualifiedIndices } from '../src/services/marketQuotePolicy.js';
const now = Date.parse('2026-11-19T12:00:00Z');
const row = (name, symbol, value, deltaMs, extra = {}) => ({ name, symbol, value, quoteAt: new Date(now + deltaMs).toISOString(), ...extra });
const previous = { indices: [row('NIFTY 50','^NSEI','25,000',-180000), row('SENSEX','^BSESN','82000',-180000)] };
const get = (result, symbol) => result.indices.find((r) => r.symbol === symbol);
test('canonical aliases do not create duplicate index rows', () => {
  const incoming = {indices:[row('NIFTY BANK','^NSEBANK','52000',-30000)],sectorals:[row('BANK NIFTY','^NSEBANK','52000',-30000)]};
  assert.equal(canonicalIndexId(incoming.indices[0]), canonicalIndexId(incoming.sectorals[0]));
  assert.equal(mergeQualifiedIndices({}, incoming, now).indices.length, 1);
});
test('newer US with older India only updates US', () => {
  const incoming = {indices: [row('NIFTY 50','^NSEI','26000',-3600000), row('S&P 500','^GSPC','6000',-1000)]};
  const merged = mergeQualifiedIndices(previous,incoming,now);
  assert.equal(get(merged,'^NSEI').value, '25,000');
  assert.equal(get(merged,'^BSESN').value, '82000');
  assert.equal(get(merged,'^GSPC').value, '6000');
  assert.equal(merged.globalIndices.length,1);
});
test('newer publication does not overwrite equal-time partial index values', () => {
  const merged = mergeQualifiedIndices(previous,{indices:[row('NIFTY 50','^NSEI','25,000',-180000)]},now);
  assert.equal(merged.indices.length,2); assert.equal(merged.changed,false);
});
test('mixed ages advance only a newer India observation', () => {
  const merged = mergeQualifiedIndices(previous,{indices:[row('NIFTY 50','^NSEI','25200',-1000),row('SENSEX','^BSESN','81000',-3600000)]},now);
  assert.equal(get(merged,'^NSEI').value,'25200'); assert.equal(get(merged,'^BSESN').value,'82000');
  assert.equal(merged.summary.advanced,1);
});
test('same-time conflict remains old, with a conflict receipt', () => {
  const merged = mergeQualifiedIndices(previous,{indices:[row('NIFTY 50','^NSEI','26000',-180000)]},now);
  assert.equal(get(merged,'^NSEI').value,'25,000'); assert.equal(merged.summary.conflicts,1);
});
test('newer partial quote advances one row and retains the other', () => {
  const merged = mergeQualifiedIndices(previous,{indices:[row('NIFTY 50','^NSEI','25200',-120000)]},now);
  assert.equal(get(merged,'^NSEI').value,'25200'); assert.equal(merged.indices.length,2);
});
test('provider/cadence incompatibility cannot overwrite an older observation', () => {
  const base = {indices:[row('NIFTY 50','^NSEI','25000',-180000,{sourceProvider:'provider-A',cadence:'daily'})]};
  const merged = mergeQualifiedIndices(base,{indices:[row('NIFTY 50','^NSEI','25100',-1000,{sourceProvider:'provider-B',cadence:'intraday'})]},now);
  assert.equal(merged.indices[0].value,'25000'); assert.equal(merged.summary.incompatible,1);
});
test('global-only quotation remains independently qualified', () => {
  const result = mergeQualifiedIndices(null,{globalIndices:[row('S&P 500','^GSPC','6000',-1000)]},now);
  assert.equal(result.indices.length,1); assert.equal(result.globalIndices.length,1);
});
test('source times require explicit offset and reject future observations', () => {
  assert.equal(indexQuoteTime({quoteAt:'2026-11-19T12:00:00'},now),null);
  assert.equal(indexQuoteTime({quoteAt:'2026-11-19T12:06:00Z'},now),null);
  assert.equal(indexQuoteTime({timestamp:now-1000},now),now-1000);
});
test('unknown, malformed, zero and nonfinite values are not accepted', () => {
  for (const value of ['₹25000','22,00',0,-1,'','Infinity',Infinity,NaN]) assert.equal(indexValue({value}),null);
  const merged = mergeQualifiedIndices(null,{indices:[{name:'SENSEX',value:'1',quoteAt:'bad'}]},now);
  assert.equal(merged.indices.length,0); assert.equal(merged.summary.invalid,1);
});
test('the same source time never changes when it is retained', () => {
  const merged = mergeQualifiedIndices(previous, {indices:[row('NIFTY 50','^NSEI','20000',-3600000)]}, now);
  assert.equal(get(merged,'^NSEI').quoteAt,previous.indices[0].quoteAt);
});

test('a 6-day old quote cannot become current when its publication clock is new', () => {
  const sixDays = 6 * 24 * 60 * 60 * 1000;
  const stale = row('NIFTY 50','^NSEI','26000',-sixDays);
  assert.equal(indexQuoteTime(stale,now),null);
  const actual = mergeQualifiedIndices(null,{indices:[stale]},now);
  assert.equal(actual.indices.length,0);
  assert.equal(actual.summary.invalid,1);
});
