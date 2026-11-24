import { describe, expect, it } from 'vitest';
import { checkPriceSourceRequest, MARKET_PRICE_CAPABILITIES } from './priceSourceQualification.js';
import { mayPerformSourceAction } from '../registry/sourceRegistry.js';

const fund = { instrumentId:'FUND:125497', type:'FUND', currency:'INR', displayName:'Fixture fund' };
const fx = { instrumentId:'FX:OMR/INR', type:'FX', currency:'INR', displayName:'OMR/INR' };
const equity = { instrumentId:'EQUITY:NSE:INFY', type:'EQUITY', currency:'INR', displayName:'Fixture equity' };
const index = { instrumentId:'INDEX:BSE:SENSEX', type:'INDEX', currency:'INR', displayName:'Sensex' };
const nav = { sourceId:'mfapi', action:'BROWSER_FETCH', instrument:fund, kind:'NAV', url:'https://api.mfapi.in/mf/125497/latest' };

describe('MP03 price source preflight', () => {
  it.each([
    nav,
    { sourceId:'frankfurter', action:'BROWSER_FETCH', instrument:fx, kind:'FX_REFERENCE', url:'https://api.frankfurter.dev/v2/rate/OMR/INR' },
    { sourceId:'personal-local', action:'LOCAL_CALCULATE', instrument:equity, kind:'MANUAL_MARK' },
    { sourceId:'tradingview-bse', action:'EMBED', instrument:index, kind:'HOSTED_VIEW', url:'https://s3.tradingview.com/external-embedding/example.js' }
  ])('permits an attempt, not a qualified observation: $sourceId', request => {
    expect(checkPriceSourceRequest(request)).toEqual({ allowed:true, state:'ALLOWED_TO_ATTEMPT', reasonCode:null });
  });
  it.each([
    [{sourceId:'unknown'},'UNKNOWN_SOURCE'],
    [{action:'PUBLIC_SNAPSHOT'},'ACTION_NOT_PERMITTED'],
    [{sourceId:'nse-indices'},'ACTION_NOT_PERMITTED'],
    [{sourceId:'nse-equities'},'ACTION_NOT_PERMITTED'],
    [{sourceId:'tradingview-bse'},'ACTION_NOT_PERMITTED'],
    [{instrument:equity},'CAPABILITY_NOT_APPROVED'],
    [{instrument:fx},'CAPABILITY_NOT_APPROVED'],
    [{kind:'QUOTE'},'CAPABILITY_NOT_APPROVED'],
    [{url:'http://api.mfapi.in/mf/125497/latest'},'SOURCE_URL_NOT_PERMITTED'],
    [{url:'https://api.mfapi.in.evil.example/'},'SOURCE_URL_NOT_PERMITTED'],
    [{url:'https://user:pass@api.mfapi.in/'},'SOURCE_URL_NOT_PERMITTED'],
    [{url:'https://api.mfapi.in:8443/'},'SOURCE_URL_NOT_PERMITTED'],
    [{url:null},'SOURCE_URL_NOT_PERMITTED']
  ])('denies %j', (override,reasonCode) => {
    expect(checkPriceSourceRequest({...nav,...override})).toEqual({allowed:false,state:'SOURCE_RESTRICTED',reasonCode});
  });
  it('does not expand BSE-only embed authority to NSE', () => {
    expect(checkPriceSourceRequest({sourceId:'tradingview-bse',action:'EMBED',kind:'HOSTED_VIEW',
      instrument:{...index,instrumentId:'INDEX:NSE:NIFTY-50'},url:'https://s3.tradingview.com/widget.js'}).reasonCode).toBe('CAPABILITY_NOT_APPROVED');
  });
  it('rejects a network URL for a local mark', () => {
    expect(checkPriceSourceRequest({sourceId:'personal-local',action:'LOCAL_CALCULATE',instrument:equity,kind:'MANUAL_MARK',url:'https://example.com'}).reasonCode).toBe('LOCAL_REQUEST_HAS_NETWORK_URL');
  });
  it('fails safely for missing request and malformed identity', () => {
    expect(checkPriceSourceRequest(null).allowed).toBe(false);
    expect(checkPriceSourceRequest({...nav,instrument:{...fund,instrumentId:'123456'}})).toEqual({allowed:false,state:'UNAVAILABLE',reasonCode:'INVALID_INSTRUMENT'});
  });
  it('all capability rows remain within existing registry actions and never authorize publication', () => {
    for (const row of MARKET_PRICE_CAPABILITIES) {
      expect(mayPerformSourceAction(row.sourceId,row.action)).toBe(true);
      expect(mayPerformSourceAction(row.sourceId,'PUBLIC_SNAPSHOT')).toBe(false);
    }
  });
});
