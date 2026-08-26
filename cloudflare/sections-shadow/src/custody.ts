import {
  EXPECTED_SECTIONS_LANE_COUNT,
  SHADOW_DATASET_KEY,
  ShadowCustodyError,
  type DecisionEvidenceRow,
  type EpochStart,
  type LaneEvidence,
  type ShadowEpochRow,
  type ShadowPointerRow,
} from './contracts';
import { sha256Text } from './crypto';
import { prepareD1EvidenceCapacity, readD1EvidenceObject } from './evidenceStore';
import { reserveEpochCapacity } from './quota';

export interface CustodyEnv {
  SHADOW_DB: D1Database;
  SHADOW_MAX_EPOCHS_PER_DAY?: string;
  SHADOW_MAX_QUEUE_OPERATIONS_PER_DAY?: string;
  SHADOW_MAX_D1_READS_PER_DAY?: string;
  SHADOW_MAX_D1_WRITES_PER_DAY?: string;
  SHADOW_MAX_D1_EVIDENCE_BYTES?: string;
  SHADOW_MAX_WORKER_INVOCATIONS_PER_DAY?: string;
  SHADOW_MAX_BROWSER_MS_PER_DAY?: string;
  SHADOW_BROWSER_MS_RESERVATION_PER_EPOCH?: string;
}

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_DECISION_EVIDENCE_BYTES = 64_000;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function assertText(value: string, field: string): void {
  if (!value?.trim()) throw new ShadowCustodyError('INVALID_CUSTODY_INPUT', `${field} is required`);
}

function assertDigest(value: string | undefined, field: string): void {
  if (value !== undefined && !SHA256.test(value)) {
    throw new ShadowCustodyError('INVALID_CUSTODY_DIGEST', `${field} must be a lowercase SHA-256 digest`);
  }
}

function resultChanges(result: D1Result): number {
  return Number(result.meta?.changes || 0);
}

export async function readEpoch(db: D1Database, epochId: string): Promise<ShadowEpochRow | null> {
  return db.prepare(
    'SELECT * FROM sections_shadow_epochs WHERE epoch_id = ?',
  ).bind(epochId).first<ShadowEpochRow>();
}

export async function readCurrentShadow(
  db: D1Database,
): Promise<{ pointer: ShadowPointerRow; epoch: ShadowEpochRow } | null> {
  const row = await db.prepare(`
    SELECT
      p.dataset_key, p.epoch_id AS pointer_epoch_id, p.logical_slot AS pointer_logical_slot,
      p.generation, p.updated_at_ms,
      e.*
    FROM sections_shadow_current_pointer p
    JOIN sections_shadow_epochs e ON e.epoch_id = p.epoch_id
    WHERE p.dataset_key = ? AND e.state = 'SHADOW_COMMITTED'
  `).bind(SHADOW_DATASET_KEY).first<Record<string, unknown>>();
  if (!row) return null;
  return {
    pointer: {
      dataset_key: SHADOW_DATASET_KEY,
      epoch_id: String(row.pointer_epoch_id),
      logical_slot: Number(row.pointer_logical_slot),
      generation: Number(row.generation),
      updated_at_ms: Number(row.updated_at_ms),
    },
    epoch: {
      epoch_id: String(row.epoch_id),
      logical_slot: Number(row.logical_slot),
      scheduled_at_ms: Number(row.scheduled_at_ms),
      evaluation_now_ms: Number(row.evaluation_now_ms),
      attempt: Number(row.attempt),
      acquisition_mode: row.acquisition_mode as ShadowEpochRow['acquisition_mode'],
      state: row.state as ShadowEpochRow['state'],
      expected_lane_count: Number(row.expected_lane_count),
      terminal_lane_count: Number(row.terminal_lane_count),
      expected_decision_count: row.expected_decision_count === null
        ? null
        : Number(row.expected_decision_count),
      actual_decision_count: Number(row.actual_decision_count),
      source_registry_version: String(row.source_registry_version),
      source_registry_digest: String(row.source_registry_digest),
      input_evidence_digest: row.input_evidence_digest === null ? null : String(row.input_evidence_digest),
      decision_output_digest: row.decision_output_digest === null ? null : String(row.decision_output_digest),
      evidence_object_key: row.evidence_object_key === null ? null : String(row.evidence_object_key),
      evidence_object_digest: row.evidence_object_digest === null ? null : String(row.evidence_object_digest),
      evidence_verified: Number(row.evidence_verified),
      failure_code: row.failure_code === null ? null : String(row.failure_code),
      failure_message: row.failure_message === null ? null : String(row.failure_message),
      created_at_ms: Number(row.created_at_ms),
      sealed_at_ms: row.sealed_at_ms === null ? null : Number(row.sealed_at_ms),
      committed_at_ms: row.committed_at_ms === null ? null : Number(row.committed_at_ms),
      terminal_at_ms: row.terminal_at_ms === null ? null : Number(row.terminal_at_ms),
    },
  };
}

