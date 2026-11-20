/** Source-dated, bounded saved-fund NAV loading. No market boot requests. */
export const MAX_SAVED_FUNDS = 12;
export const MAX_CONCURRENT_FUND_REQUESTS = 3;
export const FUND_NAV_CACHE_KEY = 'nw7.market-fund-nav.v1';
const DAY = 86_400_000;
const IST_OFFSET = 19_800_000;
const SCHEMA_VERSION = 1;
const validCode = value => /^\d{3,8}$/.test(String(value ?? ''));
const dayKey = ms => new Date(ms + IST_OFFSET).toISOString().slice(0, 10);

export function normalizeSavedFundCodes(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter(validCode).map(String))].slice(0, MAX_SAVED_FUNDS);
}

function navDateMs(date) {
  if (typeof date !== 'string') return null;
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(date) || /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const iso = date[4] === '-' ? [Number(match[1]), Number(match[2]), Number(match[3])] :
    [Number(match[3]), Number(match[2]), Number(match[1])];
  const [year, month, day] = iso;
  const utc = Date.UTC(year, month - 1, day);
  const verified = new Date(utc);
  return verified.getUTCFullYear() === year && verified.getUTCMonth() === month - 1 && verified.getUTCDate() === day
    ? utc - IST_OFFSET : null;
}

/** Validate the actual scheme and NAV source date on both network and local-cache reads. */
export function qualifiedFundNav(raw, code, nowMs = Date.now()) {
  if (!validCode(code) || !raw || String(raw.code) !== String(code) ||
      typeof raw.name !== 'string' || !raw.name.trim()) return null;
  const nav = typeof raw.nav === 'number' || (typeof raw.nav === 'string' && /^\d+(?:\.\d+)?$/.test(raw.nav.trim()))
    ? Number(raw.nav) : NaN;
  const sourceMs = navDateMs(raw.date);
  if (!Number.isFinite(nav) || nav <= 0 || sourceMs == null || sourceMs > nowMs + 5 * 60_000) return null;
  return { code: String(code), name: raw.name.trim(), category: typeof raw.category === 'string' ? raw.category : '',
    nav, date: raw.date, stale: nowMs - sourceMs > 7 * DAY };
}

function aborted() {
  const error = new Error('Request cancelled');
  error.name = 'AbortError';
  return error;
}

/**
 * One per-workspace repository. Same-code requests share a bounded transport.
 * Each caller may cancel independently; the transport aborts when nobody awaits it.
 * A successful local read never modifies checkedAt or the NAV source date.
 */
export function createMarketFundNavStore({ load, read = () => null, write = () => false, now = Date.now } = {}) {
  if (typeof load !== 'function') throw new TypeError('A NAV source loader is required');
  const inflight = new Map();
  const memory = new Map();
  let cooldownUntil = 0;

  function readCached(code, clock) {
    const local = memory.get(code);
    const persisted = local || (() => {
      try {
        const stored = read(FUND_NAV_CACHE_KEY);
        return stored?.version === SCHEMA_VERSION ? stored?.items?.[code] : null;
      } catch { return null; }
    })();
    if (!persisted || typeof persisted.checkedAt !== 'number' || persisted.checkedAt > clock ||
        clock - persisted.checkedAt >= DAY || dayKey(persisted.checkedAt) !== dayKey(clock)) return null;
    const nav = qualifiedFundNav(persisted.nav, code, clock);
    if (!nav) return null;
    memory.set(code, persisted);
    return { ...nav, delivery: 'cache', checkedAt: persisted.checkedAt };
  }

  function writeCached(code, nav, checkedAt) {
    const record = { nav, checkedAt };
    memory.set(code, record);
    let old;
    try { old = read(FUND_NAV_CACHE_KEY); } catch { old = null; }
    const oldItems = old?.version === SCHEMA_VERSION && old?.items && typeof old.items === 'object' ? old.items : {};
    const entries = Object.entries({ ...oldItems, [code]: record })
      .filter(([key, value]) => validCode(key) && Number.isFinite(value?.checkedAt))
      .sort((a, b) => b[1].checkedAt - a[1].checkedAt)
      .slice(0, MAX_SAVED_FUNDS);
    try { write(FUND_NAV_CACHE_KEY, { version: SCHEMA_VERSION, items: Object.fromEntries(entries) }); } catch { /* Storage optional. */ }
  }

  function request(code, { force = false, signal } = {}) {
    const key = String(code);
    if (!validCode(key)) return Promise.reject(new Error('Invalid fund scheme code'));
    if (signal?.aborted) return Promise.reject(aborted());
    const clock = now();
    if (!force) {
      const cached = readCached(key, clock);
      if (cached) return Promise.resolve(cached);
    }

    if (now() < cooldownUntil) {
      const error = new Error('NAV provider rate-limited requests. Retry later.');
      error.status = 429;
      return Promise.reject(error);
    }
    let entry = inflight.get(key);
    if (entry?.controller.signal.aborted) { inflight.delete(key); entry = null; }
    if (!entry) {
      const controller = new AbortController();
      entry = { controller, listeners: new Set(), settled: false, promise: null };
      inflight.set(key, entry);
      // Deferred start allows the first subscriber to register before a synchronous source rejection.
      entry.promise = Promise.resolve().then(() => load(key, { signal: controller.signal, now: now() }))
        .then(value => {
          const clockAtResult = now();
          const nav = qualifiedFundNav(value, key, clockAtResult);
          if (!nav) throw new Error('No valid published NAV for this scheme');
          if (!controller.signal.aborted) writeCached(key, nav, clockAtResult);
          return { ...nav, delivery: 'provider', checkedAt: clockAtResult };
        }).catch(error => {
          if (error?.status === 429) cooldownUntil = now() + 15 * 60_000;
          throw error;
        }).finally(() => {
          entry.settled = true;
          if (inflight.get(key) === entry) inflight.delete(key);
        });
      // Install a rejection handler immediately; a departing last subscriber aborts safely.
      void entry.promise.catch(() => {});
    }

    return new Promise((resolve, reject) => {
      const consumer = { done: false };
      entry.listeners.add(consumer);
      const finish = (callback, value) => {
        if (consumer.done) return;
        consumer.done = true;
        signal?.removeEventListener('abort', onAbort);
        entry.listeners.delete(consumer);
        if (!entry.listeners.size && !entry.settled) entry.controller.abort();
        callback(value);
      };
      const onAbort = () => finish(reject, aborted());
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) { onAbort(); return; }
      entry.promise.then(value => finish(resolve, value), error => finish(reject, error));
    });
  }

  async function batch(codes, { signal, onItem, force = false } = {}) {
    const list = normalizeSavedFundCodes(codes);
    const results = {};
    let next = 0;
    let cooldown = false;
    async function worker() {
      while (next < list.length && !signal?.aborted && !cooldown) {
        const code = list[next++];
        onItem?.({ code, status: 'loading' });
        try {
          const value = await request(code, { signal, force });
          if (signal?.aborted) return;
          results[code] = { status: 'ready', value };
          onItem?.({ code, ...results[code] });
        } catch (error) {
          if (signal?.aborted || error?.name === 'AbortError') return;
          const status = error?.status === 429 ? 'cooldown' : 'error';
          results[code] = { status, error: error?.message || 'NAV request failed' };
          onItem?.({ code, ...results[code] });
          if (status === 'cooldown') cooldown = true;
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_FUND_REQUESTS, list.length) }, worker));
    return { results, requested: Object.keys(results).length, total: list.length, cancelled: Boolean(signal?.aborted), cooldown };
  }

  return { request, batch, readCached, pendingCount: () => inflight.size };
}
