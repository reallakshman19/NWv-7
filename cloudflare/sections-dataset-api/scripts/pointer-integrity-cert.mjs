import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS_URL = new URL('../migrations/', import.meta.url);
const DIGEST = 'b'.repeat(64);
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

function insertRun(db, runId) {
  db.prepare(`
    INSERT INTO source_runs (
      run_id, scheduled_at, acquisition_started_at, acquisition_completed_at,
      code_commit_sha, source_registry_version, source_registry_digest,
      input_evidence_digest, state, failure_reason
    ) VALUES (?, 't', 't', 't', 'sha', 'v', ?, ?, 'COMPLETE', NULL)
  `).run(runId, DIGEST, DIGEST);
}

function insertStagedSnapshot(db, snapshotId, runId, expectedSections, expectedItems) {
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
  const item = db.prepare(`
    INSERT INTO section_snapshot_items (
      snapshot_id, section_key, position, story_id, source_family, story_json
    ) VALUES (?, ?, ?, ?, 'family', '{}')
  `);
  for (let position = 0; position < itemCount; position += 1) {
    item.run(snapshotId, sectionKey, position, `${snapshotId}:${sectionKey}:${position}`);
  }
}

function commitValidSnapshot(db, snapshotId) {
  db.prepare(`UPDATE section_snapshots SET state = 'SEALED', sealed_at = 'seal' WHERE snapshot_id = ?`).run(snapshotId);
  db.prepare(`UPDATE section_snapshots SET state = 'COMMITTED', committed_at = 'done' WHERE snapshot_id = ?`).run(snapshotId);
}

export function runPointerIntegrityCertification() {
  const db = new DatabaseSync(':memory:');
  const migrations = applyMigrations(db);

  insertRun(db, 'R200');
  assert.throws(
    () => db.prepare(`
      INSERT INTO section_snapshots (
        snapshot_id, run_id, snapshot_schema_version, created_at,
        source_registry_version, source_registry_digest, source_identity_version,
        normalization_version, normalization_digest, event_classifier_version,
        ranker_version, ranker_policy_digest, input_evidence_digest,
        decision_output_digest, expected_section_count, expected_item_count,
        expected_partition_digest, expected_item_rows_digest, state
      ) VALUES ('DIRECT', 'R200', 'v1', 't', 'v', ?, 'si', 'nv', ?, 'ev', 'rv', ?, ?, ?, 1, 0, ?, ?, 'COMMITTED')
    `).run(DIGEST, DIGEST, DIGEST, DIGEST, DIGEST, DIGEST, DIGEST),
    /must be inserted STAGED/,
  );

  insertStagedSnapshot(db, 'S200', 'R200', 1, 1);
  insertPartition(db, 'S200', 'world', 1);
  commitValidSnapshot(db, 'S200');
  db.prepare(`
    INSERT INTO current_snapshot_pointer (pointer_name, snapshot_id, updated_at)
    VALUES (?, 'S200', 'done')
  `).run(POINTER);

  assert.throws(
    () => db.prepare(`
      INSERT INTO current_snapshot_pointer (pointer_name, snapshot_id, updated_at)
      VALUES ('other-pointer', 'S200', 'done')
    `).run(),
    /unsupported current snapshot pointer name/,
  );

  // Prove the pointer guard is independently complete: deliberately remove the
  // upstream insertion/transition guards, create an invalid COMMITTED snapshot,
  // and verify the pointer trigger still rejects it on cardinality/run authority.
  db.exec(`DROP TRIGGER trg_snapshot_insert_requires_staged`);
  db.exec(`DROP TRIGGER trg_snapshot_seal_or_commit_requires_complete_cardinality`);
  db.exec(`DROP TRIGGER trg_snapshot_commit_requires_sealed`);

  insertRun(db, 'R201');
  db.prepare(`
    INSERT INTO section_snapshots (
      snapshot_id, run_id, snapshot_schema_version, created_at,
      source_registry_version, source_registry_digest, source_identity_version,
      normalization_version, normalization_digest, event_classifier_version,
      ranker_version, ranker_policy_digest, input_evidence_digest,
      decision_output_digest, expected_section_count, expected_item_count,
      expected_partition_digest, expected_item_rows_digest, state
    ) VALUES ('BROKEN', 'R201', 'v1', 't', 'v', ?, 'si', 'nv', ?, 'ev', 'rv', ?, ?, ?, 10, 284, ?, ?, 'COMMITTED')
  `).run(DIGEST, DIGEST, DIGEST, DIGEST, DIGEST, DIGEST, DIGEST);

  assert.throws(
    () => db.prepare(`
      UPDATE current_snapshot_pointer
      SET snapshot_id = 'BROKEN', updated_at = 'bad'
      WHERE pointer_name = ?
    `).run(POINTER),
    /requires COMMITTED complete snapshot/,
  );
  assert.equal(
    db.prepare(`SELECT snapshot_id FROM current_snapshot_pointer WHERE pointer_name = ?`).get(POINTER).snapshot_id,
    'S200',
  );

  const result = Object.freeze({
    migrations: Object.freeze(migrations),
    directCommittedInsertRejected: true,
    unsupportedPointerNameRejected: true,
    incompleteCommittedPointerRejectedIndependently: true,
    pointerAfterRejectedUpdate: 'S200',
  });
  db.close();
  return result;
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  console.log(JSON.stringify(runPointerIntegrityCertification(), null, 2));
}
