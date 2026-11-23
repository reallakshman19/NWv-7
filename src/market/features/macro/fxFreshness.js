/**
 * Single source of truth for dated FX reference-rate eligibility.
 * A recent retrieval/check never makes an old provider observation fresh.
 */
export const FRESHNESS_WINDOW_MS = 36 * 60 * 60 * 1000;
export const EXPIRY_WINDOW_MS = 72 * 60 * 60 * 1000;
const FUTURE_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

export function evaluateFxObservation(date, now = Date.now()) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(now)) {
    return null;
  }

  const asOf = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(asOf) || new Date(asOf).toISOString().slice(0, 10) !== date ||
      asOf > now + FUTURE_CLOCK_TOLERANCE_MS) {
    return null;
  }

  const ageMs = Math.max(0, now - asOf);
  if (ageMs <= FRESHNESS_WINDOW_MS) {
    return { asOf, freshness: 'FRESH', stale: false, isHistorical: false, warning: null, receiptState: 'READY' };
  }
  if (ageMs <= EXPIRY_WINDOW_MS) {
    return {
      asOf, freshness: 'DATED_WARNING', stale: true, isHistorical: false,
      warning: 'Dated reference rate (over 36 hours old)', receiptState: 'READY'
    };
  }
  return {
    asOf, freshness: 'EXPIRED', stale: true, isHistorical: true,
    warning: 'Reference rate expired for current-day conversion (over 72 hours old)',
    receiptState: 'HISTORICAL'
  };
}

export function canConvertFxRate(rateData, now = Date.now()) {
  const classification = evaluateFxObservation(rateData?.date, now);
  return Boolean(classification && classification.freshness !== 'EXPIRED' &&
    Number.isFinite(rateData?.rate) && rateData.rate > 0);
}
