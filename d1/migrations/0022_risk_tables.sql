-- 0022_risk_tables.sql
-- Risk model results and portfolio snapshots

CREATE TABLE IF NOT EXISTS risk_assessments (
  assessment_id   TEXT NOT NULL PRIMARY KEY,
  user_login      TEXT NOT NULL,
  scenario        TEXT NOT NULL,               -- e.g. portfolio, asset, sector
  model           TEXT NOT NULL DEFAULT 'monte_carlo'
    CHECK(model IN ('monte_carlo','parametric','historical','stress_test')),
  status          TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed')),
  portfolio_json  TEXT NOT NULL,               -- JSON: input portfolio definition
  config_json     TEXT,                        -- JSON: {iterations, confidence, horizon_days, ...}
  results_json    TEXT,                        -- JSON: computed VaR/CVaR/drawdown/scenarios
  iterations      INTEGER DEFAULT 1000,
  confidence_level REAL DEFAULT 0.95,
  horizon_days    INTEGER DEFAULT 1,
  computed_var     REAL,                       -- Value at Risk result
  computed_cvar    REAL,                       -- Conditional VaR (Expected Shortfall)
  max_drawdown    REAL,
  sharpe_ratio    REAL,
  started_at      TEXT,
  completed_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_risk_user ON risk_assessments(user_login);
CREATE INDEX IF NOT EXISTS idx_risk_status ON risk_assessments(status);
CREATE INDEX IF NOT EXISTS idx_risk_model ON risk_assessments(model);

CREATE TABLE IF NOT EXISTS risk_portfolio_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id   TEXT NOT NULL REFERENCES risk_assessments(assessment_id) ON DELETE CASCADE,
  asset_name      TEXT NOT NULL,
  weight          REAL NOT NULL,
  expected_return REAL,
  volatility      REAL,
  current_value   REAL,
  simulated_values_json TEXT,                 -- JSON array: sample of simulated outcomes
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_risk_snapshots_assessment ON risk_portfolio_snapshots(assessment_id);
