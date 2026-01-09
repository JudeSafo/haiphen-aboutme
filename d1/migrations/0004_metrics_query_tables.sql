-- d1/migrations/0004_metrics_query_tables.sql
-- Queryable tables derived from metrics_daily.{rows_json, overlay_json}
-- Keep metrics_daily as archival source; normalize for fast API queries.

PRAGMA foreign_keys=ON;

-- ----------------------------
-- KPI rows: metrics_daily.rows[]
-- ----------------------------
CREATE TABLE IF NOT EXISTS metrics_kpi_values (
  date TEXT NOT NULL,                       -- YYYY-MM-DD
  kpi TEXT NOT NULL,
  value_text TEXT NOT NULL,                 -- original string (e.g. "171,902", "6.7s", "+1.24%")
  value_num REAL,                           -- best-effort numeric parse (nullable)
  value_kind TEXT NOT NULL DEFAULT 'text'   -- 'number' | 'percent' | 'text'
    CHECK(value_kind IN ('number','percent','text')),
  PRIMARY KEY (date, kpi),
  FOREIGN KEY(date) REFERENCES metrics_daily(date) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_metrics_kpi_values_kpi_date
  ON metrics_kpi_values(kpi, date);

-- ----------------------------
-- Series points: overlay.seriesByKpi[KPI][] = {t, v, src?}
-- ----------------------------
CREATE TABLE IF NOT EXISTS metrics_series_points (
  date TEXT NOT NULL,
  kpi TEXT NOT NULL,
  t TEXT NOT NULL,                          -- ISO timestamp (as provided)
  v REAL NOT NULL,
  src TEXT,                                 -- e.g. "synthetic" | "mv" | ...
  PRIMARY KEY (date, kpi, t),
  FOREIGN KEY(date) REFERENCES metrics_daily(date) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_metrics_series_points_kpi_date_t
  ON metrics_series_points(kpi, date, t);

-- ----------------------------
-- Extremes: overlay.extremes.byKpi[KPI].{hi, lo, items}[]
-- We store (date,kpi,side,rank) plus a few common fields + item_json for forward-compat.
-- ----------------------------
CREATE TABLE IF NOT EXISTS metrics_extremes_items (
  date TEXT NOT NULL,
  kpi TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('hi','lo')),
  rank INTEGER NOT NULL,
  trade_id INTEGER,
  symbol TEXT,
  contract_name TEXT,
  metric_raw REAL,
  metric_abs REAL,
  individual_pnl REAL,
  abs_individual_pnl REAL,
  percent_change REAL,
  cost_basis REAL,
  qty REAL,
  bid_price REAL,
  ask_price REAL,
  mid_price REAL,
  mid_ts TEXT,
  mid_mark_pnl REAL,
  liquidity_drag REAL,
  item_json TEXT NOT NULL,                  -- full original object
  PRIMARY KEY (date, kpi, side, rank, contract_name, trade_id),
  FOREIGN KEY(date) REFERENCES metrics_daily(date) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_metrics_extremes_kpi_date_side_rank
  ON metrics_extremes_items(kpi, date, side, rank);

CREATE INDEX IF NOT EXISTS idx_metrics_extremes_symbol_date
  ON metrics_extremes_items(symbol, date);

-- ----------------------------
-- Portfolio assets: overlay.portfolioAssets[]
-- ----------------------------
CREATE TABLE IF NOT EXISTS metrics_portfolio_assets (
  date TEXT NOT NULL,
  trade_id INTEGER NOT NULL,
  symbol TEXT,
  contract_name TEXT NOT NULL,
  PRIMARY KEY (date, trade_id, contract_name),
  FOREIGN KEY(date) REFERENCES metrics_daily(date) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_metrics_portfolio_assets_symbol_date
  ON metrics_portfolio_assets(symbol, date);

CREATE INDEX IF NOT EXISTS idx_metrics_portfolio_assets_contract_date
  ON metrics_portfolio_assets(contract_name, date);