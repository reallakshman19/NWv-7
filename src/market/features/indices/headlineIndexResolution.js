import { checkPriceSourceRequest } from '../../contracts/priceSourceQualification.js';
import { BSE_CATALOG } from '../providers/bseCoverage.js';
import { OPEN_SOURCE_REFERENCE_LINKS } from '../../../services/marketFreeOpenPolicy.js';

export const HEADLINE_INDEX_WIDGET_URL = 'https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js';

const index = (instrumentId, displayName, exchange, providerSymbol, referenceUrl) =>
  Object.freeze({ instrumentId, type:'INDEX', currency:'INR', displayName, exchange, providerSymbol, referenceUrl });

// Canonical IDs deliberately align with existing marketQuotePolicy identities;
// provider aliases are separate from the canonical index identity.
export const HEADLINE_INDICES = Object.freeze([
  index('INDEX:NSE:NIFTY50','NIFTY 50','NSE',null,OPEN_SOURCE_REFERENCE_LINKS.nseIndices),
  index('INDEX:BSE:SENSEX','SENSEX','BSE','BSE:SENSEX',OPEN_SOURCE_REFERENCE_LINKS.bseIndices),
  index('INDEX:NSE:BANKNIFTY','NIFTY BANK','NSE',null,OPEN_SOURCE_REFERENCE_LINKS.nseIndices),
  index('INDEX:BSE:BSE500','BSE 500','BSE','BSE:BSE500',OPEN_SOURCE_REFERENCE_LINKS.bseIndices)
]);

const byId = new Map(HEADLINE_INDICES.map(item => [item.instrumentId,item]));
const bySymbol = new Map(HEADLINE_INDICES.filter(item => item.providerSymbol).map(item => [item.providerSymbol,item]));

/** A curated BSE symbol is eligible for an attempt, not proof of displayed quotes. */
export function canAttemptHeadlineEmbed(providerSymbol) {
  const instrument = bySymbol.get(providerSymbol);
  if (!instrument) return false;
  const entry = BSE_CATALOG[providerSymbol];
  if (entry?.group !== 'indices' || entry.widgetVerified !== true) return false;
  return checkPriceSourceRequest({
    sourceId:'tradingview-bse', action:'EMBED', kind:'HOSTED_VIEW',
    instrument, url:HEADLINE_INDEX_WIDGET_URL
  }).allowed;
}

const lifecycleReasons = Object.freeze({
  IDLE:'CONSENT_REQUIRED',
  LOADING_SCRIPT:'PROVIDER_CONNECTING',
  EMBED_UNCONFIRMED:'QUOTE_RENDERING_UNVERIFIED',
  SCRIPT_ERROR:'PROVIDER_BLOCKED_OR_FAILED',
  TIMEOUT:'PROVIDER_TIMEOUT'
});

/**
 * Under the current registry no native index observation or retained close is
 * authorized. Never infer a price, quote timestamp or successful rendering
 * from the catalog, iframe event, local cache or supplied numeric data.
 * A later qualified source/independent visual-proof contract can extend this.
 */
export function resolveHeadlineIndex(instrumentId, lifecycle = 'IDLE') {
  const instrument = byId.get(instrumentId);
  if (!instrument) return null;
  const hostedAttemptAllowed = canAttemptHeadlineEmbed(instrument.providerSymbol);
  const reasonCode = hostedAttemptAllowed
    ? (Object.hasOwn(lifecycleReasons,lifecycle) ? lifecycleReasons[lifecycle] : 'QUOTE_RENDERING_UNVERIFIED')
    : 'NO_APPROVED_INDEX_PRICE_ROUTE';
  return Object.freeze({
    instrumentId:instrument.instrumentId,
    displayName:instrument.displayName,
    exchange:instrument.exchange,
    state:hostedAttemptAllowed ? 'UNAVAILABLE' : 'SOURCE_RESTRICTED',
    reasonCode, hostedAttemptAllowed,
    providerSymbol:hostedAttemptAllowed ? instrument.providerSymbol : null,
    referenceUrl:instrument.referenceUrl,
    observation:null
  });
}

/** Independent per-instrument states; one failed embed cannot change a sibling. */
export function selectHeadlineIndexBoard(lifecycleById = {}) {
  return HEADLINE_INDICES.map(item => resolveHeadlineIndex(
    item.instrumentId,
    lifecycleById && Object.hasOwn(lifecycleById,item.instrumentId) ? lifecycleById[item.instrumentId] : 'IDLE'
  ));
}
