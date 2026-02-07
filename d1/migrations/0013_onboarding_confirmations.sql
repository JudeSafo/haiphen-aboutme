PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS onboarding_confirmations (
  user_login TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'pro'
    CHECK(plan IN ('pro', 'enterprise')),
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  message_id TEXT,
  source TEXT,          -- e.g. "stripe_webhook"
  request_id TEXT,      -- caller idempotency token
  details_json TEXT,    -- debug payload
  FOREIGN KEY(user_login) REFERENCES users(user_login) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_onboarding_confirmations_sent_at
  ON onboarding_confirmations(sent_at);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_onboarding_confirmations_request_id
  ON onboarding_confirmations(request_id)
  WHERE request_id IS NOT NULL;
