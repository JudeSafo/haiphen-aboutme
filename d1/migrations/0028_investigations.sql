-- 0028_investigations.sql — Closed-loop investigation engine tables

-- Top-level investigation record
CREATE TABLE investigations (
  investigation_id  TEXT NOT NULL PRIMARY KEY,
  lead_id           TEXT NOT NULL REFERENCES prospect_leads(lead_id),
  user_id           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','running','completed','failed','re_investigating')),
  pipeline_order    TEXT NOT NULL DEFAULT '["secure","network","causal","risk","graph","supply"]',
  aggregate_score   REAL,
  risk_score_before REAL,
  risk_score_after  REAL,
  claude_used       INTEGER NOT NULL DEFAULT 0,
  claude_summary    TEXT,
  budget_level      TEXT,
  requirements_json TEXT,
  solutions_json    TEXT,
  started_at        TEXT,
  completed_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_inv_lead ON investigations(lead_id);
CREATE INDEX IF NOT EXISTS idx_inv_status ON investigations(status);
CREATE INDEX IF NOT EXISTS idx_inv_user ON investigations(user_id);

-- Per-service step results (sequential, with upstream context)
CREATE TABLE investigation_steps (
  step_id            TEXT NOT NULL PRIMARY KEY,
  investigation_id   TEXT NOT NULL REFERENCES investigations(investigation_id),
  service            TEXT NOT NULL,
  step_order         INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','running','completed','failed','skipped')),
  input_context_json TEXT,
  score              REAL,
  findings_json      TEXT,
  recommendation     TEXT,
  duration_ms        INTEGER,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_istep_inv ON investigation_steps(investigation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_istep_dedup ON investigation_steps(investigation_id, service);

-- Derived capability gaps
CREATE TABLE investigation_requirements (
  requirement_id    TEXT NOT NULL PRIMARY KEY,
  investigation_id  TEXT NOT NULL REFERENCES investigations(investigation_id),
  category          TEXT NOT NULL CHECK(category IN ('data_gap','capability_gap','monitor_needed','integration_needed')),
  description       TEXT NOT NULL,
  resolved          INTEGER NOT NULL DEFAULT 0,
  resolution_action TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ireq_inv ON investigation_requirements(investigation_id);

-- Track investigation state on prospect_leads
ALTER TABLE prospect_leads ADD COLUMN investigation_status TEXT DEFAULT NULL;
