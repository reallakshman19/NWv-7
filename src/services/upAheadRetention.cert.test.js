import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CACHE_KEY, loadFromCache, saveToCache } from './upAheadService.js';
import { isUpAheadItemActive, upAheadExpiryMs } from './upAheadLifecycle.js';

const NOW = Date.parse('2026-11-19T06:00:00Z');
const DAY = 86_400_000;
const event = (overrides = {}) => ({
  id: 'early', occurrenceId: 'early-occurrence', category: 'events', title: 'Chennai workshop',
  city: 'Chennai', publishedAt: NOW, eventStartAt: NOW + 30 * DAY,
  eventEndAt: NOW + 30 * DAY + 3_600_000, plannerEligible: true, ...overrides,
});
const snapshot = (items, fetchedAt = NOW) => ({ schemaVersion: 1, fetchedAt, items });

beforeEach(() => {
  const storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  });
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('retains an early announcement outside the view and promotes it without new source data', () => {
  saveToCache(snapshot([event()]));
  const first = loadFromCache();
  expect(first.sections.events).toEqual([]);
  expect(first.pendingItems).toHaveLength(1);
  vi.setSystemTime(NOW + 24 * DAY);
  const entered = loadFromCache();
  expect(entered.pendingItems).toEqual([]);
  expect(entered.sections.events).toHaveLength(1);
  expect(entered.sections.events[0].publishedAt).toBe(NOW);
  expect(entered.fetchedAt).toBe(NOW);
  vi.setSystemTime(NOW + 30 * DAY + 3_600_000);
  expect(loadFromCache()).toBeNull();
  expect(JSON.parse(localStorage.getItem(CACHE_KEY)).pendingItems).toBeUndefined();
});

it('reads the publisher pending pool, applies a reschedule, and rejects an old replay', () => {
  const original = event({ observedAt: NOW });
  saveToCache({ ...snapshot([]), pendingItems: [original] });
  vi.setSystemTime(NOW + 3_600_000);
  saveToCache(snapshot([event({ observedAt: Date.now(), eventStartAt: NOW + DAY, eventEndAt: NOW + 2 * DAY })], Date.now()));
  saveToCache({ ...snapshot([]), pendingItems: [original] });
  expect(loadFromCache().pendingItems).toEqual([]);
  expect(loadFromCache().sections.events[0].eventStartAt).toBe(NOW + DAY);
});

it('does not give clockless legacy feed records an infinite lifetime', () => {
  const row = { id: 'legacy', title: 'Undated notice', category: 'alerts' };
  expect(upAheadExpiryMs(row)).toBe(0);
  expect(isUpAheadItemActive(row, NOW + 3650 * DAY)).toBe(false);
  localStorage.setItem(CACHE_KEY, JSON.stringify({ sections: { alerts: [row] } }));
  const kept = loadFromCache();
  expect(kept.sections.alerts).toEqual([]);
  expect(kept.quarantinedItems[0]).toEqual(expect.objectContaining({ reason: 'missing_clock', quarantinedAt: NOW }));
  expect(kept.quarantinedItems[0].item.publishedAt).toBeUndefined();
  vi.setSystemTime(NOW + DAY);
  expect(loadFromCache().quarantinedItems[0].quarantinedAt).toBe(NOW);
  vi.setSystemTime(NOW + 8 * DAY);
  expect(loadFromCache()).toBeNull();
  expect(localStorage.getItem(CACHE_KEY)).toBeNull();
});

it('persists expiry cleanup during cache read while preserving saved Planner and recovery bytes', () => {
  localStorage.setItem('upAhead_planner', 'personal-plan-bytes');
  localStorage.setItem('nw_planner_seed_recovery_v1', 'protected-recovery-bytes');
  saveToCache(snapshot([event({ eventStartAt: NOW, eventEndAt: NOW + 3_600_000 })]));
  vi.setSystemTime(NOW + 3_600_000);
  expect(loadFromCache()).toBeNull();
  const stored = JSON.parse(localStorage.getItem(CACHE_KEY));
  expect(stored.sections).toBeUndefined();
  expect(Object.values(stored.retiredItems).every(row => row.retiredAt === Date.now())).toBe(true);
  expect(localStorage.getItem('upAhead_planner')).toBe('personal-plan-bytes');
  expect(localStorage.getItem('nw_planner_seed_recovery_v1')).toBe('protected-recovery-bytes');
});

it('records an expired pending revision and rejects a delayed version that would revive it', () => {
  const old = snapshot([event()]);
  saveToCache(old);
  vi.setSystemTime(NOW + 3_600_000);
  saveToCache(snapshot([event({ expiryAt: Date.now() })], Date.now()));
  saveToCache(old);
  expect(loadFromCache()).toBeNull();
});

it('honors publisher retirement markers even when this browser never saw the cancelled revision', () => {
  saveToCache({ ...snapshot([], NOW + 3_600_000), pendingItems: [event({ observedAt: NOW })],
    retiredRevisions: [{ identity: ['events', 'early-occurrence'], revisionAt: NOW + 1800_000, retiredAt: NOW }] });
  expect(loadFromCache()).toBeNull();
  saveToCache(snapshot([event({ observedAt: NOW })]));
  expect(loadFromCache()).toBeNull();
});

it('keeps the original legacy bytes when durable quarantine cannot be written', () => {
  const original = JSON.stringify({ sections: { alerts: [{ id: 'legacy', title: 'Notice' }] } });
  localStorage.setItem(CACHE_KEY, original);
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw Error('QuotaExceededError'); });
  expect(loadFromCache().quarantinedItems).toHaveLength(1);
  expect(localStorage.getItem(CACHE_KEY)).toBe(original);
});

it('does not extend quarantine retention when another copy arrives and rejects clockless quarantine metadata', () => {
  const row = { id: 'legacy', title: 'Notice', category: 'alerts' };
  saveToCache({ sections: {}, quarantinedItems: [{ item: row, reason: 'missing_clock', quarantinedAt: NOW }] });
  vi.setSystemTime(NOW + DAY);
  saveToCache({ sections: {}, quarantinedItems: [{ item: row, reason: 'missing_clock', quarantinedAt: Date.now() },
    { item: { ...row, id: 'bad' }, reason: 'missing_clock' }] });
  expect(loadFromCache().quarantinedItems).toEqual([expect.objectContaining({ quarantinedAt: NOW })]);
  vi.setSystemTime(NOW + 7 * DAY);
  expect(loadFromCache()).toBeNull();
});
