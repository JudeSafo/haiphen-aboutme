-- 0019_secure_tables.sql
-- CVE database and security scan results

CREATE TABLE IF NOT EXISTS secure_cve_database (
  cve_id          TEXT NOT NULL PRIMARY KEY,  -- e.g. CVE-2024-21762
  vendor          TEXT NOT NULL,              -- e.g. Fortinet
  product         TEXT NOT NULL,              -- e.g. FortiOS
  affected_versions TEXT NOT NULL,            -- JSON array of version ranges
  cvss_score      REAL NOT NULL DEFAULT 0.0,
  cvss_vector     TEXT,
  severity        TEXT NOT NULL DEFAULT 'medium'
    CHECK(severity IN ('critical','high','medium','low','info')),
  description     TEXT NOT NULL,
  remediation     TEXT,
  references_json TEXT,                       -- JSON array of URLs
  published_at    TEXT NOT NULL,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_cve_vendor ON secure_cve_database(vendor);
CREATE INDEX IF NOT EXISTS idx_cve_product ON secure_cve_database(product);
CREATE INDEX IF NOT EXISTS idx_cve_severity ON secure_cve_database(severity);
CREATE INDEX IF NOT EXISTS idx_cve_cvss ON secure_cve_database(cvss_score);

CREATE TABLE IF NOT EXISTS secure_scans (
  scan_id       TEXT NOT NULL PRIMARY KEY,
  user_login    TEXT NOT NULL,
  target        TEXT NOT NULL,               -- target host/network
  scan_type     TEXT NOT NULL DEFAULT 'vulnerability'
    CHECK(scan_type IN ('vulnerability','compliance','full')),
  status        TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','running','completed','failed')),
  asset_metadata_json TEXT,                  -- JSON: {vendor, product, version, firmware, ...}
  findings_json TEXT,                        -- JSON array of findings
  summary_json  TEXT,                        -- JSON: {total, critical, high, medium, low, info}
  compliance_json TEXT,                      -- JSON: compliance framework results
  started_at    TEXT,
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_scans_user ON secure_scans(user_login);
CREATE INDEX IF NOT EXISTS idx_scans_status ON secure_scans(status);
CREATE INDEX IF NOT EXISTS idx_scans_created ON secure_scans(created_at);
