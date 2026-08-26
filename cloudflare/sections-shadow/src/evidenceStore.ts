import { ShadowCustodyError } from './contracts';
import { sha256Text } from './crypto';
import { recordCapacityBlock } from './quota';

export interface D1EvidenceEnv {
  SHADOW_DB: D1Database;
  SHADOW_MAX_D1_EVIDENCE_BYTES?: string;
}

export interface D1EvidenceObject {
  object_key: string;
  epoch_id: string;
  object_digest: string;
  schema_version: string;
  decision_output_digest: string;
  content_json: string;
  byte_length: number;
  created_at_ms: number;
  expires_at_ms: number;
}

const MAX_NORMALIZED_OBJECT_BYTES = 1_000_000;
const MAX_LANE_PAYLOAD_BYTES = 60_000;
const EXPECTED_LANE_COUNT = 41;
const DEFAULT_EVIDENCE_CAP_BYTES = 350_000_000;
const RESERVED_NEXT_EPOCH_BYTES = MAX_NORMALIZED_OBJECT_BYTES +
  MAX_LANE_PAYLOAD_BYTES * EXPECTED_LANE_COUNT;

function configuredEvidenceCap(env: D1EvidenceEnv): number {
  const configured = Number(env.SHADOW_MAX_D1_EVIDENCE_BYTES);
  return Number.isInteger(configured) && configured > 0
    ? Math.min(configured, DEFAULT_EVIDENCE_CAP_BYTES)
    : DEFAULT_EVIDENCE_CAP_BYTES;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export async function readD1EvidenceUsage(db: D1Database): Promise<{
  objectCount: number;
  retainedBytes: number;
}> {
  const row = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM sections_shadow_evidence_objects) +
        (SELECT COUNT(*) FROM sections_shadow_lane_payloads) AS object_count,
      (SELECT COALESCE(SUM(byte_length), 0) FROM sections_shadow_evidence_objects) +
        (SELECT COALESCE(SUM(byte_length), 0) FROM sections_shadow_lane_payloads) AS retained_bytes
  `).first<{ object_count: number; retained_bytes: number }>();
  return {
    objectCount: Number(row?.object_count ?? 0),
    retainedBytes: Number(row?.retained_bytes ?? 0),
  };
}

export async function pruneExpiredD1Evidence(
  db: D1Database,
  nowMs: number,
): Promise<number> {
  const results = await db.batch([
    db.prepare(`
      DELETE FROM sections_shadow_lane_payloads
      WHERE expires_at_ms <= ?
        AND NOT EXISTS (
          SELECT 1 FROM sections_shadow_epochs e
          WHERE e.epoch_id = sections_shadow_lane_payloads.epoch_id
            AND e.state = 'STAGED'
        )
    `).bind(nowMs),
    db.prepare(`
      DELETE FROM sections_shadow_evidence_objects
      WHERE expires_at_ms <= ?
        AND NOT EXISTS (
          SELECT 1 FROM sections_shadow_current_pointer p
          WHERE p.epoch_id = sections_shadow_evidence_objects.epoch_id
        )
    `).bind(nowMs),
  ]);
  return results.reduce((total, result) => total + Number(result.meta?.changes ?? 0), 0);
}

export async function prepareD1EvidenceCapacity(
  env: D1EvidenceEnv,
  nowMs: number,
): Promise<{ objectCount: number; retainedBytes: number; prunedObjects: number }> {
  const prunedObjects = await pruneExpiredD1Evidence(env.SHADOW_DB, nowMs);
  const usage = await readD1EvidenceUsage(env.SHADOW_DB);
  if (usage.retainedBytes + RESERVED_NEXT_EPOCH_BYTES > configuredEvidenceCap(env)) {
    await recordCapacityBlock(env.SHADOW_DB, nowMs);
    throw new ShadowCustodyError(
      'FREE_TIER_STORAGE_CAPACITY_EXHAUSTED',
      'D1 evidence storage cannot admit another shadow epoch within the 350 MB safety ceiling',
    );
  }
  return { ...usage, prunedObjects };
}

export async function readD1EvidenceObject(
  db: D1Database,
  objectKey: string,
): Promise<D1EvidenceObject | null> {
  return db.prepare(`
    SELECT * FROM sections_shadow_evidence_objects WHERE object_key = ?
  `).bind(objectKey).first<D1EvidenceObject>();
}

export async function putImmutableD1EvidenceObject(
  env: D1EvidenceEnv,
  input: {
    objectKey: string;
    epochId: string;
    body: string;
    schemaVersion: string;
    decisionOutputDigest: string;
    createdAtMs: number;
    expiresAtMs: number;
  },
): Promise<string> {
  const bodyBytes = byteLength(input.body);
  if (bodyBytes <= 0 || bodyBytes > MAX_NORMALIZED_OBJECT_BYTES) {
    throw new ShadowCustodyError(
      'EVIDENCE_OBJECT_TOO_LARGE',
      `Normalized evidence must be between 1 and ${MAX_NORMALIZED_OBJECT_BYTES} bytes`,
    );
  }
  const expectedDigest = await sha256Text(input.body);
  const existing = await readD1EvidenceObject(env.SHADOW_DB, input.objectKey);
  if (existing) {
    if (
      existing.epoch_id !== input.epochId ||
      existing.object_digest !== expectedDigest ||
      existing.content_json !== input.body
    ) {
      throw new ShadowCustodyError(
        'EVIDENCE_OBJECT_RETRY_CONFLICT',
        `Content-addressed D1 evidence ${input.objectKey} already has different content`,
      );
    }
    return expectedDigest;
  }

  const result = await env.SHADOW_DB.prepare(`
    INSERT INTO sections_shadow_evidence_objects (
      object_key, epoch_id, object_digest, schema_version,
      decision_output_digest, content_json, byte_length,
      created_at_ms, expires_at_ms
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE (
      SELECT
        (SELECT COALESCE(SUM(byte_length), 0) FROM sections_shadow_evidence_objects) +
        (SELECT COALESCE(SUM(byte_length), 0) FROM sections_shadow_lane_payloads)
    ) + ? <= ?
    ON CONFLICT(object_key) DO NOTHING
  `).bind(
    input.objectKey,
    input.epochId,
    expectedDigest,
    input.schemaVersion,
    input.decisionOutputDigest,
    input.body,
    bodyBytes,
    input.createdAtMs,
    input.expiresAtMs,
    bodyBytes,
    configuredEvidenceCap(env),
  ).run();
  if (Number(result.meta?.changes ?? 0) !== 1) {
    const raced = await readD1EvidenceObject(env.SHADOW_DB, input.objectKey);
    if (
      raced?.epoch_id === input.epochId &&
      raced.object_digest === expectedDigest &&
      raced.content_json === input.body
    ) return expectedDigest;
    await recordCapacityBlock(env.SHADOW_DB, input.createdAtMs);
    throw new ShadowCustodyError(
      'FREE_TIER_STORAGE_CAPACITY_EXHAUSTED',
      'D1 evidence object could not be stored inside the safety ceiling',
    );
  }
  return expectedDigest;
}
