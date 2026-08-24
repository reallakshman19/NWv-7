PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS daily_digest_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  digest_date TEXT NOT NULL UNIQUE,
  schema_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  registry_version TEXT NOT NULL,
  decision_timezone TEXT NOT NULL,
  collection_started_at TEXT,
  frozen_at TEXT NOT NULL,
  snapshot_revision INTEGER NOT NULL CHECK (snapshot_revision >= 1),
  composition_state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_digest_selections (
  snapshot_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  initial_canonical_id TEXT NOT NULL,
  effective_canonical_id TEXT NOT NULL,
  selection_reason TEXT NOT NULL,
  replacement_reason TEXT,
  PRIMARY KEY (snapshot_id, slot),
  FOREIGN KEY (snapshot_id) REFERENCES daily_digest_snapshots(snapshot_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_digest_candidates (
  snapshot_id TEXT NOT NULL,
  canonical_id TEXT NOT NULL,
  publisher_family TEXT NOT NULL,
  product TEXT NOT NULL,
  edition TEXT NOT NULL,
  role TEXT NOT NULL,
  qualification_state TEXT NOT NULL,
  schedule_state TEXT NOT NULL,
  acquisition_state TEXT NOT NULL,
  edition_state TEXT NOT NULL,
  accessibility_state TEXT NOT NULL,
  role_fit_class TEXT NOT NULL,
  significance_class TEXT NOT NULL,
  breadth_class TEXT NOT NULL,
  diversity_class TEXT NOT NULL,
  provenance_class TEXT NOT NULL,
  decision TEXT NOT NULL,
  decision_reason TEXT NOT NULL,
  publisher_published_at TEXT,
  observed_at TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, canonical_id),
  FOREIGN KEY (snapshot_id) REFERENCES daily_digest_snapshots(snapshot_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_digest_selection_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL,
  snapshot_revision INTEGER NOT NULL,
  slot TEXT NOT NULL,
  event_type TEXT NOT NULL,
  prior_canonical_id TEXT NOT NULL,
  next_canonical_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES daily_digest_snapshots(snapshot_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_daily_digest_candidates_snapshot
  ON daily_digest_candidates(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_daily_digest_events_snapshot_revision
  ON daily_digest_selection_events(snapshot_id, snapshot_revision);
