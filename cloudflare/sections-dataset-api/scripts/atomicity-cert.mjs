import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS_URL = new URL('../migrations/', import.meta.url);
const DIGEST = 'a'.repeat(64);
const POINTER = 'sections-shadow-current';

function applyMigrations(db) {
  const files = readdirSync(MIGRATIONS_URL)
    .filter(name => /^\d+.*\.sql$/.test(name))
    .sort();
  for (const file of files) {
    db.exec(readFileSync(new URL(file, MIGRATIONS_URL), 'utf8'));
  }
  return files;
}

function insertRun(db, runId, state = 'COMPLETE') {
  db.prepare(`
    INSERT INTO source_runs (
      run_id, scheduled_at, acquisition_started_at, acquisition_completed_at,
      code_commit_sha, source_registry_version, source_registry_digest,
      input_evidence_digest, state, failure_reason
    ) VALUES (?, 't', 't', 't', 'sha', 'v', ?, ?, ?, NULL)
  `).run(runId, DIGEST, DIGEST, state);
}

function insertSnapshot(db, snapshotId, runId, expectedSections, expectedItems) {
  db.prepare(`
    INSERT INTO section_snapshots (
      snapshot_id, run_id, snapshot_schema_version, created_at, sealed_at, committed_at,
      source_registry_version, source_registry_digest, source_identity_version,
      normalization_version, normalization_digest, event_classifier_version,
      ranker_version, ranker_policy_digest, input_evidence_digest,
      decision_output_digest, expected_section_count, expected_item_count,
      expected_partition_digest, expected_item_rows_digest, state, failure_reason
    ) VALUES (?, ?, 'v1', 't', NULL, NULL, 'v', ?, 'si', 'nv', ?, 'ev', 'rv', ?, ?, ?, ?, ?, ?, ?, 'STAGED', NULL)
  `).run(
    snapshotId,
    runId,
    DIGEST,
    DIGEST,
    DIGEST,
    DIGEST,
    DIGEST,
    expectedSections,
    expectedItems,
    DIGEST,
    DIGEST,
  );
}

function insertPartition(db, snapshotId, sectionKey, itemCount) {
  db.prepare(`
    INSERT INTO section_snapshot_partitions (snapshot_id, section_key, expected_item_count)
    VALUES (?, ?, ?)
  `).run(snapshotId, sectionKey, itemCount);
}

function insertItems(db, snapshotId, sectionKey, itemCount, { ignore = false } = {}) {
  const statement = db.prepare(`
    INSERT ${ignore ? 'OR IGNORE ' : ''}INTO section_snapshot_items (
      snapshot_id, section_key, position, story_id, source_family, story_json
    ) VALUES (?, ?, ?, ?, 'family', '{}')
  `);
  for (let position = 0; position < itemCount; position += 1) {
    statement.run(
      snapshotId,
      sectionKey,
      position,
      `${snapshotId}:${sectionKey}:${position}`,
    );
  }
}

