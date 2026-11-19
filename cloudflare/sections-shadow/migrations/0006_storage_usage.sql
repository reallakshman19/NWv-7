-- Account for all retained JSON, including per-candidate ranking evidence.
-- Initial backfill scans each body once. Subsequent writers read one ledger row.
CREATE TABLE sections_shadow_storage_usage (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  object_count INTEGER NOT NULL CHECK (object_count >= 0),
  retained_bytes INTEGER NOT NULL CHECK (retained_bytes >= 0)
);

INSERT INTO sections_shadow_storage_usage
SELECT 1,
  (SELECT COUNT(*) FROM sections_shadow_lane_payloads) +
  (SELECT COUNT(*) FROM sections_shadow_evidence_objects),
  (SELECT COALESCE(SUM(length(CAST(payload_json AS BLOB))), 0) FROM sections_shadow_lane_payloads) +
  (SELECT COALESCE(SUM(length(CAST(content_json AS BLOB))), 0) FROM sections_shadow_evidence_objects) +
  (SELECT COALESCE(SUM(length(CAST(evidence_json AS BLOB))), 0) FROM sections_shadow_decisions);

-- The hard ceiling also covers competing writers and direct SQL paths.
CREATE TRIGGER trg_sections_shadow_payload_storage_cap
BEFORE INSERT ON sections_shadow_lane_payloads
WHEN NOT EXISTS (SELECT 1 FROM sections_shadow_lane_payloads WHERE epoch_id = NEW.epoch_id AND lane_id = NEW.lane_id)
  AND (SELECT retained_bytes FROM sections_shadow_storage_usage WHERE singleton = 1)
    + length(CAST(NEW.payload_json AS BLOB)) > 350000000
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_storage_capacity_exhausted');
END;

CREATE TRIGGER trg_sections_shadow_payload_usage_insert
AFTER INSERT ON sections_shadow_lane_payloads
BEGIN
  UPDATE sections_shadow_storage_usage
  SET object_count = object_count + 1,
      retained_bytes = retained_bytes + length(CAST(NEW.payload_json AS BLOB))
  WHERE singleton = 1;
END;

CREATE TRIGGER trg_sections_shadow_payload_usage_delete
AFTER DELETE ON sections_shadow_lane_payloads
BEGIN
  UPDATE sections_shadow_storage_usage
  SET object_count = object_count - 1,
      retained_bytes = retained_bytes - length(CAST(OLD.payload_json AS BLOB))
  WHERE singleton = 1;
END;

CREATE TRIGGER trg_sections_shadow_payload_usage_update
AFTER UPDATE OF payload_json ON sections_shadow_lane_payloads
BEGIN
  UPDATE sections_shadow_storage_usage
  SET retained_bytes = retained_bytes
    + length(CAST(NEW.payload_json AS BLOB)) - length(CAST(OLD.payload_json AS BLOB))
  WHERE singleton = 1;
END;

-- The hard ceiling also covers competing writers and direct SQL paths.
CREATE TRIGGER trg_sections_shadow_object_storage_cap
BEFORE INSERT ON sections_shadow_evidence_objects
WHEN NOT EXISTS (SELECT 1 FROM sections_shadow_evidence_objects WHERE object_key = NEW.object_key)
  AND (SELECT retained_bytes FROM sections_shadow_storage_usage WHERE singleton = 1)
    + length(CAST(NEW.content_json AS BLOB)) > 350000000
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_storage_capacity_exhausted');
END;

CREATE TRIGGER trg_sections_shadow_object_usage_insert
AFTER INSERT ON sections_shadow_evidence_objects
BEGIN
  UPDATE sections_shadow_storage_usage
  SET object_count = object_count + 1,
      retained_bytes = retained_bytes + length(CAST(NEW.content_json AS BLOB))
  WHERE singleton = 1;
END;

