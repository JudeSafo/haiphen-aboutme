-- 0018_trades_ingest.sql
-- Migrate trades.json into queryable D1 rows

CREATE TABLE IF NOT EXISTS trades_snapshots (
  date       TEXT NOT NULL PRIMARY KEY,  -- 'YYYY-MM-DD'
  headline   TEXT NOT NULL,
  summary    TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS trades_kpis (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL REFERENCES trades_snapshots(date) ON DELETE CASCADE,
  kpi           TEXT NOT NULL,
  value_text    TEXT NOT NULL,            -- raw display value ("197,663", "$29,615.00", "70.27%")
  value_num     REAL,                     -- parsed numeric (197663, 29615.00, 70.27)
  value_kind    TEXT DEFAULT 'number'     -- number | currency | percent | duration | ratio
    CHECK(value_kind IN ('number','currency','percent','duration','ratio')),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_trades_kpis_date ON trades_kpis(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_trades_kpis_kpi ON trades_kpis(kpi);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_kpis_date_kpi ON trades_kpis(snapshot_date, kpi);
