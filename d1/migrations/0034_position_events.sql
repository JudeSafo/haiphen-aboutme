-- ============================================
-- File: 0034_position_events.sql
-- Date: 2026-02-12
-- Author: Claude Code
-- Description: Position events table for CLI consumer.
--   Stores denormalized entry/exit lifecycle data
--   for each trade leg, synced from GKE cluster every
--   5 minutes during market hours.
-- Rollback: DROP TABLE IF EXISTS position_events;
-- ============================================

CREATE TABLE IF NOT EXISTS position_events (
  -- Primary key: "{trade_id}_{buy_sell_id}" for uniqueness per leg
  id              TEXT    NOT NULL PRIMARY KEY,

  -- Trade identifiers
  trade_id        INTEGER NOT NULL,
  buy_sell_id     INTEGER NOT NULL,

  -- Contract
  underlying      TEXT    NOT NULL,           -- "AAPL"
  contract_name   TEXT    NOT NULL,           -- OCC symbol "AAPL260220C00230000"
  option_type     TEXT,                       -- "call" | "put"
  strike_price    REAL,
  expiration_date TEXT,                       -- YYYY-MM-DD
  strategy        TEXT,                       -- "Vertical Arbitrage"

  -- Entry order
  entry_side      TEXT,                       -- "buy" | "sell"
  entry_order_type TEXT,                      -- "limit" | "market"
  entry_limit_price REAL,                     -- submitted limit (per-share)
  entry_premium   REAL,                       -- mid-price reference at entry
  entry_time      TEXT,                       -- ISO8601 timestamp

  -- Entry conditions (JSON blob)
  entry_condition TEXT,                       -- full JSONB from buy_sell
  exit_condition  TEXT,                       -- {profitTarget, stopLoss, ...}

  -- Greeks / metrics at entry time
  delta           REAL,
  gamma           REAL,
  theta           REAL,
  vega            REAL,
  iv              REAL,

  -- Market snapshot at entry
  bid_price       REAL,
  ask_price       REAL,
  last_price      REAL,
  spot_price      REAL,                       -- underlying price
  dividend_yield  REAL,

  -- Exit order (NULL while position is open)
  exit_side       TEXT,
  exit_order_type TEXT,
  exit_limit_price REAL,
  exit_time       TEXT,                       -- ISO8601 timestamp

  -- P&L (populated on close)
  pnl_per_share   REAL,
  pnl_total       REAL,
  hold_seconds    INTEGER,

  -- Status
  trade_status    TEXT    NOT NULL,           -- "active" | "closing" | "closed" | "deprecated"
  close_reason    TEXT,                       -- "profit_target" | "stop_loss" | "time_exit" | "eod" | ...

  -- Sync metadata
  synced_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Index for CLI queries: recent positions by status
CREATE INDEX IF NOT EXISTS idx_position_events_status
  ON position_events(trade_status, synced_at);

-- Index for lookups by underlying
CREATE INDEX IF NOT EXISTS idx_position_events_underlying
  ON position_events(underlying, entry_time);

-- Index for date-range queries
CREATE INDEX IF NOT EXISTS idx_position_events_entry_time
  ON position_events(entry_time);
