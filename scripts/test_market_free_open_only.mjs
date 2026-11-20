import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MARKET_FREE_OPEN_ONLY, MARKET_OPEN_SOURCE_MODE, freeOpenMarketPayload } from '../src/services/marketFreeOpenPolicy.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=(p)=>fs.readFileSync(path.join(ROOT,p),'utf8');
const json=(p)=>JSON.parse(file(p));

test('public mode is free/open-only and emits no quote or NAV values',()=>{
  assert.equal(MARKET_FREE_OPEN_ONLY,true);
  const payload=freeOpenMarketPayload();
  assert.equal(payload.sourceMode,MARKET_OPEN_SOURCE_MODE);
  for(const section of ['indices','globalIndices','sectorals','equities','mutualFunds','nfo','commodities','currencies'])
    assert.deepEqual(payload[section],[]);
  assert.deepEqual(payload.ipo,{live:[],upcoming:[],recent:[]});
  assert.equal(payload.generatedAt,null);
  assert.equal(payload.fetchedAt,null);
});
test('all four public financial dataset files are quote-free in checkout',()=>{
  const snap=json('public/data/market_snapshot.json');
  const nav=json('public/data/mutual_fund_snapshot.json');
  const health=json('public/data/market_source_health.json');
  const metrics=json('public/data/market_metrics.json');
  assert.equal(snap.sourceMode,MARKET_OPEN_SOURCE_MODE);
  assert.equal(snap.generatedAt,null);
  assert.equal(snap.fetchedAt,null);
  for(const section of ['indices','equities','mutualFunds','nfo','commodities'])
    assert.deepEqual(snap[section],[]);
  assert.deepEqual(nav.mutualFunds,[]);
  assert.equal(nav.generatedAt,null);
  assert.equal(health.validation.status,'HOLD');
  assert.deepEqual(metrics.equities.indices,[]);
  assert.deepEqual(metrics.equities.globalIndices,[]);
  assert.deepEqual(metrics.mutualFunds,[]);
  assert.deepEqual(metrics.fx,[]);
  assert.deepEqual(metrics.commodities,[]);
  for(const p of ['market_snapshot','mutual_fund_snapshot','market_source_health','market_metrics']){
    const raw=file('public/data/'+p+'.json');
    for(const token of ['query1.finance.yahoo.com','portal.amfiindia.com/spages/NAVAll.txt','"price":','"nav":','"value":']){
      assert.equal(raw.includes(token),false,p+' contains forbidden '+token);
    }
  }
  // Historical docs copies are publicly readable even though Pages builds from public/.
  for (const p of ['market_snapshot', 'mutual_fund_snapshot', 'market_metrics']) {
    assert.deepEqual(json('docs/data/' + p + '.json'), json('public/data/' + p + '.json'));
  }
});
test('neither scheduled nor manual data-writing jobs remain in Market publisher workflow',()=>{
  const flow=file('.github/workflows/market_refresh.yml');
  assert.doesNotMatch(flow,/^\s*schedule:/m);
  assert.doesNotMatch(flow,/^\s*refresh:/m);
  assert.doesNotMatch(flow,/git\s+push\s+origin|git\s+commit\s+-m|contents:\s+write/);
  assert.match(flow,/persist-credentials: false/);
  assert.match(flow,/NO DATA PUBLICATION/);
});
test('public market and browser cache never rehydrate legacy third-party quotes',()=>{
  const service=file('src/services/indianMarketStableService.js');
  const context=file('src/context/MarketContext.jsx');
  for(const text of [service,context]){
    assert.match(text,/if\s*\(MARKET_FREE_OPEN_ONLY\)/);
    assert.match(text,/freeOpenMarketPayload\(\)/);
  }
});
test('FX uses only direct free open-source Frankfurter, never previous proprietary API',()=>{
  const service=file('src/services/indiaMarketTools.js');
  assert.match(service,/https:\/\/api\.frankfurter\.dev\/v2\/rate\/omr\/inr/);
  assert.doesNotMatch(service,/open\.er-api\.com|nw7\.omr-inr\.v1/);
  assert.match(service,/nw7\.omr-inr\.frankfurter\.v1/);
});
test('official NSE/BSE IPO and equity verification links remain available',()=>{
  const service=file('src/services/indiaMarketTools.js');
  const ui=file('src/components/market/MarketWorkspaceTools.jsx');
  assert.match(service,/www\.nseindia\.com\/get-quotes\/equity/);
  assert.match(service,/www\.bseindia\.com\/markets\/PublicIssues/);
  assert.match(ui,/Verify current public issues/);
  assert.match(ui,/BSE public issues/);
  assert.match(ui,/TRACKED_EQUITY_SYMBOLS\.map\(symbol/);
});
