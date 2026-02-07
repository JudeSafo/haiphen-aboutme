-- 0023_causal_tables.sql
-- Event ingestion and causal analysis results

CREATE TABLE IF NOT EXISTS causal_events (
  event_id      TEXT NOT NULL PRIMARY KEY,
  user_login    TEXT NOT NULL,
  event_type    TEXT NOT NULL,                 -- e.g. firmware_update, restart, alert, config_change
  source        TEXT NOT NULL,                 -- e.g. device name or system
  description   TEXT,
  severity      TEXT DEFAULT 'info'
    CHECK(severity IN ('critical','high','medium','low','info')),
  timestamp     TEXT NOT NULL,                 -- ISO 8601
  metadata_json TEXT,                          -- JSON: arbitrary event data
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_causal_events_user ON causal_events(user_login);
CREATE INDEX IF NOT EXISTS idx_causal_events_type ON causal_events(event_type);
CREATE INDEX IF NOT EXISTS idx_causal_events_source ON causal_events(source);
CREATE INDEX IF NOT EXISTS idx_causal_events_ts ON causal_events(timestamp);

CREATE TABLE IF NOT EXISTS causal_analyses (
  analysis_id     TEXT NOT NULL PRIMARY KEY,
  user_login      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed')),
  event_ids_json  TEXT NOT NULL,               -- JSON array of event_id references
  window_hours    REAL NOT NULL DEFAULT 24,
  dag_json        TEXT,                        -- JSON: full DAG structure {nodes, edges}
  root_causes_json TEXT,                       -- JSON array: [{event_id, confidence, impact}]
  propagation_json TEXT,                       -- JSON: ordered chain from root to effects
  counterfactuals_json TEXT,                   -- JSON array: [{removed_event, impact_reduction}]
  total_events    INTEGER DEFAULT 0,
  root_cause_count INTEGER DEFAULT 0,
  started_at      TEXT,
  completed_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_causal_analyses_user ON causal_analyses(user_login);
CREATE INDEX IF NOT EXISTS idx_causal_analyses_status ON causal_analyses(status);
