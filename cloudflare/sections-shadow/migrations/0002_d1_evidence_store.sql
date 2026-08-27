PRAGMA foreign_keys = ON;

CREATE TABLE sections_shadow_quota_daily_v2 (
  day_key TEXT PRIMARY KEY,
  epochs_started INTEGER NOT NULL DEFAULT 0 CHECK (epochs_started >= 0),
  queue_operations_estimate INTEGER NOT NULL DEFAULT 0 CHECK (queue_operations_estimate >= 0),
  d1_reads_estimate INTEGER NOT NULL DEFAULT 0 CHECK (d1_reads_estimate >= 0),
  d1_writes_estimate INTEGER NOT NULL DEFAULT 0 CHECK (d1_writes_estimate >= 0),
  worker_invocations_estimate INTEGER NOT NULL DEFAULT 0 CHECK (worker_invocations_estimate >= 0),
  blocked_starts INTEGER NOT NULL DEFAULT 0 CHECK (blocked_starts >= 0),
  updated_at_ms INTEGER NOT NULL
);

INSERT INTO sections_shadow_quota_daily_v2 (
  day_key, epochs_started, queue_operations_estimate, d1_reads_estimate,
  d1_writes_estimate, worker_invocations_estimate, blocked_starts, updated_at_ms
)
SELECT
  day_key, epochs_started, queue_operations_estimate, d1_reads_estimate,
  d1_writes_estimate, worker_invocations_estimate, blocked_starts, updated_at_ms
FROM sections_shadow_quota_daily;

DROP TABLE sections_shadow_quota_daily;
ALTER TABLE sections_shadow_quota_daily_v2 RENAME TO sections_shadow_quota_daily;

CREATE TABLE IF NOT EXISTS sections_shadow_evidence_objects (
  object_key TEXT PRIMARY KEY,
  epoch_id TEXT NOT NULL UNIQUE,
  object_digest TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  decision_output_digest TEXT NOT NULL,
  content_json TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length > 0 AND byte_length <= 1000000),
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  FOREIGN KEY (epoch_id) REFERENCES sections_shadow_epochs(epoch_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sections_shadow_evidence_expiry
  ON sections_shadow_evidence_objects(expires_at_ms);

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_evidence_update_immutable
BEFORE UPDATE ON sections_shadow_evidence_objects
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_evidence_object_is_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_evidence_delete_current
BEFORE DELETE ON sections_shadow_evidence_objects
WHEN EXISTS (
  SELECT 1 FROM sections_shadow_current_pointer
  WHERE epoch_id = OLD.epoch_id
)
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_current_evidence_cannot_be_deleted');
END;
