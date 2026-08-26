import { digestCanonicalJson } from '../../../scripts/top-stories-shadow/canonicalJson.mjs';
import {
  normalizeSnapshot,
  normalizeSnapshotItem,
  normalizeSnapshotPartition,
  normalizeSourceRun,
  resultChanges,
  SECTIONS_SHADOW_POINTER_NAME,
  SNAPSHOT_STATES,
  SOURCE_RUN_STATES,
  SectionsShadowStoreError,
} from './contracts.js';

const COMPLETE_PARTITION_PREDICATE = `
  AND s.expected_section_count = (
    SELECT COUNT(*)
    FROM section_snapshot_partitions p
    WHERE p.snapshot_id = s.snapshot_id
  )
  AND s.expected_item_count = (
    SELECT COUNT(*)
    FROM section_snapshot_items i
    WHERE i.snapshot_id = s.snapshot_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM section_snapshot_partitions p
    WHERE p.snapshot_id = s.snapshot_id
      AND p.expected_item_count <> (
        SELECT COUNT(*)
        FROM section_snapshot_items i
        WHERE i.snapshot_id = s.snapshot_id
          AND i.section_key = p.section_key
      )
  )`;

const CURRENT_SNAPSHOT_SQL = `
SELECT s.*
FROM current_snapshot_pointer p
JOIN section_snapshots s ON s.snapshot_id = p.snapshot_id
JOIN source_runs r ON r.run_id = s.run_id
WHERE p.pointer_name = ?
  AND s.state = 'COMMITTED'
  AND r.state = 'COMPLETE'
  ${COMPLETE_PARTITION_PREDICATE}
LIMIT 1`;

function assertDb(db) {
  if (!db?.prepare || !db?.batch) {
    throw new SectionsShadowStoreError(
      'shadow_store_unavailable',
      'Sections shadow D1 binding is required',
    );
  }
}

function asJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sameAuthority(existing, expected, fields, code) {
  for (const [column, property] of fields) {
    if (String(existing?.[column] ?? '') !== String(expected?.[property] ?? '')) {
      throw new SectionsShadowStoreError(
        code,
        `Existing record disagrees on ${column}`,
        { column, existing: existing?.[column], expected: expected?.[property] },
      );
    }
  }
}

export function canonicalSnapshotPartitionsForDigest(partitions = []) {
  return [...partitions]
    .map(partition => ({
      sectionKey: partition.sectionKey,
      expectedItemCount: Number(partition.expectedItemCount),
    }))
    .sort((a, b) => a.sectionKey.localeCompare(b.sectionKey));
}

export function canonicalSnapshotItemsForDigest(items = []) {
  return [...items]
    .map(item => ({
      sectionKey: item.sectionKey,
      position: Number(item.position),
      storyId: item.storyId,
      sourceFamily: item.sourceFamily,
      storyJson: item.storyJson,
    }))
    .sort((a, b) => a.sectionKey.localeCompare(b.sectionKey) || a.position - b.position);
}

export async function createSourceRun(db, input) {
  assertDb(db);
  const run = normalizeSourceRun(input);
  await db.prepare(`
    INSERT INTO source_runs (
      run_id, scheduled_at, acquisition_started_at, acquisition_completed_at,
      code_commit_sha, source_registry_version, source_registry_digest,
      input_evidence_digest, state, failure_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id) DO NOTHING
  `).bind(
    run.runId,
    run.scheduledAt,
    run.acquisitionStartedAt,
    run.acquisitionCompletedAt,
    run.codeCommitSha,
    run.sourceRegistryVersion,
    run.sourceRegistryDigest,
    run.inputEvidenceDigest,
    run.state,
    run.failureReason,
  ).run();

  const existing = await db.prepare('SELECT * FROM source_runs WHERE run_id = ? LIMIT 1')
    .bind(run.runId).first();
  if (!existing) throw new SectionsShadowStoreError('source_run_insert_failed', 'Source run was not stored');
  sameAuthority(existing, run, [
    ['scheduled_at', 'scheduledAt'],
    ['code_commit_sha', 'codeCommitSha'],
    ['source_registry_version', 'sourceRegistryVersion'],
    ['source_registry_digest', 'sourceRegistryDigest'],
  ], 'source_run_identity_conflict');
  return existing;
}