export async function startEpoch(env: CustodyEnv, input: EpochStart): Promise<ShadowEpochRow> {
  assertText(input.epochId, 'epochId');
  assertText(input.sourceRegistryVersion, 'sourceRegistryVersion');
  assertDigest(input.sourceRegistryDigest, 'sourceRegistryDigest');
  assertDigest(input.inputEvidenceDigest, 'inputEvidenceDigest');
  if (!Number.isInteger(input.logicalSlot) || input.logicalSlot < 0) {
    throw new ShadowCustodyError('INVALID_LOGICAL_SLOT', 'logicalSlot must be a non-negative integer');
  }
  if (input.expectedLaneCount !== EXPECTED_SECTIONS_LANE_COUNT) {
    throw new ShadowCustodyError(
      'SOURCE_REGISTRY_LANE_COUNT_MISMATCH',
      `Epoch requires exactly ${EXPECTED_SECTIONS_LANE_COUNT} terminal source lanes`,
    );
  }
  const existing = await readEpoch(env.SHADOW_DB, input.epochId);
  if (existing) {
    if (
      existing.logical_slot !== input.logicalSlot ||
      existing.attempt !== input.attempt ||
      existing.evaluation_now_ms !== input.evaluationNowMs ||
      existing.acquisition_mode !== input.acquisitionMode ||
      existing.source_registry_version !== input.sourceRegistryVersion ||
      existing.source_registry_digest !== input.sourceRegistryDigest ||
      (input.inputEvidenceDigest !== undefined &&
        existing.input_evidence_digest !== input.inputEvidenceDigest)
    ) {
      throw new ShadowCustodyError(
        'EPOCH_RETRY_CONFLICT',
        `At-least-once retry changed immutable contract for ${input.epochId}`,
      );
    }
    return existing;
  }
  const slotOwner = await env.SHADOW_DB.prepare(`
    SELECT epoch_id FROM sections_shadow_epochs
    WHERE logical_slot = ? AND attempt = ?
  `).bind(input.logicalSlot, input.attempt).first<{ epoch_id: string }>();
  if (slotOwner) {
    throw new ShadowCustodyError(
      'EPOCH_SLOT_CONFLICT',
      `Logical slot ${input.logicalSlot} attempt ${input.attempt} belongs to ${slotOwner.epoch_id}`,
    );
  }

  await prepareD1EvidenceCapacity(env, input.nowMs);
  await reserveEpochCapacity(env, input.nowMs);
  await env.SHADOW_DB.prepare(`
    INSERT INTO sections_shadow_epochs (
      epoch_id, logical_slot, scheduled_at_ms, evaluation_now_ms, attempt,
      acquisition_mode, state, expected_lane_count, source_registry_version,
      source_registry_digest, input_evidence_digest, created_at_ms,
      raw_evidence_expires_at_ms, normalized_evidence_expires_at_ms,
      summary_expires_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, 'STAGED', ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.epochId,
    input.logicalSlot,
    input.scheduledAtMs,
    input.evaluationNowMs,
    input.attempt,
    input.acquisitionMode,
    input.expectedLaneCount,
    input.sourceRegistryVersion,
    input.sourceRegistryDigest,
    input.inputEvidenceDigest ?? null,
    input.nowMs,
    input.nowMs + 36 * HOUR_MS,
    input.nowMs + 7 * DAY_MS,
    input.nowMs + 30 * DAY_MS,
  ).run();
  const created = await readEpoch(env.SHADOW_DB, input.epochId);
  if (!created) throw new ShadowCustodyError('EPOCH_CREATE_FAILED', 'Staged epoch was not persisted');
  return created;
}

export async function stageLaneEvidence(env: CustodyEnv, lane: LaneEvidence): Promise<void> {
  assertText(lane.epochId, 'lane.epochId');
  assertText(lane.laneId, 'lane.laneId');
  assertDigest(lane.feedUrlDigest, 'lane.feedUrlDigest');
  assertDigest(lane.evidenceDigest, 'lane.evidenceDigest');
  const existing = await env.SHADOW_DB.prepare(`
    SELECT evidence_digest, disposition, item_count
    FROM sections_shadow_lane_evidence
    WHERE epoch_id = ? AND lane_id = ?
  `).bind(lane.epochId, lane.laneId).first<{
    evidence_digest: string;
    disposition: string;
    item_count: number;
  }>();
  if (existing) {
    if (
      existing.evidence_digest !== lane.evidenceDigest ||
      existing.disposition !== lane.disposition ||
      Number(existing.item_count) !== lane.itemCount
    ) {
      throw new ShadowCustodyError(
        'LANE_RETRY_CONFLICT',
        `At-least-once retry changed evidence for ${lane.laneId}`,
      );
    }
    return;
  }

  const results = await env.SHADOW_DB.batch([
    env.SHADOW_DB.prepare(`
      INSERT INTO sections_shadow_lane_evidence (
        epoch_id, lane_id, section_key, source_group, source_name,
        feed_url_digest, disposition, item_count, evidence_digest,
        evidence_object_key, attempt_count, http_status, duration_ms,
        error_code, observed_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      lane.epochId,
      lane.laneId,
      lane.sectionKey,
      lane.sourceGroup,
      lane.sourceName,
      lane.feedUrlDigest,
      lane.disposition,
      lane.itemCount,
      lane.evidenceDigest,
      lane.evidenceObjectKey ?? null,
      lane.attemptCount,
      lane.httpStatus ?? null,
      lane.durationMs ?? null,
      lane.errorCode ?? null,
      lane.observedAtMs,
    ),
    env.SHADOW_DB.prepare(`
      UPDATE sections_shadow_epochs
      SET terminal_lane_count = (
        SELECT COUNT(*) FROM sections_shadow_lane_evidence WHERE epoch_id = ?
      )
      WHERE epoch_id = ? AND state = 'STAGED'
    `).bind(lane.epochId, lane.epochId),
  ]);
  if (resultChanges(results[0]) !== 1 || resultChanges(results[1]) !== 1) {
    throw new ShadowCustodyError('LANE_STAGE_FAILED', `Could not stage lane ${lane.laneId}`);
  }
}

