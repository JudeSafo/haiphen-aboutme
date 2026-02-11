-- 0029_trades_pipeline_cleanup.sql
-- Drop unused legacy trades tables (0018) and add index for assembly queries

DROP TABLE IF EXISTS trades_kpis;
DROP TABLE IF EXISTS trades_snapshots;

CREATE INDEX IF NOT EXISTS idx_extremes_date_kpi_side_rank
  ON metrics_extremes_items(date, kpi, side, rank);
