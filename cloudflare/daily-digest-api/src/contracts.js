export const QUALIFICATION_STATES = Object.freeze({
  QUALIFIED: 'QUALIFIED',
  HOLD: 'HOLD',
  REJECTED: 'REJECTED',
});

export const SCHEDULE_STATES = Object.freeze({
  EXPECTED: 'EXPECTED',
  NOT_YET_EXPECTED: 'NOT_YET_EXPECTED',
  NOT_SCHEDULED: 'NOT_SCHEDULED',
});

export const ACQUISITION_STATES = Object.freeze({
  OK: 'OK',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
});

export const EDITION_STATES = Object.freeze({
  CURRENT: 'CURRENT',
  STALE: 'STALE',
  MISSING: 'MISSING',
  INVALID: 'INVALID',
});

export const ACCESSIBILITY_STATES = Object.freeze({
  OPEN: 'OPEN',
  PAYWALLED: 'PAYWALLED',
  REDIRECTED: 'REDIRECTED',
  BLOCKED_TO_COLLECTOR: 'BLOCKED_TO_COLLECTOR',
  UNKNOWN: 'UNKNOWN',
});

export const SLOT_DEFINITIONS = Object.freeze({
  I1: Object.freeze(['INDIA_GENERAL']),
  I2: Object.freeze(['INDIA_GENERAL']),
  I3: Object.freeze(['INDIA_GENERAL', 'INDIA_BROAD']),
  G1: Object.freeze(['GLOBAL_BUSINESS_AND_WORLD']),
});

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isDigestDate(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

export function buildCanonicalId({ publisherFamily, product, edition = 'default', digestDate }) {
  if (!isDigestDate(digestDate)) throw new Error('invalid_digest_date');
  const parts = [publisherFamily, product, edition].map(slug);
  if (parts.some(part => !part)) throw new Error('invalid_canonical_identity');
  return `${parts.join(':')}:${digestDate}`;
}

export function isRoleCompatible(slot, role) {
  return Boolean(SLOT_DEFINITIONS[slot]?.includes(String(role || '')));
}

export function isSelectableCandidate(candidate, slot) {
  if (!candidate || !isRoleCompatible(slot, candidate.role)) return false;
  return candidate.qualificationState === QUALIFICATION_STATES.QUALIFIED
    && candidate.scheduleState === SCHEDULE_STATES.EXPECTED
    && candidate.acquisitionState !== ACQUISITION_STATES.CRITICAL
    && candidate.editionState === EDITION_STATES.CURRENT;
}
