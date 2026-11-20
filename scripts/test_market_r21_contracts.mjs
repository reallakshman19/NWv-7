import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MARKET_CONTRACT_VERSION,SOURCE_STATES,SOURCE_RIGHTS,createSourceReceipt,
  validateSourceReceipt,qualifiedSourceResult,isSourceClock,
  canonicalInstrumentKey,parseInstrumentKey,canonicalNseLegacySymbol,
  canonicalFundCode,planLegacyNseWatchlist,planLegacySavedFunds,
  MARKET_LEGACY_STORAGE_KEYS,MARKET_R21_STORAGE_KEYS,MARKET_STORAGE_RULES,
  R21_MARKET_WORKSPACE_IDS,R21_MARKET_WORKSPACES,R21_DEFAULT_WORKSPACE,
  normalizeR21MarketView,getR21MarketViewFromHash,withR21MarketViewHash,
  MARKET_SOURCES,getMarketSource,mayPerformSourceAction
} from '../src/market/contracts/index.js';
import {MARKET_WORKSPACE_IDS,getMarketWorkspaceFromHash} from '../src/services/marketWorkspaceRoute.js';
import {MARKET_FREE_OPEN_ONLY} from '../src/services/marketFreeOpenPolicy.js';

const base = Object.freeze({
  sourceId:'mfapi', accessMode:'DIRECT_ON_DEMAND',rights:'BROWSER_DIRECT_CONDITIONAL',
  publisher:'MFapi',state:'READY',validity:'VALID',providerClockGranularity:'day',
  providerAsOf:'2026-11-19',requestedAt:'2026-11-20T08:00:00Z',
  checkedAt:'2026-11-20T08:00:01Z',transportStatus:200,
  originalUrl:'https://api.mfapi.in/mf/123456/latest',reasonCode:null,dataVersion:'v1'
});
const valid = override => ({...base,...override});

