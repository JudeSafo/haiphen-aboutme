PRAGMA foreign_keys=ON;

-- Deduplicate Stripe webhook deliveries by Stripe event id.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  type TEXT,
  created INTEGER,                 -- Stripe event.created (unix seconds)
  processed_at INTEGER NOT NULL    -- our processing time (unix seconds)
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at
  ON stripe_webhook_events(processed_at);