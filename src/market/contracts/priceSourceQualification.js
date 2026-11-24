import { validateInstrument } from './priceObservation.js';
import { getMarketSource, mayPerformSourceAction, isAllowedMarketSourceUrl } from '../registry/sourceRegistry.js';

/**
 * MP03: preflight for vNext price-related requests only.
 * The registry remains authoritative; this narrower capability matrix cannot
 * grant permissions, certify external licensing or prove a provider response.
 * Link-only recovery and non-price datasets continue using existing services.
 */
const CAPABILITIES = Object.freeze([
  Object.freeze({ sourceId:'mfapi', action:'BROWSER_FETCH', type:'FUND', kind:'NAV' }),
  Object.freeze({ sourceId:'frankfurter', action:'BROWSER_FETCH', type:'FX', kind:'FX_REFERENCE' }),
  Object.freeze({ sourceId:'personal-local', action:'LOCAL_CALCULATE', type:'EQUITY', kind:'MANUAL_MARK' }),
  Object.freeze({ sourceId:'tradingview-bse', action:'EMBED', type:'INDEX', kind:'HOSTED_VIEW', exchange:'BSE' }),
]);

export const MARKET_PRICE_CAPABILITIES = CAPABILITIES;

/** Pure pre-network decision. ALLOWED_TO_ATTEMPT is not a qualified price. */
export function checkPriceSourceRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { allowed:false, state:'UNAVAILABLE', reasonCode:'INVALID_REQUEST' };
  }
  const { sourceId, action, instrument, kind, url } = request;
  const denied = reasonCode => ({ allowed:false, state:'SOURCE_RESTRICTED', reasonCode });
  if (!getMarketSource(sourceId)) return denied('UNKNOWN_SOURCE');
  if (!mayPerformSourceAction(sourceId, action)) return denied('ACTION_NOT_PERMITTED');
  if (!validateInstrument(instrument).ok) {
    return { allowed:false, state:'UNAVAILABLE', reasonCode:'INVALID_INSTRUMENT' };
  }
  const capability = CAPABILITIES.find(item => item.sourceId === sourceId &&
    item.action === action && item.type === instrument.type && item.kind === kind &&
    (!item.exchange || instrument.instrumentId.startsWith(instrument.type + ':' + item.exchange + ':')));
  if (!capability) return denied('CAPABILITY_NOT_APPROVED');
  if (action === 'LOCAL_CALCULATE') {
    if (url != null) return denied('LOCAL_REQUEST_HAS_NETWORK_URL');
  } else if (!isAllowedMarketSourceUrl(sourceId, url)) {
    return denied('SOURCE_URL_NOT_PERMITTED');
  }
  return { allowed:true, state:'ALLOWED_TO_ATTEMPT', reasonCode:null };
}
