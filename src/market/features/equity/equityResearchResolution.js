import { TRACKED_NSE_METADATA, getNseQuoteUrl } from './equityMetadata.js';
import { validateCustomSymbol } from './equityModel.js';
import { parseInstrumentKey } from '../../contracts/instrumentIdentity.js';
import { mayPerformSourceAction } from '../../registry/sourceRegistry.js';

/** Resolve a user-entered NSE ticker without asserting that it is listed. */
export function resolveNseResearchKey(input) {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (raw.includes(':')) {
    const parsed = parseInstrumentKey(raw);
    return parsed?.exchange === 'NSE' ? parsed.key : null;
  }
  const symbol = validateCustomSymbol(raw);
  return symbol ? 'NSE:' + symbol : null;
}

/** Local metadata search only; not an exchange-wide listing lookup. */
export function searchTrackedEquities(query = '') {
  if (typeof query !== 'string') return [];
  const raw = query.trim().toUpperCase();
  const key = raw.includes(':') ? resolveNseResearchKey(raw) : null;
  if (raw.includes(':') && !key) return [];
  const term = key ? key.slice(4) : raw.replace(/\.NS$/, '');
  return Object.values(TRACKED_NSE_METADATA)
    .filter(item => key ? item.symbol === term : item.symbol.includes(term) || item.name.toUpperCase().includes(term))
    .map(item => Object.freeze({
      key:'NSE:' + item.symbol, instrumentId:'EQUITY:NSE:' + item.symbol,
      symbol:item.symbol, displayName:item.name, sector:item.sector, exchange:'NSE'
    }));
}

/** Current policy permits link-only NSE research; no quote or local mark is promoted. */
export function selectEquityResearch(key) {
  const canonical = resolveNseResearchKey(key);
  if (!canonical) return null;
  const symbol = canonical.slice(4);
  const meta = Object.hasOwn(TRACKED_NSE_METADATA,symbol) ? TRACKED_NSE_METADATA[symbol] : null;
  const linkAllowed = mayPerformSourceAction('nse-equities','LINK');
  return Object.freeze({
    key:canonical, instrumentId:'EQUITY:' + canonical, symbol, exchange:'NSE',
    displayName:meta?.name ?? null, listingStatus:meta ? 'CURATED_METADATA' : 'UNVERIFIED_LISTING',
    state:'SOURCE_RESTRICTED', reasonCode:'NO_APPROVED_NATIVE_EQUITY_ROUTE',
    observation:null, referenceUrl:linkAllowed ? getNseQuoteUrl(symbol) : null
  });
}
