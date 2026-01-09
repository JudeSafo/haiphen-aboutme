-- Checkout session tracking
CREATE TABLE IF NOT EXISTS checkout_sessions (
  checkout_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  stripe_session_id TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_user_id
  ON checkout_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_stripe_session_id
  ON checkout_sessions(stripe_session_id);

-- Minimal entitlement flag (extend later with plan/tier/period_end)
CREATE TABLE IF NOT EXISTS entitlements (
  user_id TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);