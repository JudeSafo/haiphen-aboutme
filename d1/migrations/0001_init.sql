-- Users are identified by GitHub login (sub) from your auth worker.
CREATE TABLE IF NOT EXISTS users (
  user_login TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Plan/entitlement state (set by Stripe webhook or admin)
CREATE TABLE IF NOT EXISTS plans (
  user_login TEXT PRIMARY KEY,
  plan TEXT NOT NULL CHECK(plan IN ('free','pro','enterprise')),
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(user_login) REFERENCES users(user_login) ON DELETE CASCADE
);

-- API keys: store only hashes, never raw keys
CREATE TABLE IF NOT EXISTS api_keys (
  key_id TEXT PRIMARY KEY,                 -- uuid
  user_login TEXT NOT NULL,
  key_prefix TEXT NOT NULL,                -- short prefix for UX, e.g. hp_live_ab12cd34
  key_hash TEXT NOT NULL UNIQUE,           -- sha256(hex) of key + pepper
  scopes TEXT NOT NULL,                    -- JSON string array: ["metrics:read", ...]
  status TEXT NOT NULL CHECK(status IN ('active','revoked')) DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at TEXT,
  last_used_at TEXT,
  FOREIGN KEY(user_login) REFERENCES users(user_login) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_login);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

-- Daily metrics archive (your engine can publish here once/day)
CREATE TABLE IF NOT EXISTS metrics_daily (
  date TEXT PRIMARY KEY,                   -- YYYY-MM-DD
  updated_at TEXT NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  rows_json TEXT NOT NULL,                 -- JSON array of KPI rows
  overlay_json TEXT NOT NULL               -- JSON object
);

-- Webhook subscriptions
CREATE TABLE IF NOT EXISTS webhooks (
  webhook_id TEXT PRIMARY KEY,             -- uuid
  user_login TEXT NOT NULL,
  url TEXT NOT NULL,
  events_json TEXT NOT NULL,               -- JSON array
  secret TEXT NOT NULL,                    -- signing secret (random)
  status TEXT NOT NULL CHECK(status IN ('active','disabled')) DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(user_login) REFERENCES users(user_login) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_login);

-- Optional delivery log (helps debugging)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  event TEXT NOT NULL,
  date TEXT,
  request_id TEXT NOT NULL,
  status_code INTEGER,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(webhook_id) REFERENCES webhooks(webhook_id) ON DELETE CASCADE
);