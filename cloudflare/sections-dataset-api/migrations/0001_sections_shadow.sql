PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS source_runs (
  run_id TEXT PRIMARY KEY,
  scheduled_at TEXT NOT NULL,
  acquisition_started_at TEXT NOT NULL,
  acquisition_completed_at TEXT,
  code_commit_sha TEXT NOT NULL,
  source_registry_version TEXT NOT NULL,
  source_registry_digest TEXT NOT NULL,
  input_evidence_digest TEXT,
  state TEXT NOT NULL CHECK (state IN ('RUNNING', 'COMPLETE', 'FAILED')),
  failure_reason TEXT
);

CREATE TABLE IF NOT EXISTS source_fetch_evidence (
  run_id TEXT NOT NULL,
  section_key TEXT NOT NULL,
  lane_key TEXT NOT NULL,
  source_group TEXT NOT NULL,
  source_family TEXT NOT NULL,
  feed_url TEXT,
  http_status INTEGER,
  item_count INTEGER NOT NULL CHECK (item_count >= 0),
  payload_sha256 TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  state TEXT NOT NULL CHECK (state IN ('OK', 'EMPTY', 'TIMEOUT', 'HTTP_ERROR', 'PARSE_ERROR', 'POLICY_BLOCKED')),
  PRIMARY KEY (run_id, section_key, lane_key),
  FOREIGN KEY (run_id) REFERENCES source_runs(run_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS section_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  snapshot_schema_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  committed_at TEXT,
  source_registry_version TEXT NOT NULL,
  source_registry_digest TEXT NOT NULL,
  source_identity_version TEXT NOT NULL,
  normalization_version TEXT NOT NULL,
  normalization_digest TEXT NOT NULL,
  event_classifier_version TEXT NOT NULL,
  ranker_version TEXT NOT NULL,
  ranker_policy_digest TEXT NOT NULL,
  input_evidence_digest TEXT NOT NULL,
  decision_output_digest TEXT NOT NULL,
  expected_section_count INTEGER NOT NULL CHECK (expected_section_count > 0),
  expected_item_count INTEGER NOT NULL CHECK (expected_item_count >= 0),
  expected_partition_digest TEXT NOT NULL,
  expected_item_rows_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('STAGED', 'COMMITTED', 'FAILED')),
  failure_reason TEXT,
  FOREIGN KEY (run_id) REFERENCES source_runs(run_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS section_snapshot_partitions (
  snapshot_id TEXT NOT NULL,
  section_key TEXT NOT NULL,
  expected_item_count INTEGER NOT NULL CHECK (expected_item_count >= 0),
  PRIMARY KEY (snapshot_id, section_key),
  FOREIGN KEY (snapshot_id) REFERENCES section_snapshots(snapshot_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS section_snapshot_items (
  snapshot_id TEXT NOT NULL,
  section_key TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  story_id TEXT NOT NULL,
  source_family TEXT NOT NULL,
  story_json TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, section_key, position),
  FOREIGN KEY (snapshot_id) REFERENCES section_snapshots(snapshot_id) ON DELETE RESTRICT,
  FOREIGN KEY (snapshot_id, section_key)
    REFERENCES section_snapshot_partitions(snapshot_id, section_key) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS current_snapshot_pointer (
  pointer_name TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES section_snapshots(snapshot_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS parity_results (
  parity_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  reference_snapshot_id TEXT,
  shadow_snapshot_id TEXT,
  parity_class TEXT NOT NULL,
  evidence_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_fetch_evidence_run
  ON source_fetch_evidence(run_id, section_key);
CREATE INDEX IF NOT EXISTS idx_section_snapshot_partitions_snapshot
  ON section_snapshot_partitions(snapshot_id, section_key);
CREATE INDEX IF NOT EXISTS idx_section_snapshot_items_snapshot
  ON section_snapshot_items(snapshot_id, section_key, position);
CREATE INDEX IF NOT EXISTS idx_section_snapshots_state_created
  ON section_snapshots(state, created_at);
CREATE INDEX IF NOT EXISTS idx_parity_results_created
  ON parity_results(created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_pointer_requires_committed_insert
BEFORE INSERT ON current_snapshot_pointer
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM section_snapshots
  WHERE snapshot_id = NEW.snapshot_id AND state = 'COMMITTED'
)
BEGIN
  SELECT RAISE(ABORT, 'current pointer requires COMMITTED snapshot');
END;

CREATE TRIGGER IF NOT EXISTS trg_pointer_requires_committed_update
BEFORE UPDATE OF snapshot_id ON current_snapshot_pointer
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM section_snapshots
  WHERE snapshot_id = NEW.snapshot_id AND state = 'COMMITTED'
)
BEGIN
  SELECT RAISE(ABORT, 'current pointer requires COMMITTED snapshot');
END;

CREATE TRIGGER IF NOT EXISTS trg_snapshot_commit_requires_complete_cardinality
BEFORE UPDATE OF state ON section_snapshots
FOR EACH ROW
WHEN NEW.state = 'COMMITTED' AND OLD.state <> 'COMMITTED' AND (
  NOT EXISTS (
    SELECT 1 FROM source_runs r
    WHERE r.run_id = NEW.run_id AND r.state = 'COMPLETE'
  )
  OR NEW.expected_section_count <> (
    SELECT COUNT(*) FROM section_snapshot_partitions p
    WHERE p.snapshot_id = NEW.snapshot_id
  )
  OR NEW.expected_item_count <> (
    SELECT COUNT(*) FROM section_snapshot_items i
    WHERE i.snapshot_id = NEW.snapshot_id
  )
  OR EXISTS (
    SELECT 1 FROM section_snapshot_partitions p
    WHERE p.snapshot_id = NEW.snapshot_id
      AND p.expected_item_count <> (
        SELECT COUNT(*) FROM section_snapshot_items i
        WHERE i.snapshot_id = NEW.snapshot_id
          AND i.section_key = p.section_key
      )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'COMMITTED snapshot requires complete cardinality');
END;

CREATE TRIGGER IF NOT EXISTS trg_committed_snapshot_no_revert
BEFORE UPDATE OF state ON section_snapshots
FOR EACH ROW
WHEN OLD.state = 'COMMITTED' AND NEW.state <> 'COMMITTED'
BEGIN
  SELECT RAISE(ABORT, 'COMMITTED snapshot state is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_committed_partitions_no_insert
BEFORE INSERT ON section_snapshot_partitions
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM section_snapshots
  WHERE snapshot_id = NEW.snapshot_id AND state = 'COMMITTED'
)
BEGIN
  SELECT RAISE(ABORT, 'COMMITTED snapshot partitions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_committed_partitions_no_update
BEFORE UPDATE ON section_snapshot_partitions
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM section_snapshots
  WHERE snapshot_id = OLD.snapshot_id AND state = 'COMMITTED'
)
BEGIN
  SELECT RAISE(ABORT, 'COMMITTED snapshot partitions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_committed_partitions_no_delete
BEFORE DELETE ON section_snapshot_partitions
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM section_snapshots
  WHERE snapshot_id = OLD.snapshot_id AND state = 'COMMITTED'
)
BEGIN
  SELECT RAISE(ABORT, 'COMMITTED snapshot partitions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_committed_items_no_insert
BEFORE INSERT ON section_snapshot_items
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM section_snapshots
  WHERE snapshot_id = NEW.snapshot_id AND state = 'COMMITTED'
)
BEGIN
  SELECT RAISE(ABORT, 'COMMITTED snapshot items are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_committed_items_no_update
BEFORE UPDATE ON section_snapshot_items
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM section_snapshots
  WHERE snapshot_id = OLD.snapshot_id AND state = 'COMMITTED'
)
BEGIN
  SELECT RAISE(ABORT, 'COMMITTED snapshot items are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_committed_items_no_delete
BEFORE DELETE ON section_snapshot_items
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM section_snapshots
  WHERE snapshot_id = OLD.snapshot_id AND state = 'COMMITTED'
)
BEGIN
  SELECT RAISE(ABORT, 'COMMITTED snapshot items are immutable');
END;
