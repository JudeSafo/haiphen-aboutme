-- 0017_daily_quota_log.sql
-- Audit table for daily quota snapshots (flushed from QuotaDO at end of day or on demand)

CREATE TABLE IF NOT EXISTS daily_quota_log (
  date          TEXT    NOT NULL PRIMARY KEY,  -- 'YYYY-MM-DD'
  global_count  INTEGER NOT NULL DEFAULT 0,
  unique_sessions INTEGER NOT NULL DEFAULT 0,
  top_users_json TEXT,                         -- JSON array of {user_id, count}
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
