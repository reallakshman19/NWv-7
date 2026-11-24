import { canonicalFundCode, parseInstrumentKey } from './instrumentIdentity.js';
import { isSourceClock, qualifiedSourceResult } from './sourceReceipt.js';
import { mayPerformSourceAction } from '../registry/sourceRegistry.js';

/** vNext additive contracts. No acquisition, persistence or publication. */
export const INSTRUMENT_VIEW_STATES = Object.freeze([
  'QUALIFIED_NATIVE', 'PROVIDER_HOSTED', 'LAST_CLOSE', 'UNAVAILABLE', 'SOURCE_RESTRICTED'
]);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim().length > 0;
const isCurrency = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
const typedId = instrument => {
  const { instrumentId: id, type, currency } = instrument;
  if (typeof id !== 'string') return false;
  if (type === 'EQUITY' || type === 'INDEX') {
    const prefix = type + ':';
    if (!id.startsWith(prefix)) return false;
    const key = id.slice(prefix.length);
    return parseInstrumentKey(key)?.key === key;
  }
  if (type === 'FUND') {
    const code = id.slice(5);
    return id.startsWith('FUND:') && canonicalFundCode(code) === code;
  }
  if (type === 'FX') {
    const match = /^FX:([A-Z]{3})\/([A-Z]{3})$/.exec(id);
    return Boolean(match && match[1] !== match[2] && match[2] === currency);
  }
  return false;
};

export function validateInstrument(instrument) {
  if (!isRecord(instrument)) return { ok:false, errors:['INVALID_INSTRUMENT'] };
  const errors = [];
  if (!typedId(instrument)) errors.push('INVALID_INSTRUMENT_ID');
  if (!isCurrency(instrument.currency)) errors.push('INVALID_CURRENCY');
  if (!isText(instrument.displayName)) errors.push('MISSING_DISPLAY_NAME');
  return { ok:errors.length === 0, errors };
}

/** Only explicitly supported source/type/kind combinations qualify today.
 * Any future exchange quote route needs its own policy and adapter evidence.
 * A user-local manual mark is never represented as an exchange quote.
 */
const sourceSupports = (sourceId, type, kind) => {
  if (sourceId === 'mfapi') return type === 'FUND' && kind === 'NAV';
  if (sourceId === 'frankfurter') return type === 'FX' && kind === 'FX_REFERENCE';
  if (sourceId === 'personal-local') return type === 'EQUITY' && kind === 'MANUAL_MARK';
  return false;
};

// Host approval alone cannot bind a receipt for one scheme/pair to another.
const receiptMatchesInstrument = (receipt, instrument) => {
  if (receipt.sourceId === 'personal-local') return true;
  try {
    const path = new URL(receipt.originalUrl).pathname;
    if (receipt.sourceId === 'mfapi') {
      const schemePath = '/mf/' + instrument.instrumentId.slice(5);
      return instrument.currency === 'INR' && (path === schemePath || path === schemePath + '/latest');
    }
    if (receipt.sourceId === 'frankfurter') {
      return path === '/v2/rate/' + instrument.instrumentId.slice(3).toLowerCase();
    }
  } catch { /* Invalid receipts fail closed. */ }
  return false;
};

/** receiptRecord must come from a trusted acquisition/repository boundary.
 * This checks the envelope, not the authenticity of an external response,
 * freshness, holiday calendars or provider-specific payload parsing.
 * observedAt is the original provider clock (day or instant), never refresh time.
 */
export function qualifyPriceObservation({ instrument, observation, receiptRecord } = {}) {
  const errors = [...validateInstrument(instrument).errors];
  if (!isRecord(observation) || !isRecord(receiptRecord) || !isRecord(receiptRecord.receipt)) {
    return { ok:false, observation:null, errors:[...errors, 'MISSING_OBSERVATION_OR_RECEIPT'] };
  }
  const receipt = receiptRecord.receipt;
  const check = qualifiedSourceResult(observation, receipt);
  errors.push(...check.errors);
  if (observation.instrumentId !== instrument?.instrumentId) errors.push('INSTRUMENT_MISMATCH');
  if (observation.currency !== instrument?.currency) errors.push('CURRENCY_MISMATCH');
  if (!Number.isFinite(observation.value) || observation.value <= 0) errors.push('INVALID_PRICE');
  if (observation.validity !== 'VALID') errors.push('INVALID_OBSERVATION_VALIDITY');
  if (!isText(receiptRecord.id) || observation.receiptId !== receiptRecord.id ||
      observation.sourceId !== receipt.sourceId) errors.push('RECEIPT_MISMATCH');
  if (!receiptMatchesInstrument(receipt, instrument)) errors.push('RECEIPT_INSTRUMENT_MISMATCH');
  const granularity = receipt.providerClockGranularity || 'instant';
  if (!['day','instant'].includes(granularity) ||
      !isSourceClock(observation.observedAt, granularity) ||
      observation.observedAt !== receipt.providerAsOf) errors.push('SOURCE_CLOCK_MISMATCH');
  if (!isSourceClock(observation.tradingDate, 'day') ||
      (granularity === 'day' && observation.tradingDate !== observation.observedAt)) errors.push('INVALID_TRADING_DATE');
  const action = receipt.sourceId === 'personal-local' ? 'LOCAL_CALCULATE' : 'BROWSER_FETCH';
  if (!mayPerformSourceAction(receipt.sourceId, action) ||
      !sourceSupports(receipt.sourceId, instrument?.type, observation.kind)) errors.push('SOURCE_CAPABILITY_DENIED');
  if (errors.length) return { ok:false, observation:null, errors:[...new Set(errors)] };
  // Explicit field projection avoids carrying arbitrary provider payloads.
  const { instrumentId, value, currency, observedAt, tradingDate, sourceId, receiptId, kind, validity } = observation;
  return { ok:true, observation:Object.freeze({
    instrumentId, value, currency, observedAt, tradingDate, sourceId, receiptId, kind, validity
  }), errors:[] };
}
