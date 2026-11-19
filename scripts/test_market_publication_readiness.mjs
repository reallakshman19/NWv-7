import test from 'node:test';
import assert from 'node:assert/strict';
import {assessMarketPublication as assess} from './check_market_publication_readiness.mjs';
const now=Date.parse('2026-11-19T16:00:00Z'),hour=3600000;
const iso=t=>new Date(t).toISOString();
const index=(symbol,time=now-2*hour)=>({name:symbol,symbol,value:'25,000',quoteAt:iso(time),sourceMode:'yahoo-free-daily'});
const equity=(symbol,time=now-2*hour)=>({...index(symbol,time),id:'equity:NSE:'+symbol,exchange:'NSE',currency:'INR',sourceProvider:'Yahoo Finance',sourceAuthority:'third-party'});
const symbols=['INFY','TCS'];
function sample(){return {schemaVersion:'market-india-1',generatedAt:iso(now-hour),fetchedAt:now-hour,
  indices:['^NSEI','^BSESN','^NSEBANK'].map(s=>index(s)),equities:symbols.map(s=>equity(s)),
  equityCoverage:{universeSize:2,quotedCount:2,unavailableSymbols:[]},sourceHealth:{equities:{status:'snapshot'}}};}
const run=(x,opts={})=>assess(x,{nowMs:now,symbols,...opts});
const codes=x=>x.blocks.map(b=>b.code);
test('complete fixture is technically qualified but not legally authorized',()=>{
 const r=run(sample());assert.equal(r.technicalStatus,'PASS');assert.equal(r.releaseStatus,'HOLD');assert.equal(r.manualBlocks[0].code,'RIGHTS_UNVERIFIED');
});
test('external manual rights verification is never inferred by quote data',()=>{
 assert.equal(run(sample(),{rightsVerified:true}).releaseStatus,'READY_FOR_OWNER_DECISION');
});
test('24h expired, future and inconsistent publication clocks fail',()=>{
 const x=sample();x.generatedAt=iso(now-25*hour);x.fetchedAt=now-25*hour;assert.ok(codes(run(x)).includes('STALE_PUBLICATION'));
 x.generatedAt=iso(now+hour);x.fetchedAt=now+hour;assert.ok(codes(run(x)).includes('FUTURE_PUBLICATION'));
 x.generatedAt=iso(now-hour);x.fetchedAt=now-3*hour;assert.ok(codes(run(x)).includes('CLOCK_CONFLICT'));
});
test('missing offset and equities are not silently repaired',()=>{
 const x=sample();x.generatedAt='2026-11-19T15:00:00';delete x.equities;
 assert.ok(codes(run(x)).includes('CLOCK_MISSING'));assert.ok(codes(run(x)).includes('EQUITIES_MISSING'));
});
test('five-day source age is enforced independently of collection age',()=>{
 const x=sample();x.indices[1].quoteAt=iso(now-6*24*hour);assert.ok(codes(run(x)).includes('INVALID_INDEX'));
});
test('partial documented source coverage is not fabricated',()=>{
 const x=sample();x.equities=[equity('INFY')];x.equityCoverage={universeSize:2,quotedCount:1,unavailableSymbols:['TCS']};x.sourceHealth.equities.status='partial';
 const r=run(x);assert.equal(r.technicalStatus,'PASS');assert.equal(r.counts.qualifiedEquities,1);assert.equal(r.notes[0].code,'PARTIAL_EQUITY_COVERAGE');
});
test('unsubstantiated coverage receipt fails',()=>{
 const x=sample();x.equities=[equity('INFY')];x.sourceHealth.equities.status='partial';assert.ok(codes(run(x)).includes('COVERAGE_RECEIPT'));
});
test('unknown and duplicate NSE share identities fail',()=>{
 const x=sample();x.equities=[equity('INFY'),equity('INFY')];assert.ok(codes(run(x)).includes('INVALID_EQUITY'));
 x.equities=[equity('INFY'),equity('UNLISTED')];assert.ok(codes(run(x)).includes('INVALID_EQUITY'));
});
test('bad source authority, value, future timestamp fail',()=>{
 const x=sample();x.equities[0].sourceAuthority='official';x.equities[1].value=0;
 assert.equal(run(x).counts.qualifiedEquities,0);assert.ok(codes(run(x)).includes('NO_EQUITY_COVERAGE'));
});
test('registry cannot silently duplicate symbols',()=>{
 assert.ok(codes(run(sample(),{symbols:['INFY','INFY']})).includes('TRACKED_REGISTRY'));
});
test('mismatched source health is a structural failure',()=>{
 const x=sample();x.sourceHealth.equities.status='failed';assert.ok(codes(run(x)).includes('SOURCE_STATUS'));
});
