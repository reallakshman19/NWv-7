import test from 'node:test';
import assert from 'node:assert/strict';
import { assessMarketIpo, ipoEvidenceIsCurrent } from '../src/services/marketIpoPolicy.js';

const NOW = Date.parse('2026-11-19T10:30:00Z');
const DAYS = 24 * 60 * 60 * 1000;
const issue = {name:'Example Technologies', openDate:'2026-11-18',closeDate:'2026-11-25'};
const empty = () => ({live:[],upcoming:[],recent:[]});
const fixture = (status, ipo=empty(), checkedAt=new Date(NOW-60_000).toISOString())=>({
  generatedAt:new Date(NOW-60_000).toISOString(),
  fetchedAt:NOW-60_000, ipoLastCheckedAt:checkedAt,
  ipo, sourceHealth:{ipo:{status,provider:'BSE'}}
});
test('failed BSE request is unavailable, never zero current issues',()=>{
  const result=assessMarketIpo(fixture('failed'),NOW);
  assert.equal(result.state,'unavailable');
  assert.equal(result.rowCount,0);
  assert.match(result.message,/cannot be determined/i);
  assert.equal(ipoEvidenceIsCurrent(fixture('failed'),NOW),false);
});
test('failed source cannot display residual cached IPO rows as live',()=>{
  const result=assessMarketIpo(fixture('failed',{live:[issue],upcoming:[],recent:[]}),NOW);
  assert.equal(result.state,'unavailable');
  assert.deepEqual(result.rows,empty());
});
test('only recent explicit source-empty receipt proves no qualifying issue',()=>{
  const result=assessMarketIpo(fixture('empty'),NOW);
  assert.equal(result.state,'verified-empty');
  assert.equal(ipoEvidenceIsCurrent(fixture('empty'),NOW),true);
});
test('healthy source with valid dated issue rows is available',()=>{
  const result=assessMarketIpo(fixture('snapshot',{live:[issue],upcoming:[],recent:[]}),NOW);
  assert.equal(result.state,'available');
  assert.equal(result.rowCount,1);
  assert.equal(result.rows.live[0].name,issue.name);
  assert.equal(result.provider,'BSE');
});
test('missing receipt never proves empty calendar',()=>{
  const raw=fixture('empty');delete raw.sourceHealth.ipo;
  assert.equal(assessMarketIpo(raw,NOW).state,'unverified');
});
test('snapshot success but zero rows is contradictory, not verified-empty',()=>{
  assert.equal(assessMarketIpo(fixture('snapshot'),NOW).state,'unverified');
});
test('empty status with nonempty calendar is contradictory',()=>{
  const state=assessMarketIpo(fixture('empty',{live:[issue],upcoming:[],recent:[]}),NOW);
  assert.equal(state.state,'unverified');
  assert.equal(state.rowCount,0);
});
test('stale IPO source receipt is never called current even if indices refreshed',()=>{
  const raw=fixture('empty',empty(),new Date(NOW-2*DAYS).toISOString());
  raw.generatedAt=new Date(NOW-30_000).toISOString();
  assert.equal(assessMarketIpo(raw,NOW).state,'stale');
});
test('future source check beyond tolerance is unverified',()=>{
  assert.equal(assessMarketIpo(fixture('empty',empty(),new Date(NOW+10*60_000).toISOString()),NOW).state,'unverified');
});
test('a successful IPO receipt requires dated valid rows',()=>{
  const invalid={...issue,closeDate:'2026-02-30'};
  const value=assessMarketIpo(fixture('snapshot',{live:[invalid],upcoming:[],recent:[]}),NOW);
  assert.equal(value.state,'unverified');
});
test('invalid offset-free source clock cannot establish freshness',()=>{
  const raw=fixture('empty',empty(),'2026-11-19T10:30:00');delete raw.generatedAt;delete raw.fetchedAt;
  assert.equal(assessMarketIpo(raw,NOW).state,'unverified');
});
test('new publication clock cannot re-date an IPO empty receipt with missing check clock',()=>{
  const raw=fixture('empty');delete raw.ipoLastCheckedAt;
  raw.generatedAt=new Date(NOW-1000).toISOString();
  assert.equal(assessMarketIpo(raw,NOW).state,'unverified');
});
test('unidentified health stays unverified instead of being guessed',()=>{
  const raw=fixture('snapshot',{live:[issue],upcoming:[],recent:[]});
  raw.sourceHealth.ipo.status='unknown';
  assert.equal(assessMarketIpo(raw,NOW).state,'unverified');
});
