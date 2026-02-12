-- Daily trading report snapshots synced from GKE PostgreSQL
-- Migration: 0031_trading_report_snapshots.sql

CREATE TABLE IF NOT EXISTS trading_report_snapshots (
  date       TEXT NOT NULL PRIMARY KEY,  -- YYYY-MM-DD
  payload    TEXT NOT NULL,              -- Full JSON blob from GKE sync job
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO email_lists (list_id, name, description, status)
VALUES ('trading_report', 'Daily Trading Report', 'Automated post-market trading performance email', 'active');
