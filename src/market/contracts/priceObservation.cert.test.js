import { describe, expect, it } from 'vitest';
import { qualifyPriceObservation, validateInstrument, INSTRUMENT_VIEW_STATES } from './priceObservation.js';
import { createSourceReceipt } from './sourceReceipt.js';
import { R21_MARKET_WORKSPACE_IDS } from '../registry/workspaceRegistry.js';
import { MARKET_STORAGE_RULES, MARKET_R21_STORAGE_KEYS } from './storagePolicy.js';
import { MARKET_FREE_OPEN_ONLY } from '../../services/marketFreeOpenPolicy.js';
import { mayPerformSourceAction } from '../registry/sourceRegistry.js';

// Synthetic fixtures only; not real market observations.
const instrument = { instrumentId:'FUND:123456', type:'FUND', currency:'INR', displayName:'Fixture fund' };
const receipt = createSourceReceipt({
  sourceId:'mfapi', publisher:'MFapi', accessMode:'DIRECT_ON_DEMAND',
  rights:'BROWSER_DIRECT_CONDITIONAL', state:'READY', validity:'VALID',
  providerClockGranularity:'day', providerAsOf:'2026-11-19',
  checkedAt:'2026-11-20T08:00:00Z', transportStatus:200,
  originalUrl:'https://api.mfapi.in/mf/123456/latest'
}).receipt;
const observation = {
  instrumentId:instrument.instrumentId, value:123.45, currency:'INR',
  observedAt:'2026-11-19', tradingDate:'2026-11-19', sourceId:'mfapi',
  receiptId:'fixture-receipt', kind:'NAV', validity:'VALID'
};
const receiptRecord = { id:'fixture-receipt', receipt };
const qualify = (overrides = {}, record = receiptRecord, expected = instrument) =>
  qualifyPriceObservation({ instrument:expected, observation:{...observation,...overrides}, receiptRecord:record });

describe('Market vNext foundation', () => {
  it('preserves route IDs, storage policy and free/open mode', () => {
    expect(R21_MARKET_WORKSPACE_IDS).toEqual(['overview','indices','equity','portfolio','funds','ipo-events','currency-macro','lab','health']);
    expect(MARKET_R21_STORAGE_KEYS.portfolio).toBe('nw7.market-portfolio.v1');
    expect(MARKET_STORAGE_RULES.noAutomaticDestructiveMigration).toBe(true);
    expect(MARKET_FREE_OPEN_ONLY).toBe(true);
    expect(mayPerformSourceAction('mfapi','PUBLIC_SNAPSHOT')).toBe(false);
    expect(mayPerformSourceAction('nse-indices','BROWSER_FETCH')).toBe(false);
    expect(INSTRUMENT_VIEW_STATES).toHaveLength(5);
  });
  it('distinguishes index, equity, fund and FX identities', () => {
    for (const [instrumentId,type,currency] of [
      ['INDEX:NSE:NIFTY-50','INDEX','INR'], ['EQUITY:NSE:INFY','EQUITY','INR'],
      ['FUND:001234','FUND','INR'], ['FX:USD/INR','FX','INR']
    ]) expect(validateInstrument({instrumentId,type,currency,displayName:'Fixture'}).ok).toBe(true);
    expect(validateInstrument({instrumentId:'INDEX:NSE:INFY',type:'EQUITY',currency:'INR',displayName:'Fixture'}).ok).toBe(false);
    expect(validateInstrument({instrumentId:'FX:USD/USD',type:'FX',currency:'USD',displayName:'Fixture'}).ok).toBe(false);
    expect(validateInstrument({instrumentId:'EQUITY:nse:infy',type:'EQUITY',currency:'INR',displayName:'Fixture'}).ok).toBe(false);
  });
  it('qualifies an eligible NAV envelope without changing original date or leaking extra fields', () => {
    const result = qualify({privateField:'must not escape'});
    expect(result).toEqual({ok:true,observation,errors:[]});
    expect(Object.isFrozen(result.observation)).toBe(true);
    expect(result.observation.observedAt).not.toBe(receipt.checkedAt);
  });
  it.each([
    [{value:NaN},'INVALID_PRICE'], [{value:Infinity},'INVALID_PRICE'],
    [{value:'123.45'},'INVALID_PRICE'], [{value:0},'INVALID_PRICE'], [{value:-1},'INVALID_PRICE'],
    [{instrumentId:'FUND:654321'},'INSTRUMENT_MISMATCH'], [{currency:'USD'},'CURRENCY_MISMATCH'],
    [{receiptId:'different'},'RECEIPT_MISMATCH'], [{sourceId:'nse-equities'},'RECEIPT_MISMATCH'],
    [{observedAt:'2026-11-20'},'SOURCE_CLOCK_MISMATCH'],
    [{tradingDate:'2026-02-30'},'INVALID_TRADING_DATE'],
    [{tradingDate:'2026-11-20'},'INVALID_TRADING_DATE'],
    [{validity:'UNKNOWN'},'INVALID_OBSERVATION_VALIDITY'], [{kind:'QUOTE'},'SOURCE_CAPABILITY_DENIED']
  ])('rejects invalid observation %j', (overrides, error) => {
    const result = qualify(overrides);
    expect(result.ok).toBe(false);
    expect(result.observation).toBeNull();
    expect(result.errors).toContain(error);
  });
  it('rejects HTTP 200 without qualified source time', () => {
    expect(qualify({}, { ...receiptRecord, receipt:{...receipt,providerAsOf:null} }).ok).toBe(false);
  });
  it('rejects embed or link receipts as native prices', () => {
    for (const [sourceId,publisher,accessMode,rights,originalUrl] of [
      ['tradingview-bse','TradingView','PROVIDER_EMBED','DISPLAY_PROVIDER_ONLY','https://www.tradingview.com/widget/'],
      ['nse-indices','NSE','OFFICIAL_LINK','LINK_ONLY','https://www.nseindia.com/market-data/live-market-indices']
    ]) {
      const result = qualify({sourceId}, {...receiptRecord,receipt:{...receipt,sourceId,publisher,accessMode,rights,originalUrl}});
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('SOURCE_CAPABILITY_DENIED');
    }
  });
  it('rejects a missing receipt and an attempt to use a NAV source for equity', () => {
    expect(qualifyPriceObservation({instrument,observation}).ok).toBe(false);
    const equity = {instrumentId:'EQUITY:NSE:INFY',type:'EQUITY',currency:'INR',displayName:'Fixture equity'};
    expect(qualify({instrumentId:equity.instrumentId,kind:'QUOTE'},receiptRecord,equity).errors).toContain('SOURCE_CAPABILITY_DENIED');
  });
});