export async function recordSourceFetchEvidence(db, input = {}) {
  assertDb(db);
  const runId = String(input.runId || '').trim();
  const sectionKey = String(input.sectionKey || '').trim();
  const laneKey = String(input.laneKey || '').trim();
  const sourceGroup = String(input.sourceGroup || '').trim();
  const sourceFamily = String(input.sourceFamily || '').trim();
  const startedAt = String(input.startedAt || '').trim();
  const state = String(input.state || '').trim();
  if (!runId || !sectionKey || !laneKey || !sourceGroup || !sourceFamily || !startedAt || !state) {
    throw new SectionsShadowStoreError(
      'source_evidence_field_missing',
      'runId/sectionKey/laneKey/sourceGroup/sourceFamily/startedAt/state are required',
    );
  }
  await db.prepare(`
    INSERT INTO source_fetch_evidence (
      run_id, section_key, lane_key, source_group, source_family, feed_url,
      http_status, item_count, payload_sha256, started_at, completed_at, state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id, section_key, lane_key) DO UPDATE SET
      source_group = excluded.source_group,
      source_family = excluded.source_family,
      feed_url = excluded.feed_url,
      http_status = excluded.http_status,
      item_count = excluded.item_count,
      payload_sha256 = excluded.payload_sha256,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at,
      state = excluded.state
    WHERE NOT EXISTS (
      SELECT 1 FROM source_runs r
      WHERE r.run_id = excluded.run_id AND r.state = 'COMPLETE'
    )
  `).bind(
    runId,
    sectionKey,
    laneKey,
    sourceGroup,
    sourceFamily,
    input.feedUrl || null,
    input.httpStatus ?? null,
    Number(input.itemCount || 0),
    input.payloadSha256 || null,
    startedAt,
    input.completedAt || null,
    state,
  ).run();
}

export async function completeSourceRun(db, runId, input = {}) {
  assertDb(db);
  const result = await db.prepare(`
    UPDATE source_runs
    SET state = 'COMPLETE',
        acquisition_completed_at = ?,
        input_evidence_digest = ?,
        failure_reason = NULL
    WHERE run_id = ? AND state = 'RUNNING'
  `).bind(
    input.acquisitionCompletedAt,
    input.inputEvidenceDigest,
    runId,
  ).run();
  if (resultChanges(result) === 1) return { state: SOURCE_RUN_STATES.COMPLETE, changed: true };
  const existing = await db.prepare('SELECT state, input_evidence_digest FROM source_runs WHERE run_id = ?')
    .bind(runId).first();
  if (existing?.state === SOURCE_RUN_STATES.COMPLETE &&
      existing?.input_evidence_digest === input.inputEvidenceDigest) {
    return { state: SOURCE_RUN_STATES.COMPLETE, changed: false };
  }
  throw new SectionsShadowStoreError('source_run_complete_failed', 'Source run could not be completed');
}

export async function stageSnapshot(db, input) {
  assertDb(db);
  const snapshot = normalizeSnapshot(input);
  await db.prepare(`
    INSERT INTO section_snapshots (
      snapshot_id, run_id, snapshot_schema_version, created_at, sealed_at, committed_at,
      source_registry_version, source_registry_digest, source_identity_version,
      normalization_version, normalization_digest, event_classifier_version,
      ranker_version, ranker_policy_digest, input_evidence_digest,
      decision_output_digest, expected_section_count, expected_item_count,
      expected_partition_digest, expected_item_rows_digest, state, failure_reason
    ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(snapshot_id) DO NOTHING
  `).bind(
    snapshot.snapshotId,
    snapshot.runId,
    snapshot.snapshotSchemaVersion,
    snapshot.createdAt,
    snapshot.sourceRegistryVersion,
    snapshot.sourceRegistryDigest,
    snapshot.sourceIdentityVersion,
    snapshot.normalizationVersion,
    snapshot.normalizationDigest,
    snapshot.eventClassifierVersion,
    snapshot.rankerVersion,
    snapshot.rankerPolicyDigest,
    snapshot.inputEvidenceDigest,
    snapshot.decisionOutputDigest,
    snapshot.expectedSectionCount,
    snapshot.expectedItemCount,
    snapshot.expectedPartitionDigest,
    snapshot.expectedItemRowsDigest,
    snapshot.state,
    snapshot.failureReason,
  ).run();

  const existing = await db.prepare('SELECT * FROM section_snapshots WHERE snapshot_id = ? LIMIT 1')
    .bind(snapshot.snapshotId).first();
  if (!existing) throw new SectionsShadowStoreError('snapshot_stage_failed', 'Snapshot was not staged');
  sameAuthority(existing, snapshot, [
    ['run_id', 'runId'],
    ['source_registry_digest', 'sourceRegistryDigest'],
    ['normalization_digest', 'normalizationDigest'],
    ['ranker_policy_digest', 'rankerPolicyDigest'],
    ['input_evidence_digest', 'inputEvidenceDigest'],
    ['decision_output_digest', 'decisionOutputDigest'],
    ['expected_section_count', 'expectedSectionCount'],
    ['expected_item_count', 'expectedItemCount'],
    ['expected_partition_digest', 'expectedPartitionDigest'],
    ['expected_item_rows_digest', 'expectedItemRowsDigest'],
  ], 'snapshot_identity_conflict');
  return existing;
}

