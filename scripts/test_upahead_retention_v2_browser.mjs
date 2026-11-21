import assert from 'node:assert/strict';
import {
  upAheadExpiryMs, isUpAheadItemActive, upAheadPlannerDayKey, getUpAheadWindowStatus,
} from '../src/services/upAheadLifecycle.js';
import {
  ALERT_FALLBACK_HOURS,
  OFFER_FALLBACK_HOURS,
  UPAHEAD_MAX_ACTIVE_HOURS,
} from '../src/config/horizonPolicy.js';

const H = 3_600_000;
const DAY = 24 * H;
const now = Date.parse('2026-11-21T00:00:00Z');
const item = (category, overrides = {}) => ({
  category, title: 'Verified item', id: 'fixture', publishedAt: now,
  observedAt: now, ...overrides,
});

assert.equal(ALERT_FALLBACK_HOURS, 36);
assert.equal(OFFER_FALLBACK_HOURS, 48);
assert.equal(UPAHEAD_MAX_ACTIVE_HOURS, 168);

const alert = item('alerts');
assert.equal(upAheadExpiryMs(alert), now + 36 * H);
assert.equal(isUpAheadItemActive(alert, now + 35 * H), true);
assert.equal(isUpAheadItemActive(alert, now + 36 * H), false);

const offer = item('shopping', { expiryAt: now + 20 * DAY });
assert.equal(upAheadExpiryMs(offer), now + 7 * DAY);
assert.equal(isUpAheadItemActive(offer, now + 7 * DAY), false);
assert.equal(upAheadExpiryMs({ ...offer, observedAt: now + 6 * DAY }), now + 13 * DAY);
assert.equal(upAheadExpiryMs({ ...offer, expiryAt: now + H }), now + H);

const future = item('events', {
  eventStartAt: now + 30 * DAY,
  eventEndAt: now + 31 * DAY,
  expiryAt: now + 31 * DAY,
});
assert.equal(upAheadExpiryMs(future), now + 31 * DAY);
assert.equal(upAheadExpiryMs({ ...future, suppressionReason: 'cancelled' }), 0);

const longRunning = item('events', {
  firstVisibleAt: now,
  eventStartAt: now + 6 * DAY,
  eventEndAt: now + 20 * DAY,
  expiryAt: now + 20 * DAY,
});
assert.equal(upAheadExpiryMs(longRunning), now + 7 * DAY);
assert.equal(upAheadExpiryMs({ ...longRunning, observedAt: now + 5 * DAY }), now + 12 * DAY);

const lifecycleBound = item('shopping', {
  expiryAt: now + 10 * DAY,
  lifecycle: { displayUntil: now + 4 * DAY },
});
assert.equal(upAheadExpiryMs(lifecycleBound), now + 4 * DAY);

// The exact same venue-local inclusive date fixtures are checked in Python.
for (const [city, expected] of [
  ['Chennai', Date.parse('2026-11-24T18:30:00Z')],
  ['Muscat', Date.parse('2026-11-24T20:00:00Z')],
]) {
  const sentinel = Date.parse('2026-11-24T00:00:00Z');
  const day = item('events', {
    city, datePrecision: 'day', eventDateKey: '2026-11-24',
    eventDateEndKey: '2026-11-24', eventStartAt: sentinel,
    eventEndAt: sentinel, expiryAt: sentinel,
  });
  assert.equal(upAheadExpiryMs(day), expected);
  assert.equal(isUpAheadItemActive(day, Date.parse('2026-11-24T12:00:00Z')), true);
  assert.equal(isUpAheadItemActive(day, expected), false);
}

// Compare the publisher-local calendar behavior to the exact Python fixture.
const muscatSourceRow = item('sports', {
  city: 'Muscat', datePrecision: 'day', eventDateKey: '2026-11-21',
  eventStartAt: Date.parse('2026-11-21T00:00:00Z'), eventEndAt: null,
  expiryAt: Date.parse('2026-11-21T20:00:00Z'), plannerEligible: true,
});
const muscatMorning = Date.parse('2026-11-21T05:36:00Z');
assert.equal(upAheadPlannerDayKey(muscatSourceRow, muscatMorning), '2026-11-21');
assert.equal(getUpAheadWindowStatus(muscatSourceRow,
  { asOfDate: muscatMorning }), 'inside_window');
assert.equal(isUpAheadItemActive(muscatSourceRow, muscatMorning), true);
assert.equal(isUpAheadItemActive(muscatSourceRow,
  Date.parse('2026-11-21T20:00:00Z')), false);

for (const [city, expiredAt] of [
  ['Chennai', Date.parse('2026-11-25T18:30:00Z')],
  ['Muscat', Date.parse('2026-11-25T20:00:00Z')],
]) {
  const start = Date.parse('2026-11-24T00:00:00Z');
  const end = Date.parse('2026-11-25T00:00:00Z');
  const range = item('events', {
    city, datePrecision: 'range', eventDateKey: '2026-11-24',
    eventDateEndKey: '2026-11-25', eventStartAt: start,
    eventEndAt: end, expiryAt: end,
  });
  const secondDay = Date.parse('2026-11-25T12:00:00Z');
  assert.equal(upAheadPlannerDayKey(range, secondDay), '2026-11-25');
  assert.equal(getUpAheadWindowStatus(range,
    { asOfDate: secondDay }), 'inside_window');
  assert.equal(isUpAheadItemActive(range, secondDay), true);
  assert.equal(isUpAheadItemActive(range, expiredAt), false);
}

// Legacy date-only cards must remain eligible despite missing publication timestamps.
const dateOnlyFestival = { id: 'festival', category: 'festivals', title: 'Festival',
  city: 'Chennai', date: '2026-11-24', datePrecision: 'day' };
assert.ok(upAheadExpiryMs(dateOnlyFestival) > now);
assert.equal(upAheadExpiryMs({ id: 'missing', category: 'alerts' }), 0);

console.log('Up Ahead retention v2 browser expiry parity: PASS');