function sealSnapshot(db, snapshotId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE section_snapshots
      SET state = 'SEALED', sealed_at = 'seal'
      WHERE snapshot_id = ? AND state = 'STAGED'
    `).run(snapshotId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function commitSnapshotAndPointer(db, snapshotId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE section_snapshots
      SET state = 'COMMITTED', committed_at = 'done'
      WHERE snapshot_id = ? AND state = 'SEALED'
    `).run(snapshotId);
    db.prepare(`
      INSERT INTO current_snapshot_pointer (pointer_name, snapshot_id, updated_at)
      VALUES (?, ?, 'done')
      ON CONFLICT(pointer_name) DO UPDATE SET
        snapshot_id = excluded.snapshot_id,
        updated_at = excluded.updated_at
    `).run(POINTER, snapshotId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function currentPointer(db) {
  return db.prepare(
    'SELECT snapshot_id FROM current_snapshot_pointer WHERE pointer_name = ?',
  ).get(POINTER)?.snapshot_id || null;
}

function snapshotState(db, snapshotId) {
  return db.prepare(
    'SELECT state FROM section_snapshots WHERE snapshot_id = ?',
  ).get(snapshotId)?.state || null;
}

function stagePartitionSet(db, snapshotId, counts, start = 0) {
  counts.forEach((itemCount, index) => {
    const sectionIndex = start + index;
    const sectionKey = `s${sectionIndex}`;
    insertPartition(db, snapshotId, sectionKey, itemCount);
    insertItems(db, snapshotId, sectionKey, itemCount);
  });
}

export function runAtomicityCertification() {
  const db = new DatabaseSync(':memory:');
  const migrations = applyMigrations(db);

  insertRun(db, 'R100');
  insertSnapshot(db, 'S100', 'R100', 10, 284);
  stagePartitionSet(db, 'S100', [29, 29, 29, 29, 28, 28, 28, 28, 28, 28]);
  sealSnapshot(db, 'S100');
  commitSnapshotAndPointer(db, 'S100');
  assert.equal(currentPointer(db), 'S100');

  insertRun(db, 'R101');
  insertSnapshot(db, 'S101', 'R101', 10, 284);
  stagePartitionSet(db, 'S101', [29, 29, 29, 29, 29, 29, 27]);

  assert.throws(
    () => sealSnapshot(db, 'S101'),
    /complete cardinality/,
  );
  assert.equal(snapshotState(db, 'S101'), 'STAGED');
  assert.equal(currentPointer(db), 'S100');
  assert.throws(
    () => db.prepare(`
      UPDATE current_snapshot_pointer SET snapshot_id = 'S101' WHERE pointer_name = ?
    `).run(POINTER),
    /requires COMMITTED/,
  );

  stagePartitionSet(db, 'S101', [28, 28, 27], 7);
  assert.equal(
    db.prepare(`SELECT COUNT(*) AS count FROM section_snapshot_items WHERE snapshot_id = 'S101'`).get().count,
    284,
  );
  sealSnapshot(db, 'S101');
  assert.equal(snapshotState(db, 'S101'), 'SEALED');
  assert.equal(currentPointer(db), 'S100');
  assert.throws(
    () => insertItems(db, 'S101', 's0', 29, { ignore: true }),
    /writable only while STAGED/,
  );
  assert.throws(
    () => db.prepare(`
      UPDATE section_snapshots SET expected_item_count = 285 WHERE snapshot_id = 'S101'
    `).run(),
    /snapshot authority is immutable/,
  );
  commitSnapshotAndPointer(db, 'S101');
  assert.equal(snapshotState(db, 'S101'), 'COMMITTED');
  assert.equal(currentPointer(db), 'S101');

  insertRun(db, 'R102');
  insertSnapshot(db, 'S102', 'R102', 10, 9);
  stagePartitionSet(db, 'S102', [1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
  sealSnapshot(db, 'S102');
  commitSnapshotAndPointer(db, 'S102');
  assert.equal(
    db.prepare(`SELECT COUNT(*) AS count FROM section_snapshot_partitions WHERE snapshot_id = 'S102'`).get().count,
    10,
  );
  assert.equal(
    db.prepare(`SELECT COUNT(*) AS count FROM section_snapshot_items WHERE snapshot_id = 'S102'`).get().count,
    9,
  );

  assert.throws(
    () => db.prepare(`
      UPDATE section_snapshot_partitions
      SET expected_item_count = 2
      WHERE snapshot_id = 'S102' AND section_key = 's0'
    `).run(),
    /writable only while STAGED/,
  );
  assert.throws(
    () => db.prepare(`UPDATE section_snapshots SET committed_at = 'changed' WHERE snapshot_id = 'S102'`).run(),
    /COMMITTED snapshot record is immutable/,
  );

  insertRun(db, 'R103', 'RUNNING');
  db.prepare(`
    INSERT INTO source_fetch_evidence (
      run_id, section_key, lane_key, source_group, source_family,
      item_count, started_at, state
    ) VALUES ('R103', 'world', 'lane', 'bbc', 'bbc', 1, 't', 'OK')
  `).run();
  db.prepare(`
    UPDATE source_runs SET state = 'COMPLETE', acquisition_completed_at = 'done'
    WHERE run_id = 'R103'
  `).run();
  assert.throws(
    () => db.prepare(`UPDATE source_fetch_evidence SET item_count = 2 WHERE run_id = 'R103'`).run(),
    /writable only while run is RUNNING/,
  );
  assert.throws(
    () => db.prepare(`UPDATE source_runs SET failure_reason = 'changed' WHERE run_id = 'R103'`).run(),
    /terminal source run is immutable/,
  );

  const result = Object.freeze({
    migrations: Object.freeze(migrations),
    s101Partial: Object.freeze({
      partitions: 7,
      rows: 201,
      state: 'STAGED',
      pointer: 'S100',
    }),
    s101CrashAfterSeal: Object.freeze({
      state: 'SEALED',
      pointer: 'S100',
      rowsMutable: false,
      metadataMutable: false,
    }),
    s101Final: Object.freeze({
      partitions: 10,
      rows: 284,
      state: 'COMMITTED',
      pointer: 'S101',
    }),
    emptyPartitionPreserved: true,
    committedSnapshotImmutable: true,
    completedRunEvidenceImmutable: true,
  });
  db.close();
  return result;
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  console.log(JSON.stringify(runAtomicityCertification(), null, 2));
}
