CREATE TRIGGER IF NOT EXISTS trg_source_run_retry_identity
BEFORE INSERT ON source_runs
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM source_runs r
  WHERE r.run_id = NEW.run_id
    AND (
      r.scheduled_at IS NOT NEW.scheduled_at
      OR r.acquisition_started_at IS NOT NEW.acquisition_started_at
      OR r.code_commit_sha IS NOT NEW.code_commit_sha
      OR r.source_registry_version IS NOT NEW.source_registry_version
      OR r.source_registry_digest IS NOT NEW.source_registry_digest
    )
)
BEGIN
  SELECT RAISE(ABORT, 'source run retry authority conflict');
END;

CREATE TRIGGER IF NOT EXISTS trg_snapshot_retry_identity
BEFORE INSERT ON section_snapshots
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM section_snapshots s
  WHERE s.snapshot_id = NEW.snapshot_id
    AND (
      s.run_id IS NOT NEW.run_id
      OR s.snapshot_schema_version IS NOT NEW.snapshot_schema_version
      OR s.created_at IS NOT NEW.created_at
      OR s.source_registry_version IS NOT NEW.source_registry_version
      OR s.source_registry_digest IS NOT NEW.source_registry_digest
      OR s.source_identity_version IS NOT NEW.source_identity_version
      OR s.normalization_version IS NOT NEW.normalization_version
      OR s.normalization_digest IS NOT NEW.normalization_digest
      OR s.event_classifier_version IS NOT NEW.event_classifier_version
      OR s.ranker_version IS NOT NEW.ranker_version
      OR s.ranker_policy_digest IS NOT NEW.ranker_policy_digest
      OR s.input_evidence_digest IS NOT NEW.input_evidence_digest
      OR s.decision_output_digest IS NOT NEW.decision_output_digest
      OR s.expected_section_count IS NOT NEW.expected_section_count
      OR s.expected_item_count IS NOT NEW.expected_item_count
      OR s.expected_partition_digest IS NOT NEW.expected_partition_digest
      OR s.expected_item_rows_digest IS NOT NEW.expected_item_rows_digest
    )
)
BEGIN
  SELECT RAISE(ABORT, 'snapshot retry authority conflict');
END;

CREATE TRIGGER IF NOT EXISTS trg_partition_retry_identity
BEFORE INSERT ON section_snapshot_partitions
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM section_snapshot_partitions p
  WHERE p.snapshot_id = NEW.snapshot_id
    AND p.section_key = NEW.section_key
    AND p.expected_item_count IS NOT NEW.expected_item_count
)
BEGIN
  SELECT RAISE(ABORT, 'snapshot partition retry conflict');
END;

CREATE TRIGGER IF NOT EXISTS trg_item_retry_identity
BEFORE INSERT ON section_snapshot_items
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM section_snapshot_items i
  WHERE i.snapshot_id = NEW.snapshot_id
    AND i.section_key = NEW.section_key
    AND i.position = NEW.position
    AND (
      i.story_id IS NOT NEW.story_id
      OR i.source_family IS NOT NEW.source_family
      OR i.story_json IS NOT NEW.story_json
    )
)
BEGIN
  SELECT RAISE(ABORT, 'snapshot item retry conflict');
END;
