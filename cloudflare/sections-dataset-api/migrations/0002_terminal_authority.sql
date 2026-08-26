CREATE TRIGGER IF NOT EXISTS trg_source_run_authority_immutable
BEFORE UPDATE ON source_runs
FOR EACH ROW
WHEN NEW.run_id IS NOT OLD.run_id
  OR NEW.scheduled_at IS NOT OLD.scheduled_at
  OR NEW.acquisition_started_at IS NOT OLD.acquisition_started_at
  OR NEW.code_commit_sha IS NOT OLD.code_commit_sha
  OR NEW.source_registry_version IS NOT OLD.source_registry_version
  OR NEW.source_registry_digest IS NOT OLD.source_registry_digest
BEGIN
  SELECT RAISE(ABORT, 'source run authority is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_source_run_terminal_immutable
BEFORE UPDATE ON source_runs
FOR EACH ROW
WHEN OLD.state IN ('COMPLETE', 'FAILED')
BEGIN
  SELECT RAISE(ABORT, 'terminal source run is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_source_evidence_insert_requires_running
BEFORE INSERT ON source_fetch_evidence
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM source_runs r
  WHERE r.run_id = NEW.run_id AND r.state = 'RUNNING'
)
BEGIN
  SELECT RAISE(ABORT, 'source evidence is writable only while run is RUNNING');
END;

CREATE TRIGGER IF NOT EXISTS trg_source_evidence_update_requires_running
BEFORE UPDATE ON source_fetch_evidence
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM source_runs r
  WHERE r.run_id = OLD.run_id AND r.state = 'RUNNING'
)
BEGIN
  SELECT RAISE(ABORT, 'source evidence is writable only while run is RUNNING');
END;

CREATE TRIGGER IF NOT EXISTS trg_source_evidence_delete_requires_running
BEFORE DELETE ON source_fetch_evidence
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM source_runs r
  WHERE r.run_id = OLD.run_id AND r.state = 'RUNNING'
)
BEGIN
  SELECT RAISE(ABORT, 'source evidence is writable only while run is RUNNING');
END;

CREATE TRIGGER IF NOT EXISTS trg_snapshot_authority_immutable
BEFORE UPDATE ON section_snapshots
FOR EACH ROW
WHEN NEW.snapshot_id IS NOT OLD.snapshot_id
  OR NEW.run_id IS NOT OLD.run_id
  OR NEW.snapshot_schema_version IS NOT OLD.snapshot_schema_version
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.source_registry_version IS NOT OLD.source_registry_version
  OR NEW.source_registry_digest IS NOT OLD.source_registry_digest
  OR NEW.source_identity_version IS NOT OLD.source_identity_version
  OR NEW.normalization_version IS NOT OLD.normalization_version
  OR NEW.normalization_digest IS NOT OLD.normalization_digest
  OR NEW.event_classifier_version IS NOT OLD.event_classifier_version
  OR NEW.ranker_version IS NOT OLD.ranker_version
  OR NEW.ranker_policy_digest IS NOT OLD.ranker_policy_digest
  OR NEW.input_evidence_digest IS NOT OLD.input_evidence_digest
  OR NEW.decision_output_digest IS NOT OLD.decision_output_digest
  OR NEW.expected_section_count IS NOT OLD.expected_section_count
  OR NEW.expected_item_count IS NOT OLD.expected_item_count
  OR NEW.expected_partition_digest IS NOT OLD.expected_partition_digest
  OR NEW.expected_item_rows_digest IS NOT OLD.expected_item_rows_digest
BEGIN
  SELECT RAISE(ABORT, 'snapshot authority is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_committed_snapshot_record_immutable
BEFORE UPDATE ON section_snapshots
FOR EACH ROW
WHEN OLD.state = 'COMMITTED'
BEGIN
  SELECT RAISE(ABORT, 'COMMITTED snapshot record is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_parity_result_append_only_update
BEFORE UPDATE ON parity_results
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'parity results are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_parity_result_append_only_delete
BEFORE DELETE ON parity_results
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'parity results are append-only');
END;
