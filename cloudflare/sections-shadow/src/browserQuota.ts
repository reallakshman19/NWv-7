import { ShadowCustodyError } from './contracts';

const PROVIDER_FREE_BROWSER_MS_PER_DAY = 10 * 60 * 1_000;
const DEFAULT_INTERNAL_BROWSER_MS_PER_DAY = 8 * 60 * 1_000;
const DEFAULT_EPOCH_RESERVATION_MS = 20_000;

interface BrowserQuotaEnv {
  SHADOW_DB: D1Database;
  SHADOW_MAX_BROWSER_MS_PER_DAY?: string;
  SHADOW_BROWSER_MS_RESERVATION_PER_EPOCH?: string;
}

export interface BrowserQuotaRow {
  day_key: string;
  epochs_reserved: number;
  browser_ms_reserved: number;
  browser_ms_observed: number;
  blocked_starts: number;
  updated_at_ms: number;
}

function boundedPositiveInteger(raw: string | undefined, fallback: number, maximum: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export async function reserveBrowserCapacity(
  env: BrowserQuotaEnv,
  nowMs: number,
): Promise<BrowserQuotaRow> {
  const dayKey = utcDay(nowMs);
  const limitMs = boundedPositiveInteger(
    env.SHADOW_MAX_BROWSER_MS_PER_DAY,
    DEFAULT_INTERNAL_BROWSER_MS_PER_DAY,
    PROVIDER_FREE_BROWSER_MS_PER_DAY,
  );
  const reservationMs = boundedPositiveInteger(
    env.SHADOW_BROWSER_MS_RESERVATION_PER_EPOCH,
    DEFAULT_EPOCH_RESERVATION_MS,
    limitMs,
  );
  const row = await env.SHADOW_DB.prepare(`
    INSERT INTO sections_shadow_browser_quota_daily (
      day_key, epochs_reserved, browser_ms_reserved, browser_ms_observed,
      blocked_starts, updated_at_ms
    )
    SELECT ?, 1, ?, 0, 0, ?
    WHERE ? <= ?
    ON CONFLICT(day_key) DO UPDATE SET
      epochs_reserved = epochs_reserved + 1,
      browser_ms_reserved = browser_ms_reserved + excluded.browser_ms_reserved,
      updated_at_ms = excluded.updated_at_ms
    WHERE MAX(browser_ms_reserved, browser_ms_observed) + excluded.browser_ms_reserved <= ?
    RETURNING *
  `).bind(dayKey, reservationMs, nowMs, reservationMs, limitMs, limitMs).first<BrowserQuotaRow>();
  if (row) return row;

  await env.SHADOW_DB.prepare(`
    INSERT INTO sections_shadow_browser_quota_daily (day_key, blocked_starts, updated_at_ms)
    VALUES (?, 1, ?)
    ON CONFLICT(day_key) DO UPDATE SET
      blocked_starts = blocked_starts + 1,
      updated_at_ms = excluded.updated_at_ms
  `).bind(dayKey, nowMs).run();
  throw new ShadowCustodyError(
    'FREE_TIER_BROWSER_CAPACITY_EXHAUSTED',
    'The internal Browser Run allowance cannot admit another shadow epoch today',
  );
}

export async function recordBrowserUsage(
  db: D1Database,
  startedAtMs: number,
  finishedAtMs: number,
): Promise<void> {
  const observedMs = Math.max(0, Math.round(finishedAtMs - startedAtMs));
  await db.prepare(`
    INSERT INTO sections_shadow_browser_quota_daily (
      day_key, browser_ms_observed, updated_at_ms
    ) VALUES (?, ?, ?)
    ON CONFLICT(day_key) DO UPDATE SET
      browser_ms_observed = browser_ms_observed + excluded.browser_ms_observed,
      updated_at_ms = excluded.updated_at_ms
  `).bind(utcDay(startedAtMs), observedMs, finishedAtMs).run();
}
