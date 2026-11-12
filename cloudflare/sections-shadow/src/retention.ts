import { SHADOW_HISTORY_RETENTION_MS, SHADOW_RAW_RETENTION_MS } from './contracts';
import { pruneExpiredD1Evidence } from './evidenceStore';
import { reserveEpochCapacity } from './quota';
import type { CustodyEnv } from './custody';

function deleteExpiredEpochRows(
  db: D1Database,
  table: 'sections_shadow_decisions' | 'sections_shadow_lane_evidence',
  cutoff: number,
  limit: number,
): D1PreparedStatement {
  return db.prepare(`
    DELETE FROM ${table}
    WHERE rowid IN (
      SELECT child.rowid
      FROM sections_shadow_epochs e CROSS JOIN ${table} child
      WHERE e.logical_slot <= ? AND e.state <> 'STAGED' AND child.epoch_id = e.epoch_id
        AND NOT EXISTS (SELECT 1 FROM sections_shadow_current_pointer WHERE epoch_id = e.epoch_id)
      ORDER BY e.logical_slot, e.attempt
      LIMIT ?
    )
  `).bind(cutoff, limit);
}

export async function pruneShadowHistory(env: CustodyEnv, nowMs = Date.now()): Promise<number> {
  // The migration compares whole UTC seconds. Use the same boundary here.
  const cutoff = Math.floor(nowMs / 1_000) * 1_000 - SHADOW_HISTORY_RETENTION_MS;
  const dayCutoff = new Date(cutoff).toISOString().slice(0, 10);
  const db = env.SHADOW_DB;

  // Reserve for the row limits below, including affected index entries.
  // This uses the same daily envelope as acquisition, even on queue retries.
  await reserveEpochCapacity(env, nowMs, {
    epochs: 0,
    queueOperations: 0,
    d1Reads: 25_000,
    d1Writes: 2_500,
    workerInvocations: 1,
  });
  const abandoned = await db.prepare(`
    UPDATE sections_shadow_epochs
    SET state = 'ABORTED', failure_code = 'EPOCH_EXPIRED', terminal_at_ms = ?
    WHERE epoch_id IN (
      SELECT epoch_id FROM sections_shadow_epochs
      WHERE state = 'STAGED' AND (
        logical_slot <= ? OR (created_at_ms <= ? AND terminal_lane_count < expected_lane_count)
      )
      ORDER BY logical_slot, attempt LIMIT 32
    )
  `).bind(nowMs, cutoff, nowMs - SHADOW_RAW_RETENTION_MS).run();

  const payloads = await pruneExpiredD1Evidence(db, nowMs);
  const history = await db.batch([
    // One live epoch can produce up to 41 lanes × 20 ranking decisions.
    deleteExpiredEpochRows(db, 'sections_shadow_decisions', cutoff, 960),
    deleteExpiredEpochRows(db, 'sections_shadow_lane_evidence', cutoff, 48),
    db.prepare(`
      DELETE FROM sections_shadow_parity_results WHERE rowid IN (
        SELECT rowid FROM sections_shadow_parity_results
        WHERE created_at_ms <= ? ORDER BY created_at_ms LIMIT 4
      )
    `).bind(cutoff),
    db.prepare(`
      DELETE FROM sections_shadow_epochs WHERE epoch_id IN (
        SELECT e.epoch_id FROM sections_shadow_epochs e
        WHERE e.logical_slot <= ? AND e.state <> 'STAGED'
          AND NOT EXISTS (SELECT 1 FROM sections_shadow_current_pointer WHERE epoch_id = e.epoch_id)
          AND NOT EXISTS (SELECT 1 FROM sections_shadow_decisions WHERE epoch_id = e.epoch_id)
          AND NOT EXISTS (SELECT 1 FROM sections_shadow_lane_evidence WHERE epoch_id = e.epoch_id)
          AND NOT EXISTS (SELECT 1 FROM sections_shadow_lane_payloads WHERE epoch_id = e.epoch_id)
          AND NOT EXISTS (SELECT 1 FROM sections_shadow_evidence_objects WHERE epoch_id = e.epoch_id)
          AND NOT EXISTS (SELECT 1 FROM sections_shadow_parity_results WHERE shadow_epoch_id = e.epoch_id)
        ORDER BY e.logical_slot, e.attempt LIMIT 12
      )
    `).bind(cutoff),
    db.prepare(`
      DELETE FROM sections_shadow_quota_daily WHERE day_key IN (
        SELECT day_key FROM sections_shadow_quota_daily WHERE day_key <= ? ORDER BY day_key LIMIT 2
      )
    `).bind(dayCutoff),
    db.prepare(`
      DELETE FROM sections_shadow_browser_quota_daily WHERE day_key IN (
        SELECT day_key FROM sections_shadow_browser_quota_daily WHERE day_key <= ? ORDER BY day_key LIMIT 2
      )
    `).bind(dayCutoff),
  ]);
  return Number(abandoned.meta.changes ?? 0) + payloads +
    history.reduce((changes, result) => changes + Number(result.meta.changes ?? 0), 0);
}
