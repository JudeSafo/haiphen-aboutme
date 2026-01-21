PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS welcome_emails (
  user_login TEXT PRIMARY KEY,
  entitlement_updated_at INTEGER,  -- unixepoch from entitlements.updated_at
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  message_id TEXT,
  source TEXT,                     -- "stripe_webhook" etc
  request_id TEXT,                 -- idempotency key from caller
  details_json TEXT                -- json for debugging
);

CREATE INDEX IF NOT EXISTS idx_welcome_emails_sent_at
  ON welcome_emails(sent_at);