PRAGMA foreign_keys=ON;

-- Per-user telemetry configuration (contract selector + thresholds)
CREATE TABLE IF NOT EXISTS telemetry_config (
  user_login TEXT PRIMARY KEY,
  contract_selector_json TEXT, -- { mode: "auto"|"manual", contract_name?, symbol? }
  thresholds_json TEXT,        -- { entry_threshold, exit_threshold, neutral_band, weights, ... }
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(user_login) REFERENCES users(user_login) ON DELETE CASCADE
);
