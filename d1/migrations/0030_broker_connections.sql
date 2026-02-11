-- Broker connections and sync log for paper trading integration
-- Migration: 0030_broker_connections.sql

CREATE TABLE IF NOT EXISTS broker_connections (
  user_id TEXT NOT NULL,
  broker TEXT NOT NULL CHECK(broker IN ('alpaca','schwab')),
  account_id TEXT,
  account_type TEXT NOT NULL DEFAULT 'paper' CHECK(account_type = 'paper'),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disconnected','error')),
  constraints_json TEXT,
  connected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, broker)
);

CREATE TABLE IF NOT EXISTS broker_sync_log (
  sync_id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  broker TEXT NOT NULL,
  sync_type TEXT NOT NULL CHECK(sync_type IN ('positions','orders','kpis')),
  records_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','success','error')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
