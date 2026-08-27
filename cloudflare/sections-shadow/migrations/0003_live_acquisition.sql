PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sections_shadow_lane_payloads (
  epoch_id TEXT NOT NULL,
  lane_id TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  item_count INTEGER NOT NULL CHECK (item_count >= 0 AND item_count <= 20),
  byte_length INTEGER NOT NULL CHECK (byte_length > 0 AND byte_length <= 60000),
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  PRIMARY KEY (epoch_id, lane_id),
  FOREIGN KEY (epoch_id) REFERENCES sections_shadow_epochs(epoch_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sections_shadow_lane_payload_expiry
  ON sections_shadow_lane_payloads(expires_at_ms);

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_lane_payload_insert_staged
BEFORE INSERT ON sections_shadow_lane_payloads
WHEN NOT EXISTS (
  SELECT 1 FROM sections_shadow_epochs
  WHERE epoch_id = NEW.epoch_id AND state = 'STAGED'
)
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_lane_payload_requires_staged_epoch');
END;

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_lane_payload_update_immutable
BEFORE UPDATE ON sections_shadow_lane_payloads
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_lane_payload_is_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_lane_payload_delete_staged
BEFORE DELETE ON sections_shadow_lane_payloads
WHEN EXISTS (
  SELECT 1 FROM sections_shadow_epochs
  WHERE epoch_id = OLD.epoch_id AND state = 'STAGED'
)
BEGIN
  SELECT RAISE(ABORT, 'staged_sections_shadow_lane_payload_cannot_be_deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_sections_shadow_live_lane_requires_payload
BEFORE INSERT ON sections_shadow_lane_evidence
WHEN EXISTS (
  SELECT 1 FROM sections_shadow_epochs
  WHERE epoch_id = NEW.epoch_id AND acquisition_mode = 'INDEPENDENT_LIVE'
) AND NOT EXISTS (
  SELECT 1 FROM sections_shadow_lane_payloads
  WHERE epoch_id = NEW.epoch_id AND lane_id = NEW.lane_id
)
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_live_lane_requires_payload');
END;
