import { LIVE_MAX_LANE_PAYLOAD_BYTES } from '../../../scripts/sections-live/sectionsLiveAuthority.mjs';
import { ShadowCustodyError, type LaneEvidence, type ShadowEpochRow } from './contracts';
import { sha256Text } from './crypto';
import type { CustodyEnv } from './custody';

const HOUR_MS = 60 * 60 * 1_000;
const DEFAULT_STORAGE_CAP_BYTES = 350_000_000;

export interface StoredLiveLaneResult {
  lane: {
    laneId: string;
    sectionKey: string;
    sourceGroup: string;
    sourceName: string;
    feedUrlDigest: string;
  };
  disposition: LaneEvidence['disposition'];
  items: Array<Record<string, unknown>>;
  httpStatus: number | null;
  durationMs: number;
  errorCode: string | null;
  diagnostics: Record<string, unknown>;
  observedAtMs: number;
  attemptCount: number;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function storageCap(env: CustodyEnv): number {
  const configured = Number(env.SHADOW_MAX_D1_EVIDENCE_BYTES);
  return Number.isInteger(configured) && configured > 0
    ? Math.min(configured, DEFAULT_STORAGE_CAP_BYTES)
    : DEFAULT_STORAGE_CAP_BYTES;
}

function changes(result: D1Result): number {
  return Number(result.meta?.changes ?? 0);
}

export async function stageLiveLaneResult(
  env: CustodyEnv,
  epoch: ShadowEpochRow,
  result: StoredLiveLaneResult,
): Promise<number> {
  const payloadJson = JSON.stringify({ items: result.items, diagnostics: result.diagnostics });
  const payloadBytes = byteLength(payloadJson);
  if (payloadBytes <= 0 || payloadBytes > LIVE_MAX_LANE_PAYLOAD_BYTES) {
    throw new ShadowCustodyError(
      'LIVE_LANE_PAYLOAD_TOO_LARGE',
      `Normalized lane evidence exceeds ${LIVE_MAX_LANE_PAYLOAD_BYTES} bytes`,
    );
  }
  const payloadDigest = await sha256Text(payloadJson);
  const laneDigest = await sha256Text(JSON.stringify({
    disposition: result.disposition,
    itemCount: result.items.length,
    payloadDigest,
    httpStatus: result.httpStatus,
    errorCode: result.errorCode,
  }));

  const existing = await env.SHADOW_DB.prepare(`
    SELECT l.evidence_digest, l.disposition, l.item_count,
      l.attempt_count, p.payload_digest, p.payload_json
    FROM sections_shadow_lane_evidence l
    LEFT JOIN sections_shadow_lane_payloads p
      ON p.epoch_id = l.epoch_id AND p.lane_id = l.lane_id
    WHERE l.epoch_id = ? AND l.lane_id = ?
  `).bind(epoch.epoch_id, result.lane.laneId).first<Record<string, unknown>>();
  if (existing) {
    if (
      existing.evidence_digest !== laneDigest ||
      existing.disposition !== result.disposition ||
      Number(existing.item_count) !== result.items.length ||
      existing.payload_digest !== payloadDigest ||
      existing.payload_json !== payloadJson
    ) {
      throw new ShadowCustodyError(
        'LANE_RETRY_CONFLICT',
        `At-least-once retry changed live evidence for ${result.lane.laneId}`,
      );
    }
    await env.SHADOW_DB.prepare(`
      UPDATE sections_shadow_lane_evidence
      SET attempt_count = MAX(attempt_count, ?)
      WHERE epoch_id = ? AND lane_id = ?
    `).bind(result.attemptCount, epoch.epoch_id, result.lane.laneId).run();
    const count = await env.SHADOW_DB.prepare(`
      SELECT terminal_lane_count FROM sections_shadow_epochs WHERE epoch_id = ?
    `).bind(epoch.epoch_id).first<{ terminal_lane_count: number }>();
    return Number(count?.terminal_lane_count ?? 0);
  }

  let stored: D1Result[];
  try {
    stored = await env.SHADOW_DB.batch([
    env.SHADOW_DB.prepare(`
      INSERT INTO sections_shadow_lane_payloads (
        epoch_id, lane_id, payload_digest, payload_json, item_count,
        byte_length, created_at_ms, expires_at_ms
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE (
        SELECT
          (SELECT COALESCE(SUM(byte_length), 0) FROM sections_shadow_evidence_objects) +
          (SELECT COALESCE(SUM(byte_length), 0) FROM sections_shadow_lane_payloads)
      ) + ? <= ?
    `).bind(
      epoch.epoch_id,
      result.lane.laneId,
      payloadDigest,
      payloadJson,
      result.items.length,
      payloadBytes,
      result.observedAtMs,
      result.observedAtMs + 36 * HOUR_MS,
      payloadBytes,
      storageCap(env),
    ),
    env.SHADOW_DB.prepare(`
      INSERT INTO sections_shadow_lane_evidence (
        epoch_id, lane_id, section_key, source_group, source_name,
        feed_url_digest, disposition, item_count, evidence_digest,
        evidence_object_key, attempt_count, http_status, duration_ms,
        error_code, observed_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
    `).bind(
      epoch.epoch_id,
      result.lane.laneId,
      result.lane.sectionKey,
      result.lane.sourceGroup,
      result.lane.sourceName,
      result.lane.feedUrlDigest,
      result.disposition,
      result.items.length,
      laneDigest,
      result.attemptCount,
      result.httpStatus,
      result.durationMs,
      result.errorCode,
      result.observedAtMs,
    ),
    env.SHADOW_DB.prepare(`
      UPDATE sections_shadow_epochs
      SET terminal_lane_count = (
        SELECT COUNT(*) FROM sections_shadow_lane_evidence WHERE epoch_id = ?
      )
      WHERE epoch_id = ? AND state = 'STAGED'
    `).bind(epoch.epoch_id, epoch.epoch_id),
    ]);
  } catch (error) {
    if (String(error).includes('sections_shadow_live_lane_requires_payload')) {
      throw new ShadowCustodyError(
        'FREE_TIER_STORAGE_CAPACITY_EXHAUSTED',
        `D1 storage ceiling rejected live lane ${result.lane.laneId}`,
      );
    }
    throw error;
  }
  if (changes(stored[0]) !== 1 || changes(stored[1]) !== 1 || changes(stored[2]) !== 1) {
    throw new ShadowCustodyError(
      changes(stored[0]) !== 1 ? 'FREE_TIER_STORAGE_CAPACITY_EXHAUSTED' : 'LIVE_LANE_STAGE_FAILED',
      `Could not atomically stage live lane ${result.lane.laneId}`,
    );
  }
  const count = await env.SHADOW_DB.prepare(`
    SELECT terminal_lane_count FROM sections_shadow_epochs WHERE epoch_id = ?
  `).bind(epoch.epoch_id).first<{ terminal_lane_count: number }>();
  return Number(count?.terminal_lane_count ?? 0);
}

export async function readLiveLaneResults(
  db: D1Database,
  epochId: string,
): Promise<StoredLiveLaneResult[]> {
  const rows = await db.prepare(`
    SELECT l.lane_id, l.section_key, l.source_group, l.source_name,
      l.feed_url_digest, l.disposition, l.http_status, l.duration_ms,
      l.error_code, l.observed_at_ms, l.attempt_count, p.payload_json
    FROM sections_shadow_lane_evidence l
    JOIN sections_shadow_lane_payloads p
      ON p.epoch_id = l.epoch_id AND p.lane_id = l.lane_id
    WHERE l.epoch_id = ?
    ORDER BY l.lane_id
  `).bind(epochId).all<Record<string, unknown>>();
  return rows.results.map(row => {
    let payload: { items?: Array<Record<string, unknown>>; diagnostics?: Record<string, unknown> };
    try {
      payload = JSON.parse(String(row.payload_json));
    } catch {
      throw new ShadowCustodyError('LIVE_LANE_PAYLOAD_INVALID', `Invalid live payload for ${row.lane_id}`);
    }
    return {
      lane: {
        laneId: String(row.lane_id),
        sectionKey: String(row.section_key),
        sourceGroup: String(row.source_group),
        sourceName: String(row.source_name),
        feedUrlDigest: String(row.feed_url_digest),
      },
      disposition: row.disposition as LaneEvidence['disposition'],
      items: Array.isArray(payload.items) ? payload.items : [],
      httpStatus: row.http_status === null ? null : Number(row.http_status),
      durationMs: Number(row.duration_ms ?? 0),
      errorCode: row.error_code === null ? null : String(row.error_code),
      diagnostics: payload.diagnostics || {},
      observedAtMs: Number(row.observed_at_ms),
      attemptCount: Number(row.attempt_count),
    };
  });
}
