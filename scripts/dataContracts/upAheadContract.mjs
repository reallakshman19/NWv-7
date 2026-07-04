import {
  asArray,
  asObject,
  makeResult,
  parseTimestamp,
  storyIdentity,
} from './sharedContractUtils.mjs';

const CONTRACT_VERSION = 'upahead-lifecycle-v1';
const LOOKAHEAD_DAYS = 7;
const EVENT_GRACE_HOURS = 24;
const PLANNER_GRACE_HOURS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

function lifecycleExpected(item) {
  return Boolean(item?.publishedAt || item?.eventStartAt || item?.expiryAt || item?.plannerEligible);
}

function checkHorizon(item, fetchedAt) {
  const start = parseTimestamp(item?.eventStartAt || item?.expiryAt);
  if (!start || !fetchedAt) return null;
  const maxFuture = fetchedAt + LOOKAHEAD_DAYS * DAY_MS;
  return start <= maxFuture ? null : storyIdentity(item);
}

function countLifecycle(items) {
  return items.filter(item => item && typeof item.lifecycle === 'object').length;
}

export function validateUpAheadContract(snapshot) {
  const errors = [];
  const warnings = [];
  const items = asArray(snapshot?.items);
  const horizon = asObject(snapshot?.horizon);
  const fetchedAt = parseTimestamp(snapshot?.fetchedAt || snapshot?.generatedAt);
  const lifecycleCount = countLifecycle(items);
  const missingLifecycle = items.filter(item => lifecycleExpected(item) && !item?.lifecycle);
  const horizonViolations = items.map(item => checkHorizon(item, fetchedAt)).filter(Boolean);

  if (!Number(snapshot?.schemaVersion || 0)) errors.push('upAhead schemaVersion is missing or invalid');
  if (!fetchedAt) errors.push('upAhead fetchedAt is missing or invalid');
  if (!snapshot?.contentHash) errors.push('upAhead contentHash is missing');
  if (!Array.isArray(snapshot?.items)) errors.push('upAhead items[] is missing');
  if (items.length === 0) warnings.push('upAhead items[] is empty or thin');
  if (lifecycleCount > 0 && snapshot?.contractVersion !== CONTRACT_VERSION) errors.push(`upAhead contractVersion must be ${CONTRACT_VERSION}`);
  if (horizon.lookaheadDays !== LOOKAHEAD_DAYS) errors.push(`upAhead horizon.lookaheadDays must be ${LOOKAHEAD_DAYS}`);
  if (horizon.eventPastGraceHours !== EVENT_GRACE_HOURS) errors.push(`upAhead horizon.eventPastGraceHours must be ${EVENT_GRACE_HOURS}`);
  if (horizon.plannerPastGraceHours !== PLANNER_GRACE_HOURS) errors.push(`upAhead horizon.plannerPastGraceHours must be ${PLANNER_GRACE_HOURS}`);
  if (missingLifecycle.length > 0) errors.push(`${missingLifecycle.length} Up Ahead items missing lifecycle metadata`);
  if (horizonViolations.length > 0) errors.push(`${horizonViolations.length} Up Ahead dated items outside 7-day horizon`);
  if (items.length > 0 && lifecycleCount === 0) warnings.push('upAhead has no lifecycle-enriched items');
  if (Number(snapshot?.lifecycleSummary?.horizonViolationCount || 0) > 0) errors.push('upAhead lifecycleSummary reports horizon violations');

  return makeResult(errors, warnings, {
    fetchedAt,
    itemCount: items.length,
    lifecycleItemCount: lifecycleCount,
    missingLifecycleCount: missingLifecycle.length,
    horizonViolationCount: horizonViolations.length,
    horizon,
    contractVersion: snapshot?.contractVersion || '',
  });
}
