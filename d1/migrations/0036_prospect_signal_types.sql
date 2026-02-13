-- 0036_prospect_signal_types.sql
-- Re-align prospect pipeline around financial infrastructure intelligence.
-- Adds signal_type taxonomy (vulnerability, regulatory, performance, incident),
-- impact_score column, new crawler sources, and new fintech-infrastructure rules.

-- ---------------------------------------------------------------------------
-- 1. Schema changes to prospect_leads
-- ---------------------------------------------------------------------------

-- Signal type: vulnerability (CVE), regulatory (SEC filings), performance (TLS/latency), incident (outages)
ALTER TABLE prospect_leads ADD COLUMN signal_type TEXT NOT NULL DEFAULT 'vulnerability';

-- Business impact score (0-100, distinct from CVSS which is vuln-specific)
ALTER TABLE prospect_leads ADD COLUMN impact_score REAL;

-- Index for signal-type queries
CREATE INDEX IF NOT EXISTS idx_prospect_leads_signal_type ON prospect_leads(signal_type);

-- ---------------------------------------------------------------------------
-- 1b. Add match_signal_types to use_case_rules (NULL = match any signal type)
-- ---------------------------------------------------------------------------

ALTER TABLE use_case_rules ADD COLUMN match_signal_types TEXT;

-- ---------------------------------------------------------------------------
-- 2. New crawler sources
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO prospect_sources (source_id, name, api_base_url, config_json, enabled)
VALUES
  ('sec-edgar', 'SEC EDGAR', 'https://efts.sec.gov/LATEST/search-index?q=',
   '{"keywords":["cybersecurity incident","technology failure","trading disruption","system outage","data breach"],"forms":["8-K","10-K"],"dateRange":"30d"}', 1),
  ('infra-scan', 'Infrastructure Fingerprint', '',
   '{"targets":"from_leads","checks":["tls_version","cert_expiry","server_headers","hsts","response_time","dns_records"]}', 1);

-- ---------------------------------------------------------------------------
-- 3. New fintech-infrastructure rules (lower priority = matched first)
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO use_case_rules (rule_id, name, description, match_keywords, match_signal_types, services_json, solution_template, priority)
VALUES
  ('rule-infra-latency', 'Infrastructure Latency',
   'Matches performance signals for response time, latency, and timeout issues',
   'response time,latency,timeout,slow',
   'performance',
   '["network","risk","causal"]',
   'Infrastructure performance analysis for {{entity_name}}: {{analysis_summary}}. Response time degradation directly impacts trade execution and fill rates.',
   10);

INSERT OR IGNORE INTO use_case_rules (rule_id, name, description, match_keywords, match_signal_types, services_json, solution_template, priority)
VALUES
  ('rule-regulatory-filing', 'Regulatory Filing',
   'Matches regulatory signals from SEC filings and enforcement actions',
   'SEC,8-K,enforcement,compliance,fine',
   'regulatory',
   '["risk","causal","supply"]',
   'Regulatory exposure analysis for {{entity_name}}: {{analysis_summary}}. Filing indicates potential operational risk requiring infrastructure review.',
   12);

INSERT OR IGNORE INTO use_case_rules (rule_id, name, description, match_keywords, match_signal_types, services_json, solution_template, priority)
VALUES
  ('rule-cert-expiry', 'Certificate/TLS Risk',
   'Matches performance signals for TLS version and certificate expiry issues',
   'certificate,TLS 1.0,TLS 1.1,expired,expiring',
   'performance',
   '["secure","network"]',
   'TLS infrastructure risk for {{entity_name}}: {{analysis_summary}}. Outdated cryptographic infrastructure creates settlement and API reliability risk.',
   8);

INSERT OR IGNORE INTO use_case_rules (rule_id, name, description, match_keywords, match_signal_types, services_json, solution_template, priority)
VALUES
  ('rule-outage-incident', 'Outage/Incident',
   'Matches incident signals from outage reports and service disruptions',
   'outage,downtime,incident,disruption,failure',
   'incident',
   '["network","causal","risk"]',
   'Operational incident analysis for {{entity_name}}: {{analysis_summary}}. Service disruptions impact trading continuity and counterparty confidence.',
   15);

INSERT OR IGNORE INTO use_case_rules (rule_id, name, description, match_keywords, match_signal_types, services_json, solution_template, priority)
VALUES
  ('rule-tech-debt', 'Technology Debt',
   'Matches performance/incident signals for legacy and deprecated infrastructure',
   'legacy,deprecated,end-of-life,unsupported,outdated',
   'performance,incident',
   '["supply","risk","graph"]',
   'Technology debt assessment for {{entity_name}}: {{analysis_summary}}. Legacy infrastructure increases operational fragility and maintenance cost.',
   7);

-- ---------------------------------------------------------------------------
-- 4. Deprioritize existing CVE-centric rules (priority 50 = checked later)
-- ---------------------------------------------------------------------------

UPDATE use_case_rules SET priority = 50 WHERE rule_id IN (
  'rule-high-severity-fintech', 'rule-trade-execution', 'rule-settlement-drift',
  'rule-broker-platform', 'rule-market-data', 'rule-api-gateway',
  'rule-payment-ledger', 'rule-regulatory-data', 'rule-counterparty-vendor',
  'rule-general-intelligence'
);
