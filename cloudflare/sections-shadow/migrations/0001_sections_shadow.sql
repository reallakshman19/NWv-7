PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sections_shadow_epochs (
  epoch_id TEXT PRIMARY KEY,
  logical_slot INTEGER NOT NULL,
  scheduled_at_ms INTEGER NOT NULL,
  evaluation_now_ms INTEGER NOT NULL,
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  acquisition_mode TEXT NOT NULL CHECK (
    acquisition_mode IN ('FROZEN_REPLAY', 'INDEPENDENT_LIVE')
  ),
  state TEXT NOT NULL CHECK (
    state IN ('STAGED', 'SEALED', 'SHADOW_COMMITTED', 'ABORTED', 'REJECTED')
  ),
  expected_lane_count INTEGER NOT NULL CHECK (expected_lane_count > 0),
  terminal_lane_count INTEGER NOT NULL DEFAULT 0 CHECK (terminal_lane_count >= 0),
  expected_decision_count INTEGER,
  actual_decision_count INTEGER NOT NULL DEFAULT 0 CHECK (actual_decision_count >= 0),
  source_registry_version TEXT NOT NULL,
  source_registry_digest TEXT NOT NULL,
  input_evidence_digest TEXT,
  decision_output_digest TEXT,
  evidence_object_key TEXT,
  evidence_object_digest TEXT,
  evidence_verified INTEGER NOT NULL DEFAULT 0 CHECK (evidence_verified IN (0, 1)),
  failure_code TEXT,
  failure_message TEXT,
  created_at_ms INTEGER NOT NULL,
  sealed_at_ms INTEGER,
  committed_at_ms INTEGER,
  terminal_at_ms INTEGER,
  raw_evidence_expires_at_ms INTEGER,
  normalized_evidence_expires_at_ms INTEGER,
  summary_expires_at_ms INTEGER NOT NULL,
  UNIQUE (logical_slot, attempt)
);

