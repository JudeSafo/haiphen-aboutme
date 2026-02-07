PRAGMA foreign_keys=ON;

-- Telemetry signal events (per user, per evaluation)
CREATE TABLE IF NOT EXISTS telemetry_events (
  event_id TEXT PRIMARY KEY, -- uuid
  user_login TEXT NOT NULL,
  contract_name TEXT NOT NULL,
  symbol TEXT,
  signal_type TEXT NOT NULL CHECK(signal_type IN ('entry','exit','neutral')),
  score REAL NOT NULL,
  summary TEXT NOT NULL,
  metrics_json TEXT NOT NULL, -- raw metrics + inputs used for scoring
  source_date TEXT,           -- YYYY-MM-DD (from trades.json)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(user_login) REFERENCES users(user_login) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_user_created
  ON telemetry_events(user_login, created_at);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_contract_created
  ON telemetry_events(contract_name, created_at);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_source_date
  ON telemetry_events(source_date);
