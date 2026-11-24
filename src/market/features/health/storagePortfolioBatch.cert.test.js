import { describe, expect, it } from 'vitest';
import { executeWatchlistMigration } from './storageManager.js';
import { createWatchlistStore } from '../equity/watchlistStore.js';
import { MARKET_LEGACY_STORAGE_KEYS, MARKET_R21_STORAGE_KEYS } from '../../contracts/storagePolicy.js';
import { replayPortfolio } from '../portfolio/portfolioAccounting.js';
import { buildPortfolioCashFlows } from '../portfolio/portfolioCashFlows.js';

const legacy=MARKET_LEGACY_STORAGE_KEYS.watchlist, v2=MARKET_R21_STORAGE_KEYS.watchlistV2;
function memory(initial) {
  const map=new Map(Object.entries(initial));
  return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
}
const buy=(id,instrumentKey,price=100)=>({id,instrumentKey,type:'BUY',date:'2026-01-01',quantity:10,price,fee:0});
describe('MP07 existing storage protection',()=>{
  it('never migrates over existing edited V2 bytes',()=>{
    const original=JSON.stringify({schemaVersion:2,keys:['NSE:TCS'],revision:3});
    const storage=memory({[legacy]:'["INFY"]',[v2]:original});
    expect(executeWatchlistMigration(storage).error).toBe('V2_ALREADY_EXISTS');
    expect(storage.getItem(v2)).toBe(original);
    expect(storage.getItem(legacy)).toBe('["INFY"]');
  });
  it('reads historical migration arrays without rewriting',()=>{
    const storage=memory({[legacy]:'["INFY"]'});
    expect(executeWatchlistMigration(storage).ok).toBe(true);
    const original=storage.getItem(v2);
    expect(createWatchlistStore({storage}).getState().keys).toEqual(['NSE:INFY']);
    expect(storage.getItem(v2)).toBe(original);
  });
  it('preserves malformed V2 bytes even during a new session edit',()=>{
    const storage=memory({[v2]:'broken'});
    const store=createWatchlistStore({storage});
    store.addKey('NSE:INFY');
    expect(store.getState().isPersistent).toBe(false);
    expect(storage.getItem(v2)).toBe('broken');
  });
});
describe('MP08 existing portfolio accounting and terminal date',()=>{
  it('retains moving weighted average cost and realized profit',()=>{
    const tx=[buy('a','NSE:INFY',50),{...buy('b','NSE:INFY',70),date:'2026-02-01'},
      {...buy('c','NSE:INFY',80),type:'SELL',quantity:5,date:'2026-03-01'}];
    const result=replayPortfolio(tx,{'NSE:INFY':{price:75,asOfDate:'2026-06-01'}});
    expect(result.positions[0]).toMatchObject({currentQty:15,averageCost:60,remainingCostBasis:900,realizedPnL:100});
    expect(result.totalCurrentValue).toBe(1125);
    expect(result.totalUnrealizedPnL).toBe(225);
  });
  it('does not expose complete valuation with a missing mark',()=>{
    const result=replayPortfolio([buy('a','NSE:INFY'),buy('b','NSE:TCS')],{'NSE:INFY':{price:110,asOfDate:'2026-06-01'}});
    expect(result).toMatchObject({valuationStatus:'PARTIAL',totalCurrentValue:null,totalUnrealizedPnL:null});
  });
  it('rejects mixed-date terminal valuation for XIRR',()=>{
    const tx=[buy('a','NSE:INFY'),buy('b','NSE:TCS')];
    const marks={'NSE:INFY':{price:110,asOfDate:'2026-06-01'},'NSE:TCS':{price:120,asOfDate:'2026-06-02'}};
    expect(buildPortfolioCashFlows(tx,marks).errorCode).toBe('INCONSISTENT_DATES');
    marks['NSE:TCS'].asOfDate='2026-06-01';
    expect(buildPortfolioCashFlows(tx,marks)).toMatchObject({ok:true,terminalDate:'2026-06-01',cashFlows:[{date:'2026-01-01',amount:-2000},{date:'2026-06-01',amount:2300}]});
  });
});
