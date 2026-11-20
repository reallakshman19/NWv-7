/**
 * NWv7 Market Desk R2.1 - WP-07 Mutual Fund NFO Lifecycle Engine
 * Implements pure date parsing, 90-day upcoming presentation window,
 * lifecycle classification, and custody retention without destroying historical audit data.
 */

export const IST_OFFSET_MS = 19800000;
export const DAY_MS = 86400000;

export const NFO_LIFECYCLE_STATES = Object.freeze({
  OPEN: 'OPEN',
  UPCOMING: 'UPCOMING',
  ANNOUNCED_UNVERIFIED: 'ANNOUNCED_UNVERIFIED',
  EXPIRED: 'EXPIRED',
  UNKNOWN: 'UNKNOWN'
});

/**
 * Parses an ISO date (YYYY-MM-DD) or Indian DMY date (DD-MM-YYYY) into UTC timestamp for 00:00:00 IST.
 * @param {string} value 
 * @returns {number|null}
 */
export function parseIndiaDate(value) {
  if (value == null) return null;
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  const dmy = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!iso && !dmy) return null;

  const [year, month, day] = iso
    ? iso.slice(1).map(Number)
    : [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])];

  const stamp = Date.UTC(year, month - 1, day);
  const check = new Date(stamp);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return stamp - IST_OFFSET_MS;
}

/**
 * Pure classifier that evaluates an NFO record against reference time `now` in Asia/Kolkata.
 * Separates date-based temporal classification from source authority.
 *
 * @param {object} record 
 * @param {number} now 
 * @returns {object}
 */
export function classifyNfoRecord(record, now = Date.now()) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { record: null, state: NFO_LIFECYCLE_STATES.UNKNOWN, stateLabel: 'Invalid record' };
  }

  const today = Math.floor((now + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
  const openStamp = parseIndiaDate(record.openDate || record.startDate);
  const closeStamp = parseIndiaDate(record.closeDate || record.endDate);

  if (!record.name || openStamp === null || openStamp > today + 90 * DAY_MS) {
    return {
      ...record,
      state: NFO_LIFECYCLE_STATES.UNKNOWN,
      stateLabel: 'Date unverified'
    };
  }

  // Announced row lacking confirmed close date
  if (closeStamp === null && record.status === 'announced' && record.source === 'AMFI' && openStamp >= today - 21 * DAY_MS) {
    return {
      ...record,
      state: NFO_LIFECYCLE_STATES.ANNOUNCED_UNVERIFIED,
      stateLabel: 'Announced · verify availability',
      openStamp,
      closeStamp: null
    };
  }

  if (closeStamp === null || closeStamp < openStamp) {
    return {
      ...record,
      state: NFO_LIFECYCLE_STATES.UNKNOWN,
      stateLabel: 'Invalid offer window',
      openStamp,
      closeStamp
    };
  }

  // Expired offers: closeDate is strictly in the past
  if (closeStamp < today) {
    return {
      ...record,
      state: NFO_LIFECYCLE_STATES.EXPIRED,
      stateLabel: 'Closed',
      openStamp,
      closeStamp
    };
  }

  // Upcoming offers: openDate is in the future
  if (openStamp > today) {
    return {
      ...record,
      state: NFO_LIFECYCLE_STATES.UPCOMING,
      stateLabel: 'Upcoming',
      openStamp,
      closeStamp
    };
  }

  // Currently open for subscription
  return {
    ...record,
    state: NFO_LIFECYCLE_STATES.OPEN,
    stateLabel: 'Open',
    openStamp,
    closeStamp
  };
}

/**
 * Filters and classifies records into currently active offers (OPEN, UPCOMING, ANNOUNCED).
 * Preserves historical records separately rather than destroying them.
 *
 * @param {Array<object>} rows 
 * @param {number} now 
 * @returns {Array<object>}
 */
export function filterActiveNfos(rows = [], now = Date.now()) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(row => classifyNfoRecord(row, now))
    .filter(row => row.state === NFO_LIFECYCLE_STATES.OPEN ||
                   row.state === NFO_LIFECYCLE_STATES.UPCOMING ||
                   row.state === NFO_LIFECYCLE_STATES.ANNOUNCED_UNVERIFIED);
}

/**
 * Extracts expired offers for historical inspection and audit custody.
 * @param {Array<object>} rows 
 * @param {number} now 
 * @returns {Array<object>}
 */
export function filterHistoricalNfos(rows = [], now = Date.now()) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(row => classifyNfoRecord(row, now))
    .filter(row => row.state === NFO_LIFECYCLE_STATES.EXPIRED);
}

/**
 * Merges incoming records with existing records in custody, ensuring stale updates
 * cannot revive an already expired offer back to OPEN (P0-01 / WP07-T09).
 *
 * @param {Array<object>} existingRecords 
 * @param {Array<object>} incomingRecords 
 * @param {number} now 
 * @returns {Array<object>}
 */
export function mergeNfoCustody(existingRecords = [], incomingRecords = [], now = Date.now()) {
  const mergedMap = new Map();

  for (const item of existingRecords) {
    const key = item.id || `${item.name}-${item.openDate}`;
    mergedMap.set(key, classifyNfoRecord(item, now));
  }

  for (const item of incomingRecords) {
    const key = item.id || `${item.name}-${item.openDate}`;
    const incomingClassified = classifyNfoRecord(item, now);
    const existing = mergedMap.get(key);

    // Protection: If already expired in custody, do not revive to OPEN via stale update
    if (existing && existing.state === NFO_LIFECYCLE_STATES.EXPIRED && incomingClassified.state === NFO_LIFECYCLE_STATES.OPEN) {
      continue;
    }

    mergedMap.set(key, incomingClassified);
  }

  return Array.from(mergedMap.values());
}