function laneJsonValue(lane: LaneEvidence): Record<string, unknown> {
  assertText(lane.epochId, 'lane.epochId');
  assertText(lane.laneId, 'lane.laneId');
  assertDigest(lane.feedUrlDigest, 'lane.feedUrlDigest');
  assertDigest(lane.evidenceDigest, 'lane.evidenceDigest');
  return {
    epochId: lane.epochId,
    laneId: lane.laneId,
    sectionKey: lane.sectionKey,
    sourceGroup: lane.sourceGroup,
    sourceName: lane.sourceName,
    feedUrlDigest: lane.feedUrlDigest,
    disposition: lane.disposition,
    itemCount: lane.itemCount,
    evidenceDigest: lane.evidenceDigest,
    evidenceObjectKey: lane.evidenceObjectKey ?? null,
    attemptCount: lane.attemptCount,
    httpStatus: lane.httpStatus ?? null,
    durationMs: lane.durationMs ?? null,
    errorCode: lane.errorCode ?? null,
    observedAtMs: lane.observedAtMs,
  };
}

export async function stageLaneEvidenceBatch(
  env: CustodyEnv,
  lanes: LaneEvidence[],
): Promise<void> {
  if (lanes.length === 0) return;
  const rows = lanes.map(laneJsonValue);
  const epochId = String(rows[0].epochId);
  if (rows.some(row => row.epochId !== epochId)) {
    throw new ShadowCustodyError('LANE_BATCH_EPOCH_MISMATCH', 'Lane batch spans multiple epochs');
  }
  if (new Set(rows.map(row => row.laneId)).size !== rows.length) {
    throw new ShadowCustodyError('LANE_BATCH_DUPLICATE', 'Lane batch contains duplicate lane IDs');
  }
  await env.SHADOW_DB.batch([
    env.SHADOW_DB.prepare(`
      INSERT INTO sections_shadow_lane_evidence (
        epoch_id, lane_id, section_key, source_group, source_name,
        feed_url_digest, disposition, item_count, evidence_digest,
        evidence_object_key, attempt_count, http_status, duration_ms,
        error_code, observed_at_ms
      )
      SELECT
        json_extract(value, '$.epochId'),
        json_extract(value, '$.laneId'),
        json_extract(value, '$.sectionKey'),
        json_extract(value, '$.sourceGroup'),
        json_extract(value, '$.sourceName'),
        json_extract(value, '$.feedUrlDigest'),
        json_extract(value, '$.disposition'),
        CAST(json_extract(value, '$.itemCount') AS INTEGER),
        json_extract(value, '$.evidenceDigest'),
        json_extract(value, '$.evidenceObjectKey'),
        CAST(json_extract(value, '$.attemptCount') AS INTEGER),
        CAST(json_extract(value, '$.httpStatus') AS INTEGER),
        CAST(json_extract(value, '$.durationMs') AS INTEGER),
        json_extract(value, '$.errorCode'),
        CAST(json_extract(value, '$.observedAtMs') AS INTEGER)
      FROM json_each(?)
      WHERE true
      ON CONFLICT(epoch_id, lane_id) DO UPDATE SET
        attempt_count = MAX(sections_shadow_lane_evidence.attempt_count, excluded.attempt_count)
      WHERE sections_shadow_lane_evidence.section_key = excluded.section_key
        AND sections_shadow_lane_evidence.source_group = excluded.source_group
        AND sections_shadow_lane_evidence.source_name = excluded.source_name
        AND sections_shadow_lane_evidence.feed_url_digest = excluded.feed_url_digest
        AND sections_shadow_lane_evidence.disposition = excluded.disposition
        AND sections_shadow_lane_evidence.item_count = excluded.item_count
        AND sections_shadow_lane_evidence.evidence_digest = excluded.evidence_digest
        AND sections_shadow_lane_evidence.evidence_object_key IS excluded.evidence_object_key
    `).bind(JSON.stringify(rows)),
    env.SHADOW_DB.prepare(`
      UPDATE sections_shadow_epochs
      SET terminal_lane_count = (
        SELECT COUNT(*) FROM sections_shadow_lane_evidence WHERE epoch_id = ?
      )
      WHERE epoch_id = ? AND state = 'STAGED'
    `).bind(epochId, epochId),
  ]);

  const persisted = await env.SHADOW_DB.prepare(`
    SELECT lane_id, section_key, source_group, source_name, feed_url_digest,
      disposition, item_count, evidence_digest, evidence_object_key
    FROM sections_shadow_lane_evidence WHERE epoch_id = ?
  `).bind(epochId).all<Record<string, unknown>>();
  const byId = new Map(persisted.results.map(row => [String(row.lane_id), row]));
  const conflict = rows.find(row => {
    const stored = byId.get(String(row.laneId));
    return !stored ||
      stored.section_key !== row.sectionKey ||
      stored.source_group !== row.sourceGroup ||
      stored.source_name !== row.sourceName ||
      stored.feed_url_digest !== row.feedUrlDigest ||
      stored.disposition !== row.disposition ||
      Number(stored.item_count) !== row.itemCount ||
      stored.evidence_digest !== row.evidenceDigest ||
      (stored.evidence_object_key ?? null) !== row.evidenceObjectKey;
  });
  if (conflict) {
    throw new ShadowCustodyError(
      'LANE_RETRY_CONFLICT',
      `At-least-once retry changed evidence for ${String(conflict.laneId)}`,
    );
  }
}

