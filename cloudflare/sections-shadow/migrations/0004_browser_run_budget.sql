PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sections_shadow_browser_quota_daily (
  day_key TEXT PRIMARY KEY,
  epochs_reserved INTEGER NOT NULL DEFAULT 0 CHECK (epochs_reserved >= 0),
  browser_ms_reserved INTEGER NOT NULL DEFAULT 0 CHECK (browser_ms_reserved >= 0),
  browser_ms_observed INTEGER NOT NULL DEFAULT 0 CHECK (browser_ms_observed >= 0),
  blocked_starts INTEGER NOT NULL DEFAULT 0 CHECK (blocked_starts >= 0),
  updated_at_ms INTEGER NOT NULL
);
