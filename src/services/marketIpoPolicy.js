/**
 * A source calendar is evidence, not a statement that there are no issues.
 * Only a successful, recent, specifically identified IPO-source receipt can
 * establish an empty or populated schedule. A failed/omitted source cannot.
 *
 * Scope: presentation/receipt qualification only; no network calls.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_IPO_RECEIPT_AGE_MS = DAY_MS;
const GROUPS = Object.freeze(['live', 'upcoming', 'recent']);

const parseClock = (value) => {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 946684800000 ? value : null;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/i.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
};

const validatedRows = (ipo) => Object.fromEntries(GROUPS.map(group => [
  group,
  (Array.isArray(ipo?.[group]) ? ipo[group] : []).filter(row =>
    row && typeof row.name === 'string' && row.name.trim() &&
    validDate(row.openDate) && validDate(row.closeDate) && row.openDate <= row.closeDate
  ),
]));

export function assessMarketIpo(data, nowMs = Date.now()) {
  const rawReceipt = data?.sourceHealth?.ipo;
  const rawStatus = typeof rawReceipt === 'string'
    ? rawReceipt.toLowerCase()
    : String(rawReceipt?.status || '').toLowerCase();
  // A newer index collection clock is NOT evidence of a fresh IPO-source check.
  const checkedAt = parseClock(data?.ipoLastCheckedAt);
  const provider = typeof rawReceipt === 'object' && rawReceipt?.provider
    ? String(rawReceipt.provider) : 'IPO source';
  const none = {live: [], upcoming: [], recent: []};
  const rows = validatedRows(data?.ipo);
  const rowCount = GROUPS.reduce((sum, group) => sum + rows[group].length, 0);
  const rawCount = GROUPS.reduce((sum, group) => sum + (Array.isArray(data?.ipo?.[group]) ? data.ipo[group].length : 0), 0);
  const base = { provider, checkedAt, rowCount: 0, rows: none, sourceStatus: rawStatus || 'unknown' };

  if (rawStatus === 'failed' || rawStatus === 'error') {
    return { ...base, state: 'unavailable', message: 'IPO/FPO source unavailable. Availability cannot be determined from this publication.' };
  }

  // Freshness applies to the IPO receipt, even if the overall index snapshot
  // advanced independently. Future or missing clocks never establish emptiness.
  if (checkedAt == null || checkedAt > nowMs + 300000) {
    return { ...base, state: 'unverified', message: 'No valid recent IPO/FPO source check is available.' };
  }
  if (nowMs - checkedAt > MAX_IPO_RECEIPT_AGE_MS) {
    return { ...base, state: 'stale', message: 'IPO/FPO source check is outdated. Current availability is unverified.' };
  }
  if (rawStatus === 'empty' && rawCount === 0) {
    return { ...base, state: 'verified-empty', message: 'Source checked: no qualifying current IPO/FPO rows were returned.' };
  }
  if (rawStatus === 'snapshot' && rowCount && rowCount === rawCount) {
    return { ...base, state: 'available', rowCount, rows, message: 'Source-reported IPO/FPO schedule.' };
  }
  return { ...base, state: 'unverified', message: 'IPO/FPO source status or dated schedule is incomplete. Current availability cannot be confirmed.' };
}

export function ipoEvidenceIsCurrent(data, nowMs = Date.now()) {
  return ['available', 'verified-empty'].includes(assessMarketIpo(data, nowMs).state);
}