export async function stageDecisionEvidence(
  env: CustodyEnv,
  decision: DecisionEvidenceRow,
): Promise<void> {
  assertDigest(decision.evidenceDigest, 'decision.evidenceDigest');
  if (byteLength(decision.evidenceJson) > MAX_DECISION_EVIDENCE_BYTES) {
    throw new ShadowCustodyError(
      'DECISION_EVIDENCE_TOO_LARGE',
      `Decision evidence exceeds ${MAX_DECISION_EVIDENCE_BYTES} bytes`,
    );
  }
  const existing = await env.SHADOW_DB.prepare(`
    SELECT evidence_digest FROM sections_shadow_decisions
    WHERE epoch_id = ? AND candidate_identity = ?
  `).bind(decision.epochId, decision.candidateIdentity).first<{ evidence_digest: string }>();
  if (existing) {
    if (existing.evidence_digest !== decision.evidenceDigest) {
      throw new ShadowCustodyError(
        'DECISION_RETRY_CONFLICT',
        `At-least-once retry changed decision evidence for ${decision.candidateIdentity}`,
      );
    }
    return;
  }

  const results = await env.SHADOW_DB.batch([
    env.SHADOW_DB.prepare(`
      INSERT INTO sections_shadow_decisions (
        epoch_id, candidate_identity, authoritative_rank, selected_position,
        displayed_position, evidence_digest, evidence_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      decision.epochId,
      decision.candidateIdentity,
      decision.authoritativeRank,
      decision.selectedPosition ?? null,
      decision.displayedPosition ?? null,
      decision.evidenceDigest,
      decision.evidenceJson,
    ),
    env.SHADOW_DB.prepare(`
      UPDATE sections_shadow_epochs
      SET actual_decision_count = (
        SELECT COUNT(*) FROM sections_shadow_decisions WHERE epoch_id = ?
      )
      WHERE epoch_id = ? AND state = 'STAGED'
    `).bind(decision.epochId, decision.epochId),
  ]);
  if (resultChanges(results[0]) !== 1 || resultChanges(results[1]) !== 1) {
    throw new ShadowCustodyError(
      'DECISION_STAGE_FAILED',
      `Could not stage decision ${decision.candidateIdentity}`,
    );
  }
}

export async function stageDecisionEvidenceBatch(
  env: CustodyEnv,
  decisions: DecisionEvidenceRow[],
): Promise<void> {
  if (decisions.length === 0) return;
  const rows = decisions.map(decision => {
    assertDigest(decision.evidenceDigest, 'decision.evidenceDigest');
    if (byteLength(decision.evidenceJson) > MAX_DECISION_EVIDENCE_BYTES) {
      throw new ShadowCustodyError(
        'DECISION_EVIDENCE_TOO_LARGE',
        `Decision evidence exceeds ${MAX_DECISION_EVIDENCE_BYTES} bytes`,
      );
    }
    return {
      epochId: decision.epochId,
      candidateIdentity: decision.candidateIdentity,
      authoritativeRank: decision.authoritativeRank,
      selectedPosition: decision.selectedPosition ?? null,
      displayedPosition: decision.displayedPosition ?? null,
      evidenceDigest: decision.evidenceDigest,
      evidenceJson: decision.evidenceJson,
    };
  });
  const epochId = rows[0].epochId;
  if (rows.some(row => row.epochId !== epochId)) {
    throw new ShadowCustodyError('DECISION_BATCH_EPOCH_MISMATCH', 'Decision batch spans multiple epochs');
  }
  if (new Set(rows.map(row => row.candidateIdentity)).size !== rows.length) {
    throw new ShadowCustodyError('DECISION_BATCH_DUPLICATE', 'Decision batch contains duplicate identities');
  }
  await env.SHADOW_DB.batch([
    env.SHADOW_DB.prepare(`
      INSERT INTO sections_shadow_decisions (
        epoch_id, candidate_identity, authoritative_rank, selected_position,
        displayed_position, evidence_digest, evidence_json
      )
      SELECT
        json_extract(value, '$.epochId'),
        json_extract(value, '$.candidateIdentity'),
        CAST(json_extract(value, '$.authoritativeRank') AS INTEGER),
        CAST(json_extract(value, '$.selectedPosition') AS INTEGER),
        CAST(json_extract(value, '$.displayedPosition') AS INTEGER),
        json_extract(value, '$.evidenceDigest'),
        json_extract(value, '$.evidenceJson')
      FROM json_each(?)
      WHERE true
      ON CONFLICT(epoch_id, candidate_identity) DO UPDATE SET
        evidence_digest = sections_shadow_decisions.evidence_digest
      WHERE sections_shadow_decisions.authoritative_rank = excluded.authoritative_rank
        AND sections_shadow_decisions.selected_position IS excluded.selected_position
        AND sections_shadow_decisions.displayed_position IS excluded.displayed_position
        AND sections_shadow_decisions.evidence_digest = excluded.evidence_digest
        AND sections_shadow_decisions.evidence_json = excluded.evidence_json
    `).bind(JSON.stringify(rows)),
    env.SHADOW_DB.prepare(`
      UPDATE sections_shadow_epochs
      SET actual_decision_count = (
        SELECT COUNT(*) FROM sections_shadow_decisions WHERE epoch_id = ?
      )
      WHERE epoch_id = ? AND state = 'STAGED'
    `).bind(epochId, epochId),
  ]);

  const persisted = await env.SHADOW_DB.prepare(`
    SELECT candidate_identity, authoritative_rank, selected_position,
      displayed_position, evidence_digest, evidence_json
    FROM sections_shadow_decisions WHERE epoch_id = ?
  `).bind(epochId).all<Record<string, unknown>>();
  const byId = new Map(persisted.results.map(row => [String(row.candidate_identity), row]));
  const conflict = rows.find(row => {
    const stored = byId.get(row.candidateIdentity);
    return !stored ||
      Number(stored.authoritative_rank) !== row.authoritativeRank ||
      (stored.selected_position === null ? null : Number(stored.selected_position)) !== row.selectedPosition ||
      (stored.displayed_position === null ? null : Number(stored.displayed_position)) !== row.displayedPosition ||
      stored.evidence_digest !== row.evidenceDigest ||
      stored.evidence_json !== row.evidenceJson;
  });
  if (conflict) {
    throw new ShadowCustodyError(
      'DECISION_RETRY_CONFLICT',
      `At-least-once retry changed decision evidence for ${conflict.candidateIdentity}`,
    );
  }
}

export async function attachDecisionObject(
  env: CustodyEnv,
  input: {
    epochId: string;
    objectKey: string;
    objectDigest: string;
    decisionOutputDigest: string;
    expectedDecisionCount: number;
  },
): Promise<void> {
  assertDigest(input.objectDigest, 'objectDigest');
  assertDigest(input.decisionOutputDigest, 'decisionOutputDigest');
  const result = await env.SHADOW_DB.prepare(`
    UPDATE sections_shadow_epochs
    SET evidence_object_key = ?, evidence_object_digest = ?,
      decision_output_digest = ?, expected_decision_count = ?
    WHERE epoch_id = ? AND state = 'STAGED'
      AND (evidence_object_digest IS NULL OR evidence_object_digest = ?)
      AND (decision_output_digest IS NULL OR decision_output_digest = ?)
  `).bind(
    input.objectKey,
    input.objectDigest,
    input.decisionOutputDigest,
    input.expectedDecisionCount,
    input.epochId,
    input.objectDigest,
    input.decisionOutputDigest,
  ).run();
  if (resultChanges(result) !== 1) {
    throw new ShadowCustodyError('DECISION_OBJECT_CONFLICT', 'Decision evidence attachment failed');
  }
}

export async function attachLiveInputDigest(
  env: CustodyEnv,
  epochId: string,
  inputEvidenceDigest: string,
): Promise<void> {
  assertDigest(inputEvidenceDigest, 'inputEvidenceDigest');
  const result = await env.SHADOW_DB.prepare(`
    UPDATE sections_shadow_epochs
    SET input_evidence_digest = ?
    WHERE epoch_id = ? AND state = 'STAGED'
      AND acquisition_mode = 'INDEPENDENT_LIVE'
      AND (input_evidence_digest IS NULL OR input_evidence_digest = ?)
  `).bind(inputEvidenceDigest, epochId, inputEvidenceDigest).run();
  if (resultChanges(result) !== 1) {
    throw new ShadowCustodyError(
      'LIVE_INPUT_DIGEST_CONFLICT',
      `Live input evidence changed for ${epochId}`,
    );
  }
}

export async function sealEpoch(env: CustodyEnv, epochId: string, nowMs: number): Promise<ShadowEpochRow> {
  const epoch = await readEpoch(env.SHADOW_DB, epochId);
  if (!epoch) throw new ShadowCustodyError('EPOCH_NOT_FOUND', `Unknown epoch ${epochId}`);
  if (epoch.state === 'SEALED' || epoch.state === 'SHADOW_COMMITTED') return epoch;
  if (epoch.state !== 'STAGED') {
    throw new ShadowCustodyError('EPOCH_NOT_SEALABLE', `Epoch ${epochId} is ${epoch.state}`);
  }
  if (epoch.terminal_lane_count !== epoch.expected_lane_count) {
    throw new ShadowCustodyError(
      'INCOMPLETE_LANE_CARDINALITY',
      `Epoch ${epochId} has ${epoch.terminal_lane_count}/${epoch.expected_lane_count} terminal lanes`,
    );
  }
  if (
    epoch.expected_decision_count === null ||
    epoch.actual_decision_count !== epoch.expected_decision_count
  ) {
    throw new ShadowCustodyError(
      'INCOMPLETE_DECISION_CARDINALITY',
      `Epoch ${epochId} has ${epoch.actual_decision_count}/${epoch.expected_decision_count ?? 'unset'} decisions`,
    );
  }
  if (!epoch.evidence_object_key || !epoch.evidence_object_digest || !epoch.decision_output_digest) {
    throw new ShadowCustodyError('EVIDENCE_OBJECT_MISSING', 'Epoch decision evidence is not attached');
  }
  const object = await readD1EvidenceObject(env.SHADOW_DB, epoch.evidence_object_key);
  if (!object) throw new ShadowCustodyError('EVIDENCE_OBJECT_MISSING', 'Epoch evidence object is absent');
  const objectText = object.content_json;
  const actualDigest = await sha256Text(objectText);
  if (actualDigest !== epoch.evidence_object_digest) {
    throw new ShadowCustodyError('EVIDENCE_OBJECT_DIGEST_MISMATCH', 'Epoch evidence object failed digest verification');
  }
  if (object.epoch_id !== epochId || object.object_digest !== actualDigest) {
    throw new ShadowCustodyError(
      'EVIDENCE_OBJECT_CONTRACT_MISMATCH',
      'Epoch evidence object does not match its immutable D1 custody record',
    );
  }
  let parsed: { decisionOutputDigest?: string; candidateCount?: number };
  try {
    parsed = JSON.parse(objectText) as typeof parsed;
  } catch {
    throw new ShadowCustodyError('EVIDENCE_OBJECT_INVALID', 'Epoch evidence object is not valid JSON');
  }
  if (
    parsed.decisionOutputDigest !== epoch.decision_output_digest ||
    parsed.candidateCount !== epoch.expected_decision_count
  ) {
    throw new ShadowCustodyError(
      'EVIDENCE_OBJECT_CONTRACT_MISMATCH',
      'Epoch evidence object does not match sealed decision metadata',
    );
  }

  const result = await env.SHADOW_DB.prepare(`
    UPDATE sections_shadow_epochs
    SET state = 'SEALED', evidence_verified = 1, sealed_at_ms = ?
    WHERE epoch_id = ? AND state = 'STAGED'
      AND terminal_lane_count = expected_lane_count
      AND actual_decision_count = expected_decision_count
      AND evidence_object_key IS NOT NULL
      AND evidence_object_digest = ?
  `).bind(nowMs, epochId, actualDigest).run();
  if (resultChanges(result) !== 1) {
    throw new ShadowCustodyError('EPOCH_SEAL_RACE', 'Epoch changed before it could be sealed');
  }
  const sealed = await readEpoch(env.SHADOW_DB, epochId);
  if (!sealed) throw new ShadowCustodyError('EPOCH_NOT_FOUND', `Unknown epoch ${epochId}`);
  return sealed;
}

export async function commitEpoch(
  env: CustodyEnv,
  epochId: string,
  nowMs: number,
): Promise<{ epoch: ShadowEpochRow; pointer: ShadowPointerRow }> {
  const epoch = await readEpoch(env.SHADOW_DB, epochId);
  if (!epoch) throw new ShadowCustodyError('EPOCH_NOT_FOUND', `Unknown epoch ${epochId}`);
  if (epoch.state === 'SHADOW_COMMITTED') {
    const current = await readCurrentShadow(env.SHADOW_DB);
    if (!current) {
      throw new ShadowCustodyError('COMMITTED_POINTER_MISSING', 'No current shadow pointer exists');
    }
    return { epoch, pointer: current.pointer };
  }
  if (epoch.state !== 'SEALED') {
    throw new ShadowCustodyError('EPOCH_NOT_COMMITTABLE', `Epoch ${epochId} is ${epoch.state}`);
  }

  await env.SHADOW_DB.batch([
    env.SHADOW_DB.prepare(`
      UPDATE sections_shadow_epochs
      SET state = 'SHADOW_COMMITTED', committed_at_ms = ?, terminal_at_ms = ?
      WHERE epoch_id = ? AND state = 'SEALED' AND evidence_verified = 1
        AND terminal_lane_count = expected_lane_count
        AND actual_decision_count = expected_decision_count
        AND NOT EXISTS (
          SELECT 1 FROM sections_shadow_current_pointer
          WHERE dataset_key = ? AND logical_slot >= ?
        )
    `).bind(nowMs, nowMs, epochId, SHADOW_DATASET_KEY, epoch.logical_slot),
    env.SHADOW_DB.prepare(`
      INSERT INTO sections_shadow_current_pointer (
        dataset_key, epoch_id, logical_slot, generation, updated_at_ms
      )
      SELECT ?, epoch_id, logical_slot, 1, ?
      FROM sections_shadow_epochs
      WHERE epoch_id = ? AND state = 'SHADOW_COMMITTED'
      ON CONFLICT(dataset_key) DO UPDATE SET
        epoch_id = excluded.epoch_id,
        logical_slot = excluded.logical_slot,
        generation = sections_shadow_current_pointer.generation + 1,
        updated_at_ms = excluded.updated_at_ms
      WHERE excluded.logical_slot > sections_shadow_current_pointer.logical_slot
    `).bind(SHADOW_DATASET_KEY, nowMs, epochId),
  ]);

  const after = await readEpoch(env.SHADOW_DB, epochId);
  const current = await readCurrentShadow(env.SHADOW_DB);
  if (after?.state === 'SHADOW_COMMITTED' && current?.epoch.epoch_id === epochId) return current;

  if (after?.state === 'SEALED') {
    await env.SHADOW_DB.prepare(`
      UPDATE sections_shadow_epochs
      SET state = 'REJECTED', failure_code = 'OUT_OF_ORDER_EPOCH',
        failure_message = 'A newer or equal logical slot is already current',
        terminal_at_ms = ?, raw_evidence_expires_at_ms = ?
      WHERE epoch_id = ? AND state = 'SEALED'
    `).bind(nowMs, nowMs + 7 * DAY_MS, epochId).run();
    throw new ShadowCustodyError(
      'OUT_OF_ORDER_EPOCH',
      `Epoch ${epochId} cannot replace an equal or newer shadow epoch`,
    );
  }
  throw new ShadowCustodyError('EPOCH_COMMIT_FAILED', `Epoch ${epochId} did not commit atomically`);
}

export async function abortEpoch(
  env: CustodyEnv,
  epochId: string,
  code: string,
  message: string,
  nowMs: number,
): Promise<void> {
  const result = await env.SHADOW_DB.prepare(`
    UPDATE sections_shadow_epochs
    SET state = 'ABORTED', failure_code = ?, failure_message = ?, terminal_at_ms = ?,
      raw_evidence_expires_at_ms = ?
    WHERE epoch_id = ? AND state = 'STAGED'
  `).bind(code, message.slice(0, 500), nowMs, nowMs + 7 * DAY_MS, epochId).run();
  if (resultChanges(result) !== 1) {
    throw new ShadowCustodyError('EPOCH_NOT_ABORTABLE', `Epoch ${epochId} is not staged`);
  }
}