export async function stageSnapshotPartitions(db, snapshotId, partitions = []) {
  assertDb(db);
  const normalized = partitions.map(partition => normalizeSnapshotPartition(snapshotId, partition));
  const statement = db.prepare(`
    INSERT INTO section_snapshot_partitions (
      snapshot_id, section_key, expected_item_count
    ) VALUES (?, ?, ?)
    ON CONFLICT(snapshot_id, section_key) DO NOTHING
  `);
  if (normalized.length > 0) {
    await db.batch(normalized.map(partition => statement.bind(
      partition.snapshotId,
      partition.sectionKey,
      partition.expectedItemCount,
    )));
  }
  const result = await db.prepare(`
    SELECT section_key, expected_item_count
    FROM section_snapshot_partitions
    WHERE snapshot_id = ?
    ORDER BY section_key ASC
  `).bind(snapshotId).all();
  const existing = (result?.results || []).map(row => ({
    sectionKey: row.section_key,
    expectedItemCount: Number(row.expected_item_count),
  }));
  const expected = canonicalSnapshotPartitionsForDigest(normalized);
  const actual = canonicalSnapshotPartitionsForDigest(existing);
  if (digestCanonicalJson(actual) !== digestCanonicalJson(expected)) {
    throw new SectionsShadowStoreError(
      'snapshot_partition_identity_conflict',
      'Persisted snapshot partitions disagree with the requested partition authority',
    );
  }
  return actual;
}

export async function writeSnapshotItems(db, snapshotId, items = [], options = {}) {
  assertDb(db);
  const batchSize = Math.max(1, Math.min(250, Number(options.batchSize || 100)));
  const normalized = items.map(item => normalizeSnapshotItem(snapshotId, item));
  const statement = db.prepare(`
    INSERT INTO section_snapshot_items (
      snapshot_id, section_key, position, story_id, source_family, story_json
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(snapshot_id, section_key, position) DO NOTHING
  `);
  for (let index = 0; index < normalized.length; index += batchSize) {
    const chunk = normalized.slice(index, index + batchSize);
    await db.batch(chunk.map(item => statement.bind(
      item.snapshotId,
      item.sectionKey,
      item.position,
      item.storyId,
      item.sourceFamily,
      item.storyJson,
    )));
  }
  return normalized.length;
}

