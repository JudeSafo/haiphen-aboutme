PRAGMA foreign_keys=ON;

-- What “feeds” exist (you can hardcode a few rows at first).
CREATE TABLE IF NOT EXISTS email_lists (
  list_id TEXT PRIMARY KEY,                 -- e.g. "daily_metrics"
  name TEXT NOT NULL,                       -- e.g. "Daily Metrics Digest"
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','disabled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Per-user subscriptions. Each user can subscribe to multiple lists.
CREATE TABLE IF NOT EXISTS user_email_subscriptions (
  user_login TEXT NOT NULL,
  list_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  prefs_json TEXT,                          -- JSON blob for per-user list prefs (symbols, kpis, thresholds, etc)
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_login, list_id),
  FOREIGN KEY(user_login) REFERENCES users(user_login) ON DELETE CASCADE,
  FOREIGN KEY(list_id) REFERENCES email_lists(list_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_email_subscriptions_list_active
  ON user_email_subscriptions(list_id, active);

-- Delivery log: idempotency + debugging + retries.
CREATE TABLE IF NOT EXISTS email_deliveries (
  delivery_id TEXT PRIMARY KEY,             -- uuid
  user_login TEXT NOT NULL,
  list_id TEXT NOT NULL,
  send_date TEXT NOT NULL,                  -- YYYY-MM-DD (the “digest date”)
  status TEXT NOT NULL
    CHECK(status IN ('queued','sent','failed','skipped')),
  message_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(user_login) REFERENCES users(user_login) ON DELETE CASCADE,
  FOREIGN KEY(list_id) REFERENCES email_lists(list_id) ON DELETE CASCADE
);

-- Enforce “at most one attempt per user/list/date” (idempotency)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_email_deliveries_user_list_date
  ON email_deliveries(user_login, list_id, send_date);