CREATE TABLE IF NOT EXISTS sections_shadow_lane_evidence (
  epoch_id TEXT NOT NULL,
  lane_id TEXT NOT NULL,
  section_key TEXT NOT NULL,
  source_group TEXT NOT NULL,
  source_name TEXT NOT NULL,
  feed_url_digest TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (
    disposition IN ('OK', 'EMPTY', 'TIMEOUT', 'HTTP_ERROR', 'PARSE_ERROR', 'POLICY_BLOCKED')
  ),
  item_count INTEGER NOT NULL CHECK (item_count >= 0),
  evidence_digest TEXT NOT NULL,
  evidence_object_key TEXT,
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 1),
  http_status INTEGER,
  duration_ms INTEGER,
  error_code TEXT,
  observed_at_ms INTEGER NOT NULL,
  PRIMARY KEY (epoch_id, lane_id),
  FOREIGN KEY (epoch_id) REFERENCES sections_shadow_epochs(epoch_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sections_shadow_decisions (
  epoch_id TEXT NOT NULL,
  candidate_identity TEXT NOT NULL,
  authoritative_rank INTEGER NOT NULL CHECK (authoritative_rank >= 0),
  selected_position INTEGER,
  displayed_position INTEGER,
  evidence_digest TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  PRIMARY KEY (epoch_id, candidate_identity),
  FOREIGN KEY (epoch_id) REFERENCES sections_shadow_epochs(epoch_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sections_shadow_current_pointer (
  dataset_key TEXT PRIMARY KEY CHECK (dataset_key = 'sections_shadow'),
  epoch_id TEXT NOT NULL UNIQUE,
  logical_slot INTEGER NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 1),
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY (epoch_id) REFERENCES sections_shadow_epochs(epoch_id)
);

CREATE TABLE IF NOT EXISTS sections_shadow_parity_results (
  comparison_id TEXT PRIMARY KEY,
  shadow_epoch_id TEXT NOT NULL,
  reference_epoch_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('DETERMINISTIC_REPLAY', 'INDEPENDENT_LIVE')),
  classification TEXT NOT NULL CHECK (
    classification IN (
      'MATCH', 'ACQUISITION_DRIFT', 'IDENTITY_DRIFT', 'NORMALIZATION_DRIFT',
      'CLASSIFICATION_DRIFT', 'ADMISSION_DRIFT', 'RANKING_DRIFT',
      'SOURCE_HEALTH_DRIFT', 'INFRASTRUCTURE_DRIFT', 'UNKNOWN_DRIFT'
    )
  ),
  first_divergent_stage TEXT,
  detail_object_key TEXT,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY (shadow_epoch_id) REFERENCES sections_shadow_epochs(epoch_id)
);

CREATE TABLE IF NOT EXISTS sections_shadow_quota_daily (
  day_key TEXT PRIMARY KEY,
  epochs_started INTEGER NOT NULL DEFAULT 0 CHECK (epochs_started >= 0),
  queue_operations_estimate INTEGER NOT NULL DEFAULT 0 CHECK (queue_operations_estimate >= 0),
  d1_reads_estimate INTEGER NOT NULL DEFAULT 0 CHECK (d1_reads_estimate >= 0),
  d1_writes_estimate INTEGER NOT NULL DEFAULT 0 CHECK (d1_writes_estimate >= 0),
  r2_class_a_estimate INTEGER NOT NULL DEFAULT 0 CHECK (r2_class_a_estimate >= 0),
  r2_class_b_estimate INTEGER NOT NULL DEFAULT 0 CHECK (r2_class_b_estimate >= 0),
  worker_invocations_estimate INTEGER NOT NULL DEFAULT 0 CHECK (worker_invocations_estimate >= 0),
  blocked_starts INTEGER NOT NULL DEFAULT 0 CHECK (blocked_starts >= 0),
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sections_shadow_epochs_state_slot
  ON sections_shadow_epochs(state, logical_slot DESC);

CREATE INDEX IF NOT EXISTS idx_sections_shadow_lane_epoch
  ON sections_shadow_lane_evidence(epoch_id);

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_epoch_transition
BEFORE UPDATE OF state ON sections_shadow_epochs
WHEN NOT (
  NEW.state = OLD.state OR
  (OLD.state = 'STAGED' AND NEW.state IN ('SEALED', 'ABORTED', 'REJECTED')) OR
  (OLD.state = 'SEALED' AND NEW.state IN ('SHADOW_COMMITTED', 'REJECTED'))
)
BEGIN
  SELECT RAISE(ABORT, 'invalid_sections_shadow_epoch_transition');
END;

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_epoch_content_immutable
BEFORE UPDATE ON sections_shadow_epochs
WHEN OLD.state <> 'STAGED' AND (
  NEW.logical_slot IS NOT OLD.logical_slot OR
  NEW.scheduled_at_ms IS NOT OLD.scheduled_at_ms OR
  NEW.evaluation_now_ms IS NOT OLD.evaluation_now_ms OR
  NEW.attempt IS NOT OLD.attempt OR
  NEW.acquisition_mode IS NOT OLD.acquisition_mode OR
  NEW.expected_lane_count IS NOT OLD.expected_lane_count OR
  NEW.terminal_lane_count IS NOT OLD.terminal_lane_count OR
  NEW.expected_decision_count IS NOT OLD.expected_decision_count OR
  NEW.actual_decision_count IS NOT OLD.actual_decision_count OR
  NEW.source_registry_version IS NOT OLD.source_registry_version OR
  NEW.source_registry_digest IS NOT OLD.source_registry_digest OR
  NEW.input_evidence_digest IS NOT OLD.input_evidence_digest OR
  NEW.decision_output_digest IS NOT OLD.decision_output_digest OR
  NEW.evidence_object_key IS NOT OLD.evidence_object_key OR
  NEW.evidence_object_digest IS NOT OLD.evidence_object_digest OR
  NEW.evidence_verified IS NOT OLD.evidence_verified
)
BEGIN
  SELECT RAISE(ABORT, 'sealed_sections_shadow_epoch_is_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_epoch_delete_immutable
BEFORE DELETE ON sections_shadow_epochs
WHEN OLD.state IN ('SEALED', 'SHADOW_COMMITTED')
BEGIN
  SELECT RAISE(ABORT, 'sealed_sections_shadow_epoch_cannot_be_deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_lane_insert_staged
BEFORE INSERT ON sections_shadow_lane_evidence
WHEN NOT EXISTS (
  SELECT 1 FROM sections_shadow_epochs
  WHERE epoch_id = NEW.epoch_id AND state = 'STAGED'
)
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_lane_requires_staged_epoch');
END;

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_lane_update_staged
BEFORE UPDATE ON sections_shadow_lane_evidence
WHEN NOT EXISTS (
  SELECT 1 FROM sections_shadow_epochs
  WHERE epoch_id = NEW.epoch_id AND state = 'STAGED'
)
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_lane_update_requires_staged_epoch');
END;

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_lane_delete_staged
BEFORE DELETE ON sections_shadow_lane_evidence
WHEN NOT EXISTS (
  SELECT 1 FROM sections_shadow_epochs
  WHERE epoch_id = OLD.epoch_id AND state = 'STAGED'
)
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_lane_delete_requires_staged_epoch');
END;

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_decision_insert_staged
BEFORE INSERT ON sections_shadow_decisions
WHEN NOT EXISTS (
  SELECT 1 FROM sections_shadow_epochs
  WHERE epoch_id = NEW.epoch_id AND state = 'STAGED'
)
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_decision_requires_staged_epoch');
END;

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_decision_update_staged
BEFORE UPDATE ON sections_shadow_decisions
WHEN NOT EXISTS (
  SELECT 1 FROM sections_shadow_epochs
  WHERE epoch_id = NEW.epoch_id AND state = 'STAGED'
)
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_decision_update_requires_staged_epoch');
END;

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_decision_delete_staged
BEFORE DELETE ON sections_shadow_decisions
WHEN NOT EXISTS (
  SELECT 1 FROM sections_shadow_epochs
  WHERE epoch_id = OLD.epoch_id AND state = 'STAGED'
)
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_decision_delete_requires_staged_epoch');
END;

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_pointer_requires_commit
BEFORE INSERT ON sections_shadow_current_pointer
WHEN NOT EXISTS (
  SELECT 1 FROM sections_shadow_epochs
  WHERE epoch_id = NEW.epoch_id
    AND state = 'SHADOW_COMMITTED'
    AND logical_slot = NEW.logical_slot
)
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_pointer_requires_committed_epoch');
END;

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_pointer_update_requires_commit
BEFORE UPDATE ON sections_shadow_current_pointer
WHEN NOT EXISTS (
  SELECT 1 FROM sections_shadow_epochs
  WHERE epoch_id = NEW.epoch_id
    AND state = 'SHADOW_COMMITTED'
    AND logical_slot = NEW.logical_slot
)
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_pointer_update_requires_committed_epoch');
END;
