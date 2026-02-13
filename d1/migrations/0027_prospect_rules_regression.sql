-- 0027_prospect_rules_regression.sql
-- Use case rules engine, dual-dimension regression tracking, outreach delivery tracking

-- ---------------------------------------------------------------------------
-- 1a. use_case_rules — dynamic rules engine for mapping leads to services
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS use_case_rules (
  rule_id         TEXT NOT NULL PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  match_severity    TEXT,
  match_entity_type TEXT,
  match_keywords    TEXT,
  match_source_id   TEXT,
  match_cvss_min    REAL,
  services_json     TEXT NOT NULL,
  solution_template TEXT NOT NULL,
  priority          INTEGER NOT NULL DEFAULT 100,
  enabled           INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ucr_priority ON use_case_rules(priority);

-- ---------------------------------------------------------------------------
-- 1b. prospect_regressions — dual-dimension tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prospect_regressions (
  regression_id   TEXT NOT NULL PRIMARY KEY,
  dimension       TEXT NOT NULL CHECK(dimension IN ('entity','vuln_class')),
  key             TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at   TEXT NOT NULL,
  last_seen_at    TEXT NOT NULL,
  lead_ids_json   TEXT NOT NULL,
  severity_trend  TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_dim_key ON prospect_regressions(dimension, key);
CREATE INDEX IF NOT EXISTS idx_pr_count ON prospect_regressions(occurrence_count DESC);

-- ---------------------------------------------------------------------------
-- 1c. prospect_outreach_messages — SendGrid delivery tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prospect_outreach_messages (
  message_id      TEXT NOT NULL PRIMARY KEY,
  outreach_id     TEXT NOT NULL REFERENCES prospect_outreach(outreach_id),
  sendgrid_msg_id TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','sent','delivered','bounced','failed')),
  sent_at         TEXT,
  error_detail    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_pom_outreach ON prospect_outreach_messages(outreach_id);

-- ---------------------------------------------------------------------------
-- 1d. Seed 10 fintech-first use case rules
-- ---------------------------------------------------------------------------

-- Tier 1: Trade Execution & Order Flow
INSERT INTO use_case_rules (rule_id, name, description, match_keywords, services_json, solution_template, priority) VALUES (
  'rule-trade-execution',
  'Trade Execution Risk',
  'Matches vulnerabilities affecting trade execution, order routing, and matching engine infrastructure',
  'exchange,trading,order,execution,FIX protocol,matching engine',
  '["risk","network","causal"]',
  'We detected {{vulnerability_id}} affecting trade execution infrastructure at {{entity_name}}. This could impact order routing, fill rates, or position accuracy.

Severity: {{severity}} | Services engaged: {{services}}

{{analysis_summary}}

We can provide a detailed risk assessment covering order flow integrity, latency impact, and cascading failure scenarios. Would your team be available for a brief technical walkthrough?',
  10
);

INSERT INTO use_case_rules (rule_id, name, description, match_keywords, services_json, solution_template, priority) VALUES (
  'rule-settlement-drift',
  'Order Drift / Settlement',
  'Matches vulnerabilities in settlement, clearing, and reconciliation systems',
  'settlement,clearing,reconciliation,position,drift,margin',
  '["risk","causal","graph"]',
  'A vulnerability ({{vulnerability_id}}) in {{entity_name}}''s settlement/clearing stack may cause position drift or delayed reconciliation.

Severity: {{severity}} | Services engaged: {{services}}

{{analysis_summary}}

Our causal analysis can trace the potential cascade from this vulnerability through your settlement pipeline. We''d welcome the chance to share our findings.',
  15
);

-- Tier 2: Brokerage & Asset Management
INSERT INTO use_case_rules (rule_id, name, description, match_keywords, services_json, solution_template, priority) VALUES (
  'rule-broker-platform',
  'Broker Platform Exposure',
  'Matches vulnerabilities in brokerage, custodian, and portfolio management platforms',
  'broker,brokerage,custodian,portfolio,wealth management',
  '["secure","risk","supply"]',
  '{{entity_name}} broker infrastructure shows exposure via {{vulnerability_id}}. Client accounts, portfolio data, and order placement systems may be at risk.

Severity: {{severity}} | Services engaged: {{services}}

{{analysis_summary}}

We specialize in securing brokerage platforms and can provide a comprehensive vulnerability assessment. Happy to discuss remediation strategies at your convenience.',
  20
);

INSERT INTO use_case_rules (rule_id, name, description, match_keywords, services_json, solution_template, priority) VALUES (
  'rule-market-data',
  'Market Data Feed Integrity',
  'Matches vulnerabilities affecting market data, pricing feeds, and quote systems',
  'market data,price feed,quote,ticker,data vendor,Bloomberg,Reuters,ICE',
  '["network","causal","risk"]',
  '{{vulnerability_id}} affects market data infrastructure used by {{entity_name}}. Pricing accuracy, NAV calculations, and real-time quotes may be impacted.

Severity: {{severity}} | Services engaged: {{services}}

{{analysis_summary}}

Data feed integrity is critical for accurate valuations and trading decisions. We can analyze the full impact chain from feed corruption through downstream calculations.',
  25
);

-- Tier 3: Fintech Infrastructure
INSERT INTO use_case_rules (rule_id, name, description, match_keywords, match_source_id, services_json, solution_template, priority) VALUES (
  'rule-api-gateway',
  'API / Gateway Exposure',
  'Matches Shodan-detected exposed API endpoints and gateway vulnerabilities',
  'api,gateway,REST,webhook,OAuth',
  'shodan',
  '["secure","network","supply"]',
  'Shodan detected exposed API endpoints at {{entity_name}}. Trading APIs, webhook delivery, and client integrations may be affected.

Severity: {{severity}} | Services engaged: {{services}}

{{analysis_summary}}

Exposed API infrastructure is a high-priority finding for financial services. We can provide network-level analysis and remediation guidance.',
  30
);

INSERT INTO use_case_rules (rule_id, name, description, match_keywords, services_json, solution_template, priority) VALUES (
  'rule-payment-ledger',
  'Payment / Ledger Risk',
  'Matches vulnerabilities in payment processing, ledger systems, and fund movement',
  'payment,ledger,transaction,ACH,wire,SWIFT,treasury',
  '["risk","graph","supply"]',
  '{{vulnerability_id}} impacts payment/ledger infrastructure at {{entity_name}}. Transaction integrity and fund movement may be affected.

Severity: {{severity}} | Services engaged: {{services}}

{{analysis_summary}}

Payment system vulnerabilities require immediate attention. Our graph analysis can map transaction flow exposure and identify critical control points.',
  35
);

-- Tier 4: Regulatory & Compliance
INSERT INTO use_case_rules (rule_id, name, description, match_keywords, services_json, solution_template, priority) VALUES (
  'rule-regulatory-data',
  'Regulatory Data Exposure',
  'Matches vulnerabilities exposing PII, KYC/AML data, or compliance systems',
  'PII,KYC,AML,compliance,GDPR,SOX,audit,reporting',
  '["secure","risk","causal"]',
  '{{entity_name}} faces regulatory exposure from {{vulnerability_id}}. KYC/AML data, audit trails, or compliance reporting may be compromised.

Severity: {{severity}} | Services engaged: {{services}}

{{analysis_summary}}

Regulatory data exposure carries significant liability. We can assess the scope of potential data compromise and recommend containment measures.',
  40
);

INSERT INTO use_case_rules (rule_id, name, description, match_keywords, services_json, solution_template, priority) VALUES (
  'rule-counterparty-vendor',
  'Counterparty / Vendor Risk',
  'Matches supply-chain and third-party dependency vulnerabilities',
  'vendor,third-party,dependency,supply chain,outsource,SaaS',
  '["supply","graph","risk"]',
  'A supply-chain vulnerability ({{vulnerability_id}}) affects vendors used by {{entity_name}}. Counterparty risk assessment recommended.

Severity: {{severity}} | Services engaged: {{services}}

{{analysis_summary}}

Third-party risk is a growing concern in financial services. Our supply chain intelligence can map your vendor dependency graph and identify concentration risks.',
  45
);

-- Tier 5: Catch-all
INSERT INTO use_case_rules (rule_id, name, description, match_cvss_min, match_keywords, services_json, solution_template, priority) VALUES (
  'rule-high-severity-fintech',
  'High-Severity Fintech Signal',
  'Catches high-CVSS vulnerabilities with fintech-related keywords',
  8.0,
  'financial,fintech,banking,insurance,trading',
  '["secure","risk"]',
  'We identified a high-severity vulnerability ({{vulnerability_id}}, CVSS {{severity}}) affecting {{entity_name}}''s financial technology infrastructure.

{{analysis_summary}}

Given the severity level, we recommend prompt assessment. Our security and risk analysis services can provide actionable remediation guidance.',
  80
);

INSERT INTO use_case_rules (rule_id, name, description, match_cvss_min, services_json, solution_template, priority) VALUES (
  'rule-general-intelligence',
  'General Intelligence',
  'Catch-all for leads that do not match specific fintech rules',
  7.0,
  '["secure","risk"]',
  'We detected {{vulnerability_id}} ({{severity}}) affecting {{entity_name}} through our automated security intelligence platform.

{{analysis_summary}}

We''d be happy to provide additional technical details or discuss how this finding relates to your infrastructure. Please let us know if you''d like to schedule a brief call.',
  100
);

-- ---------------------------------------------------------------------------
-- 1e. Update source configs with fintech-augmented keywords
-- ---------------------------------------------------------------------------
UPDATE prospect_sources SET config_json = '{"min_cvss":7.0,"keywords":["exchange","trading","broker","FIX","settlement","clearing","market data","portfolio","order","execution","payment","ledger","fintech","banking","API","gateway","SCADA","PLC","Modbus","OPC","MQTT"]}' WHERE source_id = 'nvd';
UPDATE prospect_sources SET config_json = '{"ecosystems":["npm","PyPI","Go"],"keywords":["trading","broker","exchange","fintech","payment","settlement","market-data","websocket","oauth","api-gateway","industrial","iot"]}' WHERE source_id = 'osv';
UPDATE prospect_sources SET config_json = '{"min_severity":"HIGH","ecosystems":["npm","pip","go"],"keywords":["trading","broker","exchange","fintech","payment"]}' WHERE source_id = 'github-advisory';
UPDATE prospect_sources SET config_json = '{"queries":["port:8443 product:trading","port:443 org:exchange","port:9090 product:api","port:502 country:US","port:4840","port:1883 product:mqtt"]}' WHERE source_id = 'shodan';
