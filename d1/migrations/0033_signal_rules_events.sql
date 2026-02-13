-- Signal daemon: rules + events audit log
-- Migration: 0033_signal_rules_events.sql

CREATE TABLE IF NOT EXISTS signal_rules (
  rule_id        TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  name           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','disabled')),
  symbols_json   TEXT,                          -- JSON array of target tickers
  entry_conditions_json  TEXT NOT NULL,          -- nested AND/OR condition tree
  exit_conditions_json   TEXT,                   -- optional exit condition tree
  order_side     TEXT NOT NULL CHECK (order_side IN ('buy','sell')),
  order_type     TEXT NOT NULL DEFAULT 'market' CHECK (order_type IN ('market','limit','stop','stop_limit')),
  order_qty      REAL NOT NULL CHECK (order_qty > 0),
  order_tif      TEXT NOT NULL DEFAULT 'day' CHECK (order_tif IN ('day','gtc','ioc','fok')),
  cooldown_seconds INTEGER NOT NULL DEFAULT 300 CHECK (cooldown_seconds >= 60),
  temporal_json  TEXT,                          -- placeholder for per-contract time windows
  version        INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_signal_rules_user ON signal_rules (user_id, status);

CREATE TABLE IF NOT EXISTS signal_events (
  event_id       TEXT PRIMARY KEY,
  rule_id        TEXT NOT NULL REFERENCES signal_rules(rule_id),
  user_id        TEXT NOT NULL,
  event_type     TEXT NOT NULL CHECK (event_type IN (
    'entry_triggered','exit_triggered',
    'order_placed','order_filled','order_failed',
    'cooldown_blocked','error'
  )),
  trigger_snapshot_json   TEXT,                  -- KPI values at trigger time
  matched_conditions_json TEXT,                  -- which conditions matched
  symbol         TEXT,
  order_id       TEXT,
  order_side     TEXT,
  order_qty      REAL,
  order_price    REAL,
  daemon_id      TEXT,                          -- which CLI instance
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_signal_events_rule ON signal_events (rule_id, created_at);
CREATE INDEX IF NOT EXISTS idx_signal_events_user ON signal_events (user_id, created_at);
