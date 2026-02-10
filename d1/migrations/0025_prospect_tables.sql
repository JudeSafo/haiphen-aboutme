-- 0025_prospect_tables.sql
-- Prospect engine: crawl public vulnerability APIs, store leads, analyze via
-- Haiphen services, and draft responsible-disclosure outreach.

-- prospect_sources: API source configs and crawl metadata
CREATE TABLE prospect_sources (
  source_id       TEXT NOT NULL PRIMARY KEY,
  name            TEXT NOT NULL,
  api_base_url    TEXT NOT NULL,
  rate_limit_rpm  INTEGER DEFAULT 10,
  last_crawled_at TEXT,
  last_cursor     TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1,
  config_json     TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- prospect_leads: discovered entities with associated vulnerabilities/risks
CREATE TABLE prospect_leads (
  lead_id         TEXT NOT NULL PRIMARY KEY,
  source_id       TEXT NOT NULL REFERENCES prospect_sources(source_id),
  entity_type     TEXT NOT NULL CHECK(entity_type IN ('company','device','system','network','software')),
  entity_name     TEXT NOT NULL,
  entity_domain   TEXT,
  industry        TEXT,
  country         TEXT,
  vulnerability_id TEXT,
  severity        TEXT CHECK(severity IN ('critical','high','medium','low','info')),
  cvss_score      REAL,
  summary         TEXT NOT NULL,
  raw_data_json   TEXT,
  services_json   TEXT,
  status          TEXT NOT NULL DEFAULT 'new'
    CHECK(status IN ('new','analyzing','analyzed','outreach_drafted','contacted','converted','archived')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_prospect_leads_source ON prospect_leads(source_id);
CREATE INDEX IF NOT EXISTS idx_prospect_leads_status ON prospect_leads(status);
CREATE INDEX IF NOT EXISTS idx_prospect_leads_severity ON prospect_leads(severity);
CREATE INDEX IF NOT EXISTS idx_prospect_leads_entity ON prospect_leads(entity_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospect_leads_dedup ON prospect_leads(source_id, vulnerability_id, entity_name);

-- prospect_analyses: Haiphen service analysis results per lead
CREATE TABLE prospect_analyses (
  analysis_id     TEXT NOT NULL PRIMARY KEY,
  lead_id         TEXT NOT NULL REFERENCES prospect_leads(lead_id) ON DELETE CASCADE,
  service         TEXT NOT NULL CHECK(service IN ('secure','network','graph','risk','causal','supply')),
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','running','completed','failed')),
  result_json     TEXT,
  score           REAL,
  started_at      TEXT,
  completed_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_prospect_analyses_lead ON prospect_analyses(lead_id);
CREATE INDEX IF NOT EXISTS idx_prospect_analyses_service ON prospect_analyses(service);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospect_analyses_dedup ON prospect_analyses(lead_id, service);

-- prospect_outreach: draft responsible-disclosure emails
CREATE TABLE prospect_outreach (
  outreach_id     TEXT NOT NULL PRIMARY KEY,
  lead_id         TEXT NOT NULL REFERENCES prospect_leads(lead_id) ON DELETE CASCADE,
  recipient_email TEXT,
  recipient_name  TEXT,
  subject         TEXT NOT NULL,
  body_text       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','approved','sent','replied','declined')),
  sent_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_prospect_outreach_lead ON prospect_outreach(lead_id);
CREATE INDEX IF NOT EXISTS idx_prospect_outreach_status ON prospect_outreach(status);

-- Seed sources
INSERT INTO prospect_sources (source_id, name, api_base_url, rate_limit_rpm, config_json) VALUES
  ('nvd', 'NVD CVE Database', 'https://services.nvd.nist.gov/rest/json/cves/2.0', 10,
   '{"min_cvss":7.0,"keywords":["SCADA","PLC","Modbus","OPC","HMI","ICS","MQTT","BACnet","DNP3"]}'),
  ('osv', 'Open Source Vulnerabilities', 'https://api.osv.dev/v1', 60,
   '{"ecosystems":["npm","PyPI","Go"],"keywords":["industrial","iot","scada","modbus","opcua"]}'),
  ('github-advisory', 'GitHub Advisory Database', 'https://api.github.com/graphql', 60,
   '{"min_severity":"HIGH","ecosystems":["npm","pip","go"]}'),
  ('shodan', 'Shodan Internet Search', 'https://api.shodan.io', 1,
   '{"queries":["port:502 country:US","port:4840","port:1883 product:mqtt","port:47808"]}');
