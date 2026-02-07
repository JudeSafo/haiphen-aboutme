-- Service subscription tracking with trial support
-- Migration: 0014_service_subscriptions.sql

CREATE TABLE IF NOT EXISTS service_subscriptions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_login TEXT NOT NULL,
  service_id TEXT NOT NULL,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  status TEXT DEFAULT 'trialing'
    CHECK(status IN ('trialing','active','canceled','past_due','paused')),
  trial_requests_used INTEGER DEFAULT 0,
  trial_requests_limit INTEGER DEFAULT 0,
  trial_ends_at TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_login, service_id)
);

CREATE INDEX IF NOT EXISTS idx_service_subs_user ON service_subscriptions(user_login);
CREATE INDEX IF NOT EXISTS idx_service_subs_service ON service_subscriptions(service_id);
CREATE INDEX IF NOT EXISTS idx_service_subs_status ON service_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_service_subs_stripe ON service_subscriptions(stripe_subscription_id);
