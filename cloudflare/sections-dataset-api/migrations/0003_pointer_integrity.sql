DROP TRIGGER IF EXISTS trg_pointer_requires_committed_insert;
DROP TRIGGER IF EXISTS trg_pointer_requires_committed_update;

CREATE TRIGGER IF NOT EXISTS trg_snapshot_insert_requires_staged
BEFORE INSERT ON section_snapshots
FOR EACH ROW
WHEN NEW.state <> 'STAGED'
BEGIN
  SELECT RAISE(ABORT, 'snapshot must be inserted STAGED');
END;

CREATE TRIGGER IF NOT EXISTS trg_pointer_name_insert
BEFORE INSERT ON current_snapshot_pointer
FOR EACH ROW
WHEN NEW.pointer_name <> 'sections-shadow-current'
BEGIN
  SELECT RAISE(ABORT, 'unsupported current snapshot pointer name');
END;

CREATE TRIGGER IF NOT EXISTS trg_pointer_name_update
BEFORE UPDATE OF pointer_name ON current_snapshot_pointer
FOR EACH ROW
WHEN NEW.pointer_name <> 'sections-shadow-current'
BEGIN
  SELECT RAISE(ABORT, 'unsupported current snapshot pointer name');
END;

CREATE TRIGGER IF NOT EXISTS trg_pointer_requires_complete_committed_insert
BEFORE INSERT ON current_snapshot_pointer
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM section_snapshots s
  JOIN source_runs r ON r.run_id = s.run_id
  WHERE s.snapshot_id = NEW.snapshot_id
    AND s.state = 'COMMITTED'
    AND r.state = 'COMPLETE'
    AND s.expected_section_count = (
      SELECT COUNT(*)
      FROM section_snapshot_partitions p
      WHERE p.snapshot_id = s.snapshot_id
    )
    AND s.expected_item_count = (
      SELECT COUNT(*)
      FROM section_snapshot_items i
      WHERE i.snapshot_id = s.snapshot_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM section_snapshot_partitions p
      WHERE p.snapshot_id = s.snapshot_id
        AND p.expected_item_count <> (
          SELECT COUNT(*)
          FROM section_snapshot_items i
          WHERE i.snapshot_id = s.snapshot_id
            AND i.section_key = p.section_key
        )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'current pointer requires COMMITTED complete snapshot');
END;

CREATE TRIGGER IF NOT EXISTS trg_pointer_requires_complete_committed_update
BEFORE UPDATE OF snapshot_id ON current_snapshot_pointer
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM section_snapshots s
  JOIN source_runs r ON r.run_id = s.run_id
  WHERE s.snapshot_id = NEW.snapshot_id
    AND s.state = 'COMMITTED'
    AND r.state = 'COMPLETE'
    AND s.expected_section_count = (
      SELECT COUNT(*)
      FROM section_snapshot_partitions p
      WHERE p.snapshot_id = s.snapshot_id
    )
    AND s.expected_item_count = (
      SELECT COUNT(*)
      FROM section_snapshot_items i
      WHERE i.snapshot_id = s.snapshot_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM section_snapshot_partitions p
      WHERE p.snapshot_id = s.snapshot_id
        AND p.expected_item_count <> (
          SELECT COUNT(*)
          FROM section_snapshot_items i
          WHERE i.snapshot_id = s.snapshot_id
            AND i.section_key = p.section_key
        )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'current pointer requires COMMITTED complete snapshot');
END;
