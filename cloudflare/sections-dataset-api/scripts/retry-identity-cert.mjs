import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS_URL = new URL('../migrations/', import.meta.url);
const DIGEST = 'c'.repeat(64);

function applyMigrations(db) {
  const files = readdirSync(MIGRATIONS_URL)
    .filter(name => /^\d+.*\.sql$/.test(name))
    .sort();
  for (const file of files) {
    db.exec(readFileSync(new URL(file, MIGRATIONS_URL), 'utf8'));
  }
  return files;
}

function insertRun(db, codeCommitSha = 'sha') {
  db.prepare(`
    INSERT OR IGNORE INTO source_runs (
      run_id, scheduled_at, acquisition_started_at, acquisition_completed_at,
      code_commit_sha, source_registry_version, source_registry_digest,
      input_evidence_digest, state, failure_reason
    ) VALUES ('R300', 'scheduled', 'started', NULL, ?, 'v', ?, NULL, 'RUNNING', NULL)
  `).run(codeCommitSha, DIGEST);
}

function insertSnapshot(db, rankerVersion = 'ranker-v1', expectedItems = 1) {
  db.prepare(`
    INSERT OR IGNORE INTO section_snapshots (
      snapshot_id, run_id, snapshot_schema_version, created_at, sealed_at, committed_at,
      source_registry_version, source_registry_digest, source_identity_version,
      normalization_version, normalization_digest, event_classifier_version,
      ranker_version, ranker_policy_digest, input_evidence_digest,
      decision_output_digest, expected_section_count, expected_item_count,
      expected_partition_digest, expected_item_rows_digest, state, failure_reason
    ) VALUES ('S300', 'R300', 'v1', 'created', NULL, NULL, 'v', ?, 'identity-v1',
              'norm-v1', ?, 'classifier-v1', ?, ?, ?, ?, 1, ?, ?, ?, 'STAGED', NULL)
  `).run(
    DIGEST,
    DIGEST,
    rankerVersion,
    DIGEST,
    DIGEST,
    DIGEST,
    expectedItems,
    DIGEST,
    DIGEST,
  );
}

export function runRetryIdentityCertification() {
  const db = new DatabaseSync(':memory:');
  const migrations = applyMigrations(db);

  insertRun(db);
  insertRun(db);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM source_runs`).get().count, 1);
  assert.throws(() => insertRun(db, 'different-sha'), /source run retry authority conflict/);

  insertSnapshot(db);
  insertSnapshot(db);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM section_snapshots`).get().count, 1);
  assert.throws(() => insertSnapshot(db, 'ranker-v2'), /snapshot retry authority conflict/);
  assert.throws(() => insertSnapshot(db, 'ranker-v1', 2), /snapshot retry authority conflict/);

  db.prepare(`
    INSERT OR IGNORE INTO section_snapshot_partitions
      (snapshot_id, section_key, expected_item_count)
    VALUES ('S300', 'world', 1)
  `).run();
  db.prepare(`
    INSERT OR IGNORE INTO section_snapshot_partitions
      (snapshot_id, section_key, expected_item_count)
    VALUES ('S300', 'world', 1)
  `).run();
  assert.throws(
    () => db.prepare(`
      INSERT OR IGNORE INTO section_snapshot_partitions
        (snapshot_id, section_key, expected_item_count)
      VALUES ('S300', 'world', 2)
    `).run(),
    /snapshot partition retry conflict/,
  );

  db.prepare(`
    INSERT OR IGNORE INTO section_snapshot_items
      (snapshot_id, section_key, position, story_id, source_family, story_json)
    VALUES ('S300', 'world', 0, 'story-1', 'family-1', '{"title":"same"}')
  `).run();
  db.prepare(`
    INSERT OR IGNORE INTO section_snapshot_items
      (snapshot_id, section_key, position, story_id, source_family, story_json)
    VALUES ('S300', 'world', 0, 'story-1', 'family-1', '{"title":"same"}')
  `).run();
  assert.throws(
    () => db.prepare(`
      INSERT OR IGNORE INTO section_snapshot_items
        (snapshot_id, section_key, position, story_id, source_family, story_json)
      VALUES ('S300', 'world', 0, 'story-2', 'family-1', '{"title":"different"}')
    `).run(),
    /snapshot item retry conflict/,
  );

  const result = Object.freeze({
    migrations: Object.freeze(migrations),
    identicalRunRetryNoop: true,
    conflictingRunRetryRejected: true,
    identicalSnapshotRetryNoop: true,
    conflictingSnapshotRetryRejected: true,
    conflictingPartitionRetryRejected: true,
    conflictingItemRetryRejected: true,
  });
  db.close();
  return result;
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  console.log(JSON.stringify(runRetryIdentityCertification(), null, 2));
}
