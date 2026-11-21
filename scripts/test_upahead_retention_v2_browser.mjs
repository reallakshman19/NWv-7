import assert from 'node:assert/strict';
import { upAheadExpiryMs, isUpAheadItemActive } from '../src/services/upAheadLifecycle.js';
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

console.log('Up Ahead retention v2 browser expiry parity: PASS');
