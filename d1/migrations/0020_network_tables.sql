-- 0020_network_tables.sql
-- Protocol definitions, trace storage, and packet data

CREATE TABLE IF NOT EXISTS network_protocol_definitions (
  protocol_id    TEXT NOT NULL PRIMARY KEY,   -- e.g. modbus, opcua, mqtt, dnp3, bacnet
  name           TEXT NOT NULL,               -- e.g. Modbus TCP
  description    TEXT,
  default_port   INTEGER,
  function_codes_json TEXT,                   -- JSON map: {code: {name, description, category}}
  anomaly_rules_json  TEXT,                   -- JSON array: [{rule, description, severity}]
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS network_traces (
  trace_id      TEXT NOT NULL PRIMARY KEY,
  user_login    TEXT NOT NULL,
  target        TEXT NOT NULL,                -- target host:port
  protocol      TEXT NOT NULL,                -- protocol_id reference
  status        TEXT NOT NULL DEFAULT 'capturing'
    CHECK(status IN ('capturing','analyzing','completed','failed')),
  duration_ms   INTEGER,
  packet_count  INTEGER DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  anomaly_count INTEGER DEFAULT 0,
  summary_json  TEXT,                         -- JSON: aggregated stats
  started_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_traces_user ON network_traces(user_login);
CREATE INDEX IF NOT EXISTS idx_traces_protocol ON network_traces(protocol);
CREATE INDEX IF NOT EXISTS idx_traces_status ON network_traces(status);

CREATE TABLE IF NOT EXISTS network_packets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id      TEXT NOT NULL REFERENCES network_traces(trace_id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,             -- packet sequence number in trace
  timestamp_ms  REAL NOT NULL,                -- relative timestamp within trace
  direction     TEXT NOT NULL DEFAULT 'request'
    CHECK(direction IN ('request','response')),
  src_addr      TEXT,
  dst_addr      TEXT,
  protocol      TEXT NOT NULL,
  function_code INTEGER,                      -- protocol-specific function code
  function_name TEXT,                         -- decoded name
  payload_hex   TEXT,                         -- raw payload as hex string
  payload_size  INTEGER DEFAULT 0,
  decoded_json  TEXT,                         -- JSON: protocol-specific decoded fields
  is_anomaly    INTEGER NOT NULL DEFAULT 0,
  anomaly_type  TEXT,                         -- e.g. unknown_fc, oversized_payload, timing_jitter
  anomaly_detail TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_packets_trace ON network_packets(trace_id);
CREATE INDEX IF NOT EXISTS idx_packets_anomaly ON network_packets(is_anomaly) WHERE is_anomaly = 1;
