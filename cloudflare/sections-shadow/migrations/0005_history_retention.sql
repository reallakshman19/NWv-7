DROP TRIGGER trg_sections_shadow_epoch_delete_immutable;
DROP TRIGGER trg_sections_shadow_lane_delete_staged;
DROP TRIGGER trg_sections_shadow_decision_delete_staged;

CREATE TRIGGER trg_sections_shadow_epoch_delete_immutable
BEFORE DELETE ON sections_shadow_epochs
WHEN EXISTS (SELECT 1 FROM sections_shadow_current_pointer WHERE epoch_id = OLD.epoch_id)
  OR (OLD.state IN ('SEALED', 'SHADOW_COMMITTED') AND OLD.logical_slot > (unixepoch() - 604800) * 1000)
BEGIN
  SELECT RAISE(ABORT, 'sealed_sections_shadow_epoch_cannot_be_deleted');
END;

CREATE TRIGGER trg_sections_shadow_lane_delete_staged
BEFORE DELETE ON sections_shadow_lane_evidence
WHEN NOT EXISTS (
  SELECT 1 FROM sections_shadow_epochs e
  WHERE e.epoch_id = OLD.epoch_id AND (
    e.state = 'STAGED' OR (
      e.logical_slot <= (unixepoch() - 604800) * 1000
      AND NOT EXISTS (SELECT 1 FROM sections_shadow_current_pointer WHERE epoch_id = e.epoch_id)
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_lane_delete_requires_staged_or_expired_epoch');
END;

CREATE TRIGGER trg_sections_shadow_decision_delete_staged
BEFORE DELETE ON sections_shadow_decisions
WHEN NOT EXISTS (
  SELECT 1 FROM sections_shadow_epochs e
  WHERE e.epoch_id = OLD.epoch_id AND (
    e.state = 'STAGED' OR (
      e.logical_slot <= (unixepoch() - 604800) * 1000
      AND NOT EXISTS (SELECT 1 FROM sections_shadow_current_pointer WHERE epoch_id = e.epoch_id)
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'sections_shadow_decision_delete_requires_staged_or_expired_epoch');
END;
