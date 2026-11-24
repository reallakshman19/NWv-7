import { describe, expect, it } from 'vitest';
import { HEADLINE_INDICES, canAttemptHeadlineEmbed, resolveHeadlineIndex, selectHeadlineIndexBoard } from './headlineIndexResolution.js';
import { canonicalIndexId } from '../../../services/marketQuotePolicy.js';
import { getWidgetSymbols } from '../providers/bseCoverage.js';
import { MARKET_FREE_OPEN_ONLY } from '../../../services/marketFreeOpenPolicy.js';

describe('MP04 headline index resolution', () => {
  it('defines four distinct identities in market board order', () => {
    expect(HEADLINE_INDICES.map(item => item.displayName)).toEqual(['NIFTY 50','SENSEX','NIFTY BANK','BSE 500']);
    expect(new Set(HEADLINE_INDICES.map(item => item.instrumentId)).size).toBe(4);
    for (const [position,symbol] of [[0,'^NSEI'],[1,'^BSESN'],[2,'^NSEBANK']]) {
      expect(HEADLINE_INDICES[position].instrumentId).toBe(canonicalIndexId({symbol}).replace(/^index:/,'INDEX:'));
    }
    expect(HEADLINE_INDICES[3].instrumentId).toBe('INDEX:BSE:BSE500');
  });
  it('allows only the curated existing BSE index embed symbols', () => {
    expect(getWidgetSymbols('indices').symbols.map(item => item.name).filter(canAttemptHeadlineEmbed)).toEqual(['BSE:SENSEX','BSE:BSE500']);
    for (const symbol of ['NSE:NIFTY','NSE:BANKNIFTY','BSE:BSE100','BSE:INFY','SENSEX',null]) {
      expect(canAttemptHeadlineEmbed(symbol)).toBe(false);
    }
  });
  it('initially requires explicit consent for BSE and denies NSE price routes', () => {
    expect(MARKET_FREE_OPEN_ONLY).toBe(true);
    const rows = selectHeadlineIndexBoard();
    expect(rows.map(item => item.state)).toEqual(['SOURCE_RESTRICTED','UNAVAILABLE','SOURCE_RESTRICTED','UNAVAILABLE']);
    expect(rows.map(item => item.reasonCode)).toEqual(['NO_APPROVED_INDEX_PRICE_ROUTE','CONSENT_REQUIRED','NO_APPROVED_INDEX_PRICE_ROUTE','CONSENT_REQUIRED']);
    expect(rows.every(item => item.observation === null)).toBe(true);
  });
  it.each([
    ['LOADING_SCRIPT','PROVIDER_CONNECTING'],
    ['EMBED_UNCONFIRMED','QUOTE_RENDERING_UNVERIFIED'],
    ['SCRIPT_ERROR','PROVIDER_BLOCKED_OR_FAILED'],
    ['TIMEOUT','PROVIDER_TIMEOUT'],
    ['READY','QUOTE_RENDERING_UNVERIFIED'],
    ['PROVIDER_HOSTED','QUOTE_RENDERING_UNVERIFIED']
  ])('never treats %s as visual or native proof', (lifecycle,reasonCode) => {
    const row = resolveHeadlineIndex('INDEX:BSE:SENSEX',lifecycle);
    expect(row).toMatchObject({state:'UNAVAILABLE',reasonCode,observation:null,hostedAttemptAllowed:true});
  });
  it('isolates a timeout from other indices', () => {
    const rows = selectHeadlineIndexBoard({'INDEX:BSE:SENSEX':'TIMEOUT','INDEX:BSE:BSE500':'LOADING_SCRIPT'});
    expect(rows.map(item => item.reasonCode)).toEqual(['NO_APPROVED_INDEX_PRICE_ROUTE','PROVIDER_TIMEOUT','NO_APPROVED_INDEX_PRICE_ROUTE','PROVIDER_CONNECTING']);
  });
  it('rejects unknown or equity identities and keeps NSE blocked even with a loaded frame', () => {
    expect(resolveHeadlineIndex('EQUITY:BSE:SENSEX')).toBeNull();
    expect(resolveHeadlineIndex('INDEX:NSE:UNKNOWN')).toBeNull();
    expect(resolveHeadlineIndex('INDEX:NSE:NIFTY50','EMBED_UNCONFIRMED').state).toBe('SOURCE_RESTRICTED');
  });
  it('cannot turn a synthetic value or stale close into an observation', () => {
    const row = resolveHeadlineIndex('INDEX:BSE:BSE500',{value:100,quoteAt:'2026-11-24T10:00:00Z',state:'READY'});
    expect(row.observation).toBeNull();
    expect(row.state).toBe('UNAVAILABLE');
    expect(Object.isFrozen(row)).toBe(true);
  });
});