test('WP00-001 single version and nine unique workspaces; default contract is overview',()=>{
  assert.equal(MARKET_CONTRACT_VERSION,'market-r21-contract-v1');
  assert.equal(R21_DEFAULT_WORKSPACE,'overview');
  assert.deepEqual(R21_MARKET_WORKSPACE_IDS,
    ['overview','indices','equity','portfolio','funds','ipo-events','currency-macro','lab','health']);
  assert.equal(new Set(R21_MARKET_WORKSPACE_IDS).size,9);
  assert.equal(R21_MARKET_WORKSPACES.filter(item=>item.mobileGroup==='primary').length,4);
});
test('WP00-002 legacy /markets and /market hash routes and unrelated query retained',()=>{
  assert.equal(getR21MarketViewFromHash('#/markets'),'overview');
  assert.equal(getR21MarketViewFromHash('#/market?view=currency'),'currency-macro');
  assert.equal(getR21MarketViewFromHash('#/markets?view=equity'),'equity');
  assert.equal(getR21MarketViewFromHash('#/markets?view=unknown'),'overview');
  assert.equal(normalizeR21MarketView('currency'),'currency-macro');
  assert.equal(withR21MarketViewHash('#/markets?region=IN&view=indices','portfolio'),
    '#/markets?region=IN&view=portfolio');
  assert.equal(withR21MarketViewHash('#/market?region=IN','lab'),'#/market?region=IN&view=lab');
  assert.equal(getR21MarketViewFromHash(withR21MarketViewHash('#/markets','health')),'health');
});
test('WP00-003 existing page route not activated prematurely (no blank Overview)',()=>{
  assert.deepEqual(MARKET_WORKSPACE_IDS,['indices','equity','funds','currency']);
  assert.equal(getMarketWorkspaceFromHash('#/markets'),'indices');
});
test('WP00-004 no bridge changes public market quote rights',()=>{
  assert.equal(MARKET_FREE_OPEN_ONLY,true);
  assert.equal(mayPerformSourceAction('nse-equities','PUBLIC_SNAPSHOT'),false);
  assert.equal(mayPerformSourceAction('mfapi','PUBLIC_SNAPSHOT'),false);
  assert.equal(mayPerformSourceAction('world-bank','PUBLIC_SNAPSHOT'),false);
  assert.equal(mayPerformSourceAction('tradingview-bse','PUBLIC_SNAPSHOT'),false);
});
test('WP00-005 every source has explicit rights and action registry',()=>{
  assert.ok(Object.keys(MARKET_SOURCES).length>=10);
  for(const [key,value] of Object.entries(MARKET_SOURCES)){
    assert.equal(value.id,key);
    assert.equal(typeof value.publisher,'string');
    assert.ok(SOURCE_RIGHTS.includes(value.rights));
    assert.equal(value.actions.includes('PUBLIC_SNAPSHOT'),false);
    assert.equal(mayPerformSourceAction(key,'PUBLIC_SNAPSHOT'),false);
  }
  assert.equal(getMarketSource('nonexistent'),null);
  assert.equal(mayPerformSourceAction('nonexistent','LINK'),false);
  assert.equal(mayPerformSourceAction('mfapi','EMBED'),false);
  assert.equal(mayPerformSourceAction('tradingview-bse','EMBED'),true);
  assert.equal(mayPerformSourceAction('mfapi','BROWSER_FETCH'),true);
});
test('WP00-006 strict independent time clocks; no synthetic providerAsOf',()=>{
  const outcome=createSourceReceipt(valid());
  assert.equal(outcome.ok,true,JSON.stringify(outcome.errors));
  assert.equal(outcome.receipt.providerAsOf,'2026-11-19');
  assert.equal(outcome.receipt.checkedAt,'2026-11-20T08:00:01Z');
  assert.equal(Object.isFrozen(outcome.receipt),true);
  assert.equal(outcome.receipt.requestedAt===outcome.receipt.providerAsOf,false);
});
test('WP00-007 no READY if provider clock absent even with HTTP 200',()=>{
  const r=createSourceReceipt(valid({providerAsOf:null}));
  assert.equal(r.ok,false);
  assert.ok(r.errors.includes('UNQUALIFIED_OBSERVATION'));
  assert.equal(r.receipt,null);
});
test('WP00-008 HTTP 200 but malformed observation rejected',()=>{
  for(const override of [
    {validity:'UNKNOWN'}, {providerAsOf:'2026-02-30'},
    {providerAsOf:'2026-11-21',providerClockGranularity:'instant'},
    {providerAsOf:'2026-13-01'}, {providerAsOf:'garbage'}
  ]) assert.equal(createSourceReceipt(valid(override)).ok,false,JSON.stringify(override));
});
test('WP00-009 no cross-origin widget as native READY source',()=>{
  const widget=valid({sourceId:'tradingview-bse',publisher:'TradingView',accessMode:'PROVIDER_EMBED',
    rights:'DISPLAY_PROVIDER_ONLY',providerClockGranularity:'instant',
    providerAsOf:'2026-11-20T08:00:00Z'});
  const result=createSourceReceipt(widget);
  assert.equal(result.ok,false);
  assert.ok(result.errors.includes('NOT_NATIVE_OBSERVATION'));
});
test('WP00-010 original date-only and timestamp validation',()=>{
  for(const value of ['2026-01-01','2024-02-29']) assert.equal(isSourceClock(value,'day'),true);
  for(const value of ['2026-02-29','2026-02-30','2026-11-31']) assert.equal(isSourceClock(value,'day'),false);
  assert.equal(isSourceClock('2026-11-20T08:00:00Z'),true);
  assert.equal(isSourceClock('2026-11-20T08:00:00+04:00'),true);
  assert.equal(isSourceClock('2026-11-20T08:00:00'),false);
  assert.equal(isSourceClock('2026-11-20T08:00:00+15:00'),false);
  assert.equal(isSourceClock('2026-02-30T08:00:00Z'),false);
});
test('WP00-011 verified empty requires proven source check',()=>{
  assert.equal(createSourceReceipt(valid({state:'NO_RESULTS',providerAsOf:null,validity:'VALID',
    checkedAt:'2026-11-20T09:00:00Z',transportStatus:200})).ok,true);
  assert.equal(createSourceReceipt(valid({state:'NO_RESULTS',providerAsOf:null,checkedAt:null})).ok,false);
  assert.equal(createSourceReceipt(valid({state:'NO_RESULTS',providerAsOf:null,transportStatus:403})).ok,false);
});
test('WP00-012 NO_RIGHTS must match rights policy',()=>{
  assert.equal(createSourceReceipt(valid({state:'NO_RIGHTS',rights:'NO_PUBLICATION',providerAsOf:null,
    validity:'UNKNOWN'})).ok,true);
  assert.equal(createSourceReceipt(valid({state:'NO_RIGHTS',providerAsOf:null,validity:'UNKNOWN'})).ok,false);
});
test('WP00-013 valid qualified native result preserved, bad data blocked',()=>{
  const outcome=createSourceReceipt(valid());
  assert.equal(qualifiedSourceResult({nav:123.45},outcome.receipt).ok,true);
  assert.equal(qualifiedSourceResult(null,outcome.receipt).ok,false);
  assert.equal(qualifiedSourceResult({nav:123.45},valid({providerAsOf:null})).ok,false);
  const link=createSourceReceipt(valid({sourceId:'nse-indices',publisher:'NSE',state:'NOT_REQUESTED',
    validity:'UNKNOWN',accessMode:'OFFICIAL_LINK',rights:'LINK_ONLY',providerAsOf:null}));
  assert.equal(link.ok,true);
  assert.equal(qualifiedSourceResult({quote:1},link.receipt).ok,false);
});
test('WP00-014 strict exchange qualified identity',()=>{
  assert.equal(canonicalInstrumentKey('nse',' infy '),'NSE:INFY');
  assert.equal(canonicalInstrumentKey('bse','INFY'),'BSE:INFY');
  assert.notEqual(canonicalInstrumentKey('nse','INFY'),canonicalInstrumentKey('bse','INFY'));
  assert.deepEqual(parseInstrumentKey('NSE:INFY'),{key:'NSE:INFY',exchange:'NSE',symbol:'INFY'});
  for(const candidate of ['INFY','NYSE:INFY','BSE:','NSE:<img>','NSE:INFY:FAKE',null]) {
    assert.equal(parseInstrumentKey(candidate),null);
  }
});
test('WP00-015 legacy NSE watchlist non-destructive migration plan',()=>{
  const original=['INFY','RELIANCE.NS','infy','BSE:INFY','invalid<script>'];
  const copy=JSON.stringify(original);
  const plan=planLegacyNseWatchlist(original);
  assert.deepEqual(plan.keys,['NSE:INFY','NSE:RELIANCE']);
  assert.equal(plan.rejected.length,2);
  assert.equal(JSON.stringify(original),copy);
  assert.equal(canonicalNseLegacySymbol('BSE:INFY'),null);
});
test('WP00-016 limits and saved fund identity',()=>{
  assert.equal(canonicalFundCode('123456'),'123456');
  assert.equal(canonicalFundCode('001234'),'001234');
  assert.equal(canonicalFundCode('1e6'),null);
  assert.equal(canonicalFundCode(12),null);
  const saved=planLegacySavedFunds(['123456','123456','000123','bad']);
  assert.deepEqual(saved.codes,['123456','000123']);
  assert.equal(saved.rejected.length,1);
  const capped=planLegacyNseWatchlist(Array.from({length:20},(_,i)=>'SYM'+i));
  assert.equal(capped.keys.length,12);
  assert.equal(capped.rejected.length,8);
});
test('WP00-017 protect historical storage keys and no writes',()=>{
  assert.equal(MARKET_LEGACY_STORAGE_KEYS.watchlist,'nw7.india-watchlist.v1');
  assert.equal(MARKET_LEGACY_STORAGE_KEYS.funds,'nw7.market-saved-funds.v1');
  assert.equal(MARKET_R21_STORAGE_KEYS.portfolio,'nw7.market-portfolio.v1');
  assert.equal(MARKET_STORAGE_RULES.noPublicQuoteCache,true);
  assert.equal(MARKET_STORAGE_RULES.noAutomaticDestructiveMigration,true);
});
test('WP00-018 reject bad URL and invented publisher',()=>{
  assert.equal(createSourceReceipt(valid({originalUrl:'javascript:alert(1)'})).ok,false);
  assert.equal(createSourceReceipt(valid({originalUrl:'http://insecure.example/'})).ok,false);
  assert.equal(createSourceReceipt(valid({publisher:''})).ok,false);
});
test('WP00-019 cannot spoof source rights or publisher metadata',()=>{
  const nse=valid({sourceId:'nse-equities',publisher:'NSE',rights:'BROWSER_DIRECT_CONDITIONAL'});
  assert.ok(createSourceReceipt(nse).errors.includes('SOURCE_ACCESS_MISMATCH'));
  assert.ok(createSourceReceipt(nse).errors.includes('SOURCE_RIGHTS_MISMATCH'));
  assert.ok(createSourceReceipt(valid({publisher:'Yahoo Finance'})).errors.includes('SOURCE_PUBLISHER_MISMATCH'));
  assert.ok(createSourceReceipt(valid({sourceId:'unknown-source'})).errors.includes('UNREGISTERED_SOURCE'));
});
test('WP00-020 cannot claim zero IPOs from an official link being reachable',()=>{
  const fake=valid({sourceId:'nse-ipo',publisher:'NSE',accessMode:'OFFICIAL_LINK',rights:'LINK_ONLY',
    state:'NO_RESULTS',providerAsOf:null,validity:'VALID',transportStatus:200});
  assert.ok(createSourceReceipt(fake).errors.includes('NO_RESULTS_REQUIRES_DIRECT_SOURCE'));
});
test('WP00-021 no data fixtures or automatic on-mount source access',()=>{
  assert.equal(SOURCE_STATES.includes('READY'),true);
  assert.equal(MARKET_SOURCES['tradingview-bse'].actions.includes('BROWSER_FETCH'),false);
  assert.equal(MARKET_SOURCES['personal-local'].actions.includes('BROWSER_FETCH'),false);
});