CREATE TRIGGER trg_sections_shadow_object_usage_delete
AFTER DELETE ON sections_shadow_evidence_objects
BEGIN
  UPDATE sections_shadow_storage_usage
  SET object_count = object_count - 1,
      retained_bytes = retained_bytes - length(CAST(OLD.content_json AS BLOB))
  WHERE singleton = 1;
END;

CREATE TRIGGER trg_sections_shadow_object_usage_update
AFTER UPDATE OF content_json ON sections_shadow_evidence_objects
BEGIN
  UPDATE sections_shadow_storage_usage
  SET retained_bytes = retained_bytes
    + length(CAST(NEW.content_json AS BLOB)) - length(CAST(OLD.content_json AS BLOB))
  WHERE singleton = 1;
END;

-- The hard ceiling also covers competing writers and direct SQL paths.
CREATE TRIGGER trg_sections_shadow_decision_storage_cap
BEFORE INSERT ON sections_shadow_decisions
WHEN NOT EXISTS (SELECT 1 FROM sections_shadow_decisions WHERE epoch_id = NEW.epoch_id AND candidate_identity = NEW.candidate_identity)
  AND (SELECT retained_bytes FROM sections_shadow_storage_usage WHERE singleton = 1)
    + length(CAST(NEW.evidence_json AS BLOB)) > 350000000
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_storage_capacity_exhausted');
END;

CREATE TRIGGER trg_sections_shadow_decision_usage_insert
AFTER INSERT ON sections_shadow_decisions
BEGIN
  UPDATE sections_shadow_storage_usage
  SET object_count = object_count + 0,
      retained_bytes = retained_bytes + length(CAST(NEW.evidence_json AS BLOB))
  WHERE singleton = 1;
END;

CREATE TRIGGER trg_sections_shadow_decision_usage_delete
AFTER DELETE ON sections_shadow_decisions
BEGIN
  UPDATE sections_shadow_storage_usage
  SET object_count = object_count - 0,
      retained_bytes = retained_bytes - length(CAST(OLD.evidence_json AS BLOB))
  WHERE singleton = 1;
END;

CREATE TRIGGER trg_sections_shadow_decision_usage_update
AFTER UPDATE OF evidence_json ON sections_shadow_decisions
BEGIN
  UPDATE sections_shadow_storage_usage
  SET retained_bytes = retained_bytes
    + length(CAST(NEW.evidence_json AS BLOB)) - length(CAST(OLD.evidence_json AS BLOB))
  WHERE singleton = 1;
END;

CREATE INDEX idx_sections_shadow_parity_created ON sections_shadow_parity_results(created_at_ms);
CREATE INDEX idx_sections_shadow_parity_epoch ON sections_shadow_parity_results(shadow_epoch_id);

CREATE TRIGGER trg_sections_shadow_payload_storage_update_cap
BEFORE UPDATE OF payload_json ON sections_shadow_lane_payloads
WHEN (SELECT retained_bytes FROM sections_shadow_storage_usage WHERE singleton = 1)
  + length(CAST(NEW.payload_json AS BLOB)) - length(CAST(OLD.payload_json AS BLOB)) > 350000000
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_storage_capacity_exhausted');
END;

CREATE TRIGGER trg_sections_shadow_object_storage_update_cap
BEFORE UPDATE OF content_json ON sections_shadow_evidence_objects
WHEN (SELECT retained_bytes FROM sections_shadow_storage_usage WHERE singleton = 1)
  + length(CAST(NEW.content_json AS BLOB)) - length(CAST(OLD.content_json AS BLOB)) > 350000000
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_storage_capacity_exhausted');
END;

CREATE TRIGGER trg_sections_shadow_decision_storage_update_cap
BEFORE UPDATE OF evidence_json ON sections_shadow_decisions
WHEN (SELECT retained_bytes FROM sections_shadow_storage_usage WHERE singleton = 1)
  + length(CAST(NEW.evidence_json AS BLOB)) - length(CAST(OLD.evidence_json AS BLOB)) > 350000000
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_storage_capacity_exhausted');
END;