export async function inspectSnapshot(db, snapshotId) {
  assertDb(db);
  const snapshot = await db.prepare(`
    SELECT s.*, r.state AS run_state
    FROM section_snapshots s
    JOIN source_runs r ON r.run_id = s.run_id
    WHERE s.snapshot_id = ?
    LIMIT 1
  `).bind(snapshotId).first();
  if (!snapshot) return null;
  const counts = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM section_snapshot_partitions p WHERE p.snapshot_id = ?) AS section_count,
      (SELECT COUNT(*) FROM section_snapshot_items i WHERE i.snapshot_id = ?) AS item_count,
      (
        SELECT COUNT(*)
        FROM section_snapshot_partitions p
        WHERE p.snapshot_id = ?
          AND p.expected_item_count <> (
            SELECT COUNT(*) FROM section_snapshot_items i
            WHERE i.snapshot_id = p.snapshot_id AND i.section_key = p.section_key
          )
      ) AS partition_mismatch_count
  `).bind(snapshotId, snapshotId, snapshotId).first();
  return {
    snapshot,
    observedSectionCount: Number(counts?.section_count || 0),
    observedItemCount: Number(counts?.item_count || 0),
    partitionMismatchCount: Number(counts?.partition_mismatch_count || 0),
  };
}

async function readSnapshotPartitionsForDigest(db, snapshotId) {
  const result = await db.prepare(`
    SELECT section_key, expected_item_count
    FROM section_snapshot_partitions
    WHERE snapshot_id = ?
    ORDER BY section_key ASC
  `).bind(snapshotId).all();
  return canonicalSnapshotPartitionsForDigest((result?.results || []).map(row => ({
    sectionKey: row.section_key,
    expectedItemCount: Number(row.expected_item_count),
  })));
}

async function readSnapshotRowsForDigest(db, snapshotId) {
  const result = await db.prepare(`
    SELECT section_key, position, story_id, source_family, story_json
    FROM section_snapshot_items
    WHERE snapshot_id = ?
    ORDER BY section_key ASC, position ASC
  `).bind(snapshotId).all();
  return canonicalSnapshotItemsForDigest((result?.results || []).map(row => ({
    sectionKey: row.section_key,
    position: Number(row.position),
    storyId: row.story_id,
    sourceFamily: row.source_family,
    storyJson: row.story_json,
  })));
}

function assertPreflightComplete(preflight) {
  const { snapshot } = preflight;
  if (snapshot.run_state !== SOURCE_RUN_STATES.COMPLETE) {
    throw new SectionsShadowStoreError('source_run_incomplete', 'Snapshot source run is not COMPLETE');
  }
  if (preflight.observedSectionCount !== Number(snapshot.expected_section_count) ||
      preflight.observedItemCount !== Number(snapshot.expected_item_count) ||
      preflight.partitionMismatchCount !== 0) {
    throw new SectionsShadowStoreError(
      'snapshot_cardinality_mismatch',
      'Snapshot observed partitions/items do not match staged cardinality',
      {
        expectedSectionCount: Number(snapshot.expected_section_count),
        observedSectionCount: preflight.observedSectionCount,
        expectedItemCount: Number(snapshot.expected_item_count),
        observedItemCount: preflight.observedItemCount,
        partitionMismatchCount: preflight.partitionMismatchCount,
      },
    );
  }
}

async function readCurrentPointer(db) {
  return db.prepare(
    'SELECT snapshot_id FROM current_snapshot_pointer WHERE pointer_name = ? LIMIT 1',
  ).bind(SECTIONS_SHADOW_POINTER_NAME).first();
}

async function ensureSnapshotSealed(db, snapshotId, sealedAt) {
  let preflight = await inspectSnapshot(db, snapshotId);
  if (!preflight) throw new SectionsShadowStoreError('snapshot_not_found', 'Snapshot does not exist');
  if (preflight.snapshot.state === SNAPSHOT_STATES.SEALED ||
      preflight.snapshot.state === SNAPSHOT_STATES.COMMITTED) {
    return preflight;
  }
  if (preflight.snapshot.state !== SNAPSHOT_STATES.STAGED) {
    throw new SectionsShadowStoreError(
      'snapshot_not_staged',
      `Snapshot state is ${preflight.snapshot.state}`,
    );
  }
  assertPreflightComplete(preflight);

  const sealResult = await db.prepare(`
    UPDATE section_snapshots AS s
    SET state = 'SEALED', sealed_at = ?, failure_reason = NULL
    WHERE s.snapshot_id = ?
      AND s.state = 'STAGED'
      ${COMPLETE_PARTITION_PREDICATE}
      AND EXISTS (
        SELECT 1 FROM source_runs r
        WHERE r.run_id = s.run_id AND r.state = 'COMPLETE'
      )
  `).bind(sealedAt, snapshotId).run();

  preflight = await inspectSnapshot(db, snapshotId);
  if (resultChanges(sealResult) === 1 && preflight?.snapshot?.state === SNAPSHOT_STATES.SEALED) {
    return preflight;
  }
  if ([SNAPSHOT_STATES.SEALED, SNAPSHOT_STATES.COMMITTED]
    .includes(preflight?.snapshot?.state)) {
    return preflight;
  }
  throw new SectionsShadowStoreError(
    'snapshot_seal_failed',
    'Snapshot could not be sealed under complete cardinality authority',
  );
}

export async function finalizeSnapshot(db, snapshotId, committedAt) {
  assertDb(db);
  let preflight = await ensureSnapshotSealed(db, snapshotId, committedAt);

  if (preflight.snapshot.state === SNAPSHOT_STATES.COMMITTED) {
    const pointer = await readCurrentPointer(db);
    if (pointer?.snapshot_id === snapshotId) {
      return { snapshotId, state: SNAPSHOT_STATES.COMMITTED, idempotent: true };
    }
    throw new SectionsShadowStoreError(
      'committed_pointer_mismatch',
      'Committed snapshot exists without matching current pointer',
      { snapshotId, pointerSnapshotId: pointer?.snapshot_id || null },
    );
  }
  if (preflight.snapshot.state !== SNAPSHOT_STATES.SEALED) {
    throw new SectionsShadowStoreError(
      'snapshot_not_sealed',
      `Snapshot state is ${preflight.snapshot.state}`,
    );
  }
  assertPreflightComplete(preflight);

  const persistedPartitions = await readSnapshotPartitionsForDigest(db, snapshotId);
  const persistedPartitionDigest = digestCanonicalJson(persistedPartitions);
  if (persistedPartitionDigest !== preflight.snapshot.expected_partition_digest) {
    throw new SectionsShadowStoreError(
      'snapshot_partition_digest_mismatch',
      'Persisted partitions do not match sealed partition authority',
      { expected: preflight.snapshot.expected_partition_digest, observed: persistedPartitionDigest },
    );
  }

  const persistedRows = await readSnapshotRowsForDigest(db, snapshotId);
  const persistedRowsDigest = digestCanonicalJson(persistedRows);
  if (persistedRowsDigest !== preflight.snapshot.expected_item_rows_digest) {
    throw new SectionsShadowStoreError(
      'snapshot_item_digest_mismatch',
      'Persisted snapshot rows do not match sealed row authority',
      { expected: preflight.snapshot.expected_item_rows_digest, observed: persistedRowsDigest },
    );
  }

  const promote = db.prepare(`
    UPDATE section_snapshots AS s
    SET state = 'COMMITTED', committed_at = ?, failure_reason = NULL
    WHERE s.snapshot_id = ?
      AND s.state = 'SEALED'
      AND s.expected_partition_digest = ?
      AND s.expected_item_rows_digest = ?
      ${COMPLETE_PARTITION_PREDICATE}
      AND EXISTS (
        SELECT 1 FROM source_runs r
        WHERE r.run_id = s.run_id AND r.state = 'COMPLETE'
      )
  `).bind(
    committedAt,
    snapshotId,
    persistedPartitionDigest,
    persistedRowsDigest,
  );

  const movePointer = db.prepare(`
    INSERT INTO current_snapshot_pointer (pointer_name, snapshot_id, updated_at)
    SELECT ?, s.snapshot_id, ?
    FROM section_snapshots s
    JOIN source_runs r ON r.run_id = s.run_id
    WHERE s.snapshot_id = ?
      AND s.state = 'COMMITTED'
      AND r.state = 'COMPLETE'
      ${COMPLETE_PARTITION_PREDICATE}
    ON CONFLICT(pointer_name) DO UPDATE SET
      snapshot_id = excluded.snapshot_id,
      updated_at = excluded.updated_at
  `).bind(SECTIONS_SHADOW_POINTER_NAME, committedAt, snapshotId);

  const [promoteResult, pointerResult] = await db.batch([promote, movePointer]);
  if (resultChanges(promoteResult) === 1 && resultChanges(pointerResult) === 1) {
    return { snapshotId, state: SNAPSHOT_STATES.COMMITTED, idempotent: false };
  }

  preflight = await inspectSnapshot(db, snapshotId);
  const pointer = await readCurrentPointer(db);
  if (preflight?.snapshot?.state === SNAPSHOT_STATES.COMMITTED &&
      pointer?.snapshot_id === snapshotId) {
    return { snapshotId, state: SNAPSHOT_STATES.COMMITTED, idempotent: true };
  }
  throw new SectionsShadowStoreError(
    'snapshot_finalize_noop',
    'Atomic snapshot finalization did not produce a committed current snapshot',
    {
      promoteChanges: resultChanges(promoteResult),
      pointerChanges: resultChanges(pointerResult),
      state: preflight?.snapshot?.state || null,
      pointerSnapshotId: pointer?.snapshot_id || null,
    },
  );
}

export async function readCurrentSnapshotMetadata(db) {
  assertDb(db);
  return db.prepare(CURRENT_SNAPSHOT_SQL)
    .bind(SECTIONS_SHADOW_POINTER_NAME)
    .first();
}

async function readCurrentPartitions(db, snapshotId) {
  const result = await db.prepare(`
    SELECT section_key
    FROM section_snapshot_partitions
    WHERE snapshot_id = ?
    ORDER BY section_key ASC
  `).bind(snapshotId).all();
  return (result?.results || []).map(row => row.section_key);
}

export async function readCurrentSnapshot(db) {
  const snapshot = await readCurrentSnapshotMetadata(db);
  if (!snapshot) return null;
  const partitionKeys = await readCurrentPartitions(db, snapshot.snapshot_id);
  const sections = Object.fromEntries(partitionKeys.map(sectionKey => [sectionKey, []]));
  const result = await db.prepare(`
    SELECT section_key, position, story_id, source_family, story_json
    FROM section_snapshot_items
    WHERE snapshot_id = ?
    ORDER BY section_key ASC, position ASC
  `).bind(snapshot.snapshot_id).all();
  for (const row of result?.results || []) {
    if (!Object.hasOwn(sections, row.section_key)) {
      throw new SectionsShadowStoreError(
        'committed_partition_missing',
        'Committed item references a missing section partition',
        { sectionKey: row.section_key },
      );
    }
    sections[row.section_key].push(asJson(row.story_json));
  }
  return {
    snapshotId: snapshot.snapshot_id,
    runId: snapshot.run_id,
    schemaVersion: snapshot.snapshot_schema_version,
    createdAt: snapshot.created_at,
    sealedAt: snapshot.sealed_at,
    committedAt: snapshot.committed_at,
    sourceRegistryVersion: snapshot.source_registry_version,
    sourceRegistryDigest: snapshot.source_registry_digest,
    sourceIdentityVersion: snapshot.source_identity_version,
    normalizationVersion: snapshot.normalization_version,
    normalizationDigest: snapshot.normalization_digest,
    eventClassifierVersion: snapshot.event_classifier_version,
    rankerVersion: snapshot.ranker_version,
    rankerPolicyDigest: snapshot.ranker_policy_digest,
    inputEvidenceDigest: snapshot.input_evidence_digest,
    decisionOutputDigest: snapshot.decision_output_digest,
    sections,
  };
}

export async function readCurrentSection(db, sectionKey) {
  const snapshot = await readCurrentSnapshotMetadata(db);
  if (!snapshot) return null;
  const partition = await db.prepare(`
    SELECT section_key
    FROM section_snapshot_partitions
    WHERE snapshot_id = ? AND section_key = ?
    LIMIT 1
  `).bind(snapshot.snapshot_id, sectionKey).first();
  if (!partition) return null;
  const result = await db.prepare(`
    SELECT story_json
    FROM section_snapshot_items
    WHERE snapshot_id = ? AND section_key = ?
    ORDER BY position ASC
  `).bind(snapshot.snapshot_id, sectionKey).all();
  return {
    snapshotId: snapshot.snapshot_id,
    section: sectionKey,
    items: (result?.results || []).map(row => asJson(row.story_json)),
  };
}

export async function readLatestParity(db) {
  assertDb(db);
  const row = await db.prepare(`
    SELECT * FROM parity_results
    ORDER BY created_at DESC, parity_id DESC
    LIMIT 1
  `).first();
  if (!row) return null;
  return {
    parityId: row.parity_id,
    createdAt: row.created_at,
    referenceSnapshotId: row.reference_snapshot_id,
    shadowSnapshotId: row.shadow_snapshot_id,
    parityClass: row.parity_class,
    evidence: asJson(row.evidence_json),
  };
}
