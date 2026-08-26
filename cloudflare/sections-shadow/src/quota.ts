import { ShadowCustodyError } from './contracts';

interface QuotaEnv {
  SHADOW_DB: D1Database;
  SHADOW_MAX_EPOCHS_PER_DAY?: string;
  SHADOW_MAX_QUEUE_OPERATIONS_PER_DAY?: string;
  SHADOW_MAX_D1_READS_PER_DAY?: string;
  SHADOW_MAX_D1_WRITES_PER_DAY?: string;
  SHADOW_MAX_WORKER_INVOCATIONS_PER_DAY?: string;
}

interface QuotaReservation {
  epochs: number;
  queueOperations: number;
  d1Reads: number;
  d1Writes: number;
  workerInvocations: number;
}

interface QuotaLimits extends QuotaReservation {}

export interface QuotaDailyRow {
  day_key: string;
  epochs_started: number;
  queue_operations_estimate: number;
  d1_reads_estimate: number;
  d1_writes_estimate: number;
  worker_invocations_estimate: number;
  blocked_starts: number;
  updated_at_ms: number;
}

export const CONSERVATIVE_EPOCH_RESERVATION: Readonly<QuotaReservation> = Object.freeze({
  epochs: 1,
  queueOperations: 160,
  d1Reads: 3_500,
  d1Writes: 600,
  workerInvocations: 60,
});

function positiveInteger(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function quotaLimits(env: QuotaEnv): QuotaLimits {
  return {
    epochs: positiveInteger(env.SHADOW_MAX_EPOCHS_PER_DAY, 48),
    queueOperations: positiveInteger(env.SHADOW_MAX_QUEUE_OPERATIONS_PER_DAY, 8_000),
    d1Reads: positiveInteger(env.SHADOW_MAX_D1_READS_PER_DAY, 4_000_000),
    d1Writes: positiveInteger(env.SHADOW_MAX_D1_WRITES_PER_DAY, 80_000),
    workerInvocations: positiveInteger(env.SHADOW_MAX_WORKER_INVOCATIONS_PER_DAY, 80_000),
  };
}

function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export async function readQuotaDay(env: QuotaEnv, nowMs: number): Promise<QuotaDailyRow | null> {
  return env.SHADOW_DB.prepare(
    'SELECT * FROM sections_shadow_quota_daily WHERE day_key = ?',
  ).bind(utcDay(nowMs)).first<QuotaDailyRow>();
}

export async function recordCapacityBlock(
  db: D1Database,
  nowMs: number,
): Promise<void> {
  const dayKey = utcDay(nowMs);
  await db.prepare(`
    INSERT INTO sections_shadow_quota_daily (
      day_key, blocked_starts, updated_at_ms
    ) VALUES (?, 1, ?)
    ON CONFLICT(day_key) DO UPDATE SET
      blocked_starts = blocked_starts + 1,
      updated_at_ms = excluded.updated_at_ms
  `).bind(dayKey, nowMs).run();
}

export async function reserveEpochCapacity(
  env: QuotaEnv,
  nowMs: number,
  reservation: QuotaReservation = CONSERVATIVE_EPOCH_RESERVATION,
): Promise<QuotaDailyRow> {
  const dayKey = utcDay(nowMs);
  const limits = quotaLimits(env);
  const row = await env.SHADOW_DB.prepare(`
    INSERT INTO sections_shadow_quota_daily (
      day_key, epochs_started, queue_operations_estimate, d1_reads_estimate,
      d1_writes_estimate, worker_invocations_estimate, blocked_starts, updated_at_ms
    )
    SELECT ?, ?, ?, ?, ?, ?, 0, ?
    WHERE ? <= ? AND ? <= ? AND ? <= ? AND ? <= ? AND ? <= ?
    ON CONFLICT(day_key) DO UPDATE SET
      epochs_started = epochs_started + excluded.epochs_started,
      queue_operations_estimate = queue_operations_estimate + excluded.queue_operations_estimate,
      d1_reads_estimate = d1_reads_estimate + excluded.d1_reads_estimate,
      d1_writes_estimate = d1_writes_estimate + excluded.d1_writes_estimate,
      worker_invocations_estimate = worker_invocations_estimate + excluded.worker_invocations_estimate,
      updated_at_ms = excluded.updated_at_ms
    WHERE epochs_started + excluded.epochs_started <= ?
      AND queue_operations_estimate + excluded.queue_operations_estimate <= ?
      AND d1_reads_estimate + excluded.d1_reads_estimate <= ?
      AND d1_writes_estimate + excluded.d1_writes_estimate <= ?
      AND worker_invocations_estimate + excluded.worker_invocations_estimate <= ?
    RETURNING *
  `).bind(
    dayKey,
    reservation.epochs,
    reservation.queueOperations,
    reservation.d1Reads,
    reservation.d1Writes,
    reservation.workerInvocations,
    nowMs,
    reservation.epochs, limits.epochs,
    reservation.queueOperations, limits.queueOperations,
    reservation.d1Reads, limits.d1Reads,
    reservation.d1Writes, limits.d1Writes,
    reservation.workerInvocations, limits.workerInvocations,
    limits.epochs,
    limits.queueOperations,
    limits.d1Reads,
    limits.d1Writes,
    limits.workerInvocations,
  ).first<QuotaDailyRow>();

  if (row) return row;

  await recordCapacityBlock(env.SHADOW_DB, nowMs);

  throw new ShadowCustodyError(
    'FREE_TIER_CAPACITY_EXHAUSTED',
    'The conservative Cloudflare Free capacity envelope cannot admit another shadow epoch today',
  );
}
