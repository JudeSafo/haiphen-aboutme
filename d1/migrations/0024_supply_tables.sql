-- 0024_supply_tables.sql
-- Supplier database, risk assessments, and alert system

CREATE TABLE IF NOT EXISTS supply_suppliers (
  supplier_id     TEXT NOT NULL PRIMARY KEY,
  user_login      TEXT NOT NULL,
  name            TEXT NOT NULL,
  country         TEXT,
  region          TEXT,
  tier            INTEGER DEFAULT 1
    CHECK(tier BETWEEN 1 AND 3),              -- 1=direct, 2=sub-supplier, 3=raw material
  categories_json TEXT,                        -- JSON array of product categories
  financial_score   REAL DEFAULT 50.0,         -- 0-100
  geopolitical_score REAL DEFAULT 50.0,        -- 0-100
  delivery_score    REAL DEFAULT 50.0,         -- 0-100
  single_source   INTEGER DEFAULT 0,           -- 1 if sole supplier
  status          TEXT DEFAULT 'active'
    CHECK(status IN ('active','inactive','watchlist','blocked')),
  metadata_json   TEXT,                        -- JSON: arbitrary supplier data
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_suppliers_user ON supply_suppliers(user_login);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON supply_suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_country ON supply_suppliers(country);
CREATE INDEX IF NOT EXISTS idx_suppliers_tier ON supply_suppliers(tier);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_user_name ON supply_suppliers(user_login, name);

CREATE TABLE IF NOT EXISTS supply_assessments (
  assessment_id     TEXT NOT NULL PRIMARY KEY,
  user_login        TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed')),
  supplier_ids_json TEXT NOT NULL,             -- JSON array of supplier_ids assessed
  overall_risk_score REAL,                     -- weighted composite 0-100
  risk_breakdown_json TEXT,                    -- JSON: {financial, geopolitical, delivery, single_source}
  alerts_json       TEXT,                      -- JSON array: triggered alerts
  alternatives_json TEXT,                      -- JSON array: alternative supplier suggestions
  recommendations_json TEXT,                   -- JSON array: risk mitigation actions
  started_at        TEXT,
  completed_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_supply_assess_user ON supply_assessments(user_login);
CREATE INDEX IF NOT EXISTS idx_supply_assess_status ON supply_assessments(status);

CREATE TABLE IF NOT EXISTS supply_alerts (
  alert_id        TEXT NOT NULL PRIMARY KEY,
  user_login      TEXT NOT NULL,
  supplier_id     TEXT NOT NULL REFERENCES supply_suppliers(supplier_id) ON DELETE CASCADE,
  alert_type      TEXT NOT NULL
    CHECK(alert_type IN ('geopolitical','logistics','financial','quality','compliance','single_source')),
  severity        TEXT NOT NULL DEFAULT 'medium'
    CHECK(severity IN ('critical','high','medium','low')),
  title           TEXT NOT NULL,
  description     TEXT,
  is_resolved     INTEGER NOT NULL DEFAULT 0,
  resolved_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_supply_alerts_user ON supply_alerts(user_login);
CREATE INDEX IF NOT EXISTS idx_supply_alerts_supplier ON supply_alerts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supply_alerts_type ON supply_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_supply_alerts_unresolved ON supply_alerts(is_resolved) WHERE is_resolved = 0;
