import { getMarketSource, isAllowedMarketSourceUrl } from '../registry/sourceRegistry.js';

/**
 * Market R2.1 / WP-00: deterministic, fail-closed receipt contract.
 * Source clocks are NEVER populated from request or validation clocks.
 * A transport success alone does not mean a valid, fresh observation.
 */
export const MARKET_CONTRACT_VERSION = 'market-r21-contract-v1';
export const SOURCE_STATES = Object.freeze([
  'NOT_REQUESTED','LOADING','READY','HISTORICAL','FAILED',
  'BLOCKED','UNVERIFIED','NO_RIGHTS','NO_RESULTS'
]);
export const SOURCE_ACCESS_MODES = Object.freeze([
  'PROVIDER_EMBED','OFFICIAL_LINK','DIRECT_ON_DEMAND',
  'LICENSED_OPEN_DATA','USER_LOCAL','UNAUTHORIZED_PUBLICATION'
]);
export const SOURCE_RIGHTS = Object.freeze([
  'DISPLAY_PROVIDER_ONLY','LINK_ONLY','BROWSER_DIRECT_CONDITIONAL',
  'OPEN_LICENSE_CONFIRMED','LOCAL_ONLY','NO_PUBLICATION'
]);
export const SOURCE_VALIDITY = Object.freeze(['UNKNOWN','VALID','INVALID']);
const SOURCE_IDS = /^[a-z][a-z0-9-]{1,63}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const YEAR = /^\d{4}$/;
const has = (list, value) => list.includes(value);
const optionalString = value => value == null || typeof value === 'string';
const isValidDay = value => {
  const [year,month,day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year,month-1,day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month-1 && parsed.getUTCDate() === day;
};
export function isSourceClock(value, granularity = 'instant') {
  if (typeof value !== 'string') return false;
  if (granularity === 'year') return YEAR.test(value) && Number(value) >= 1800 && Number(value) <= 2500;
  if (granularity === 'day') return DAY.test(value) && isValidDay(value);
  if (granularity !== 'instant' || !INSTANT.test(value)) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const iso = new Date(parsed).toISOString();
  const originalDay = value.slice(0,10);
  const offset = value.endsWith('Z') ? 0 : (
    (value.at(-6) === '-' ? -1 : 1) * (
      Number(value.slice(-5,-3))*60 + Number(value.slice(-2))
    )
  );
  if (Math.abs(offset) > 14*60) return false;
  const originalLocal = new Date(parsed + offset*60_000).toISOString().slice(0,10);
  return originalDay === originalLocal && iso !== 'Invalid Date';
}
export function validateSourceReceipt(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok:false, errors:['INVALID_RECEIPT'] };
  }
  if (!SOURCE_IDS.test(input.sourceId || '')) errors.push('INVALID_SOURCE_ID');
  const policy = getMarketSource(input.sourceId);
  if (!policy) errors.push('UNREGISTERED_SOURCE');
  if (policy && input.accessMode !== policy.accessMode) errors.push('SOURCE_ACCESS_MISMATCH');
  if (policy && input.rights !== policy.rights) errors.push('SOURCE_RIGHTS_MISMATCH');
  if (policy && input.publisher !== policy.publisher) errors.push('SOURCE_PUBLISHER_MISMATCH');
  if (!has(SOURCE_STATES,input.state)) errors.push('INVALID_STATE');
  if (!has(SOURCE_ACCESS_MODES,input.accessMode)) errors.push('INVALID_ACCESS_MODE');
  if (!has(SOURCE_RIGHTS,input.rights)) errors.push('INVALID_RIGHTS');
  if (!has(SOURCE_VALIDITY,input.validity)) errors.push('INVALID_VALIDITY');
  if (typeof input.publisher !== 'string' || !input.publisher.trim()) errors.push('MISSING_PUBLISHER');
  for (const field of ['requestedAt','checkedAt']) {
    if (input[field] != null && !isSourceClock(input[field],'instant')) errors.push('INVALID_'+field.toUpperCase());
  }
  const granularity = input.providerClockGranularity || 'instant';
  if (!['instant','day','year'].includes(granularity)) errors.push('INVALID_CLOCK_GRANULARITY');
  if (input.providerAsOf != null && !isSourceClock(input.providerAsOf,granularity)) errors.push('INVALID_PROVIDER_CLOCK');
  if (input.transportStatus != null &&
      (!Number.isInteger(input.transportStatus) || input.transportStatus < 100 || input.transportStatus > 599)) errors.push('INVALID_TRANSPORT_STATUS');
  if (!optionalString(input.reasonCode) || !optionalString(input.originalUrl) ||
      !optionalString(input.dataVersion)) errors.push('INVALID_METADATA_TYPE');
  if (input.originalUrl != null && !isAllowedMarketSourceUrl(input.sourceId,input.originalUrl)) errors.push('INVALID_SOURCE_URL');
  if (['READY','HISTORICAL','NO_RESULTS'].includes(input.state) && input.accessMode !== 'USER_LOCAL' && input.originalUrl == null) errors.push('MISSING_SOURCE_URL');
  const dataState = input.state === 'READY' || input.state === 'HISTORICAL';
  if (dataState && (input.providerAsOf == null || input.validity !== 'VALID')) errors.push('UNQUALIFIED_OBSERVATION');
  if (dataState && ['PROVIDER_EMBED','OFFICIAL_LINK','UNAUTHORIZED_PUBLICATION'].includes(input.accessMode)) errors.push('NOT_NATIVE_OBSERVATION');
  if (dataState && ['DISPLAY_PROVIDER_ONLY','LINK_ONLY','NO_PUBLICATION'].includes(input.rights)) errors.push('RIGHTS_DO_NOT_ALLOW_NATIVE_RESULT');
  if (input.state === 'NO_RESULTS' && !['DIRECT_ON_DEMAND','LICENSED_OPEN_DATA'].includes(input.accessMode)) errors.push('NO_RESULTS_REQUIRES_DIRECT_SOURCE');
  if (input.state === 'NO_RESULTS' && (input.validity !== 'VALID' || input.checkedAt == null || input.transportStatus == null ||
      input.transportStatus < 200 || input.transportStatus >= 300)) errors.push('EMPTY_RESULT_UNVERIFIED');
  if (input.state === 'NO_RIGHTS' && input.rights !== 'NO_PUBLICATION') errors.push('NO_RIGHTS_MISMATCH');
  return { ok: errors.length === 0, errors };
}
/** Never add a source timestamp or assert a data state to rescue an invalid receipt. */
export function createSourceReceipt(fields) {
  const candidate = {
    sourceId:fields?.sourceId ?? null,
    accessMode:fields?.accessMode ?? null,
    state:fields?.state ?? 'NOT_REQUESTED',
    reasonCode:fields?.reasonCode ?? null,
    requestedAt:fields?.requestedAt ?? null,
    checkedAt:fields?.checkedAt ?? null,
    providerAsOf:fields?.providerAsOf ?? null,
    providerClockGranularity:fields?.providerClockGranularity ?? 'instant',
    originalUrl:fields?.originalUrl ?? null,
    publisher:fields?.publisher ?? null,
    transportStatus:fields?.transportStatus ?? null,
    validity:fields?.validity ?? 'UNKNOWN',
    rights:fields?.rights ?? null,
    dataVersion:fields?.dataVersion ?? null
  };
  const check = validateSourceReceipt(candidate);
  return check.ok ? { ok:true, receipt:Object.freeze(candidate), errors:[] } :
    { ok:false, receipt:null, errors:check.errors };
}
/** An embed's DOM/script event cannot create an extractable native quote. */
export function qualifiedSourceResult(data, receipt) {
  const check = validateSourceReceipt(receipt);
  if (!check.ok) return { ok:false, data:null, errors:check.errors };
  if (!['READY','HISTORICAL'].includes(receipt.state) || data == null ||
      !['DIRECT_ON_DEMAND','LICENSED_OPEN_DATA','USER_LOCAL'].includes(receipt.accessMode)) {
    return { ok:false, data:null, errors:['NOT_QUALIFIED_RESULT'] };
  }
  return { ok:true, data, receipt, errors:[] };
}
