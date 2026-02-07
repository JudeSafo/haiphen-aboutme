-- 0021_graph_tables.sql
-- Entity/relationship knowledge graph with recursive CTE traversal support

CREATE TABLE IF NOT EXISTS graph_entities (
  entity_id     TEXT NOT NULL PRIMARY KEY,
  user_login    TEXT NOT NULL,
  entity_type   TEXT NOT NULL
    CHECK(entity_type IN ('device','network','protocol','vulnerability','user','location','vendor','service','firmware','certificate')),
  label         TEXT NOT NULL,
  properties_json TEXT,                       -- JSON: arbitrary key-value metadata
  fingerprint   TEXT,                         -- dedup key: hash of (user_login, entity_type, label)
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_entities_user ON graph_entities(user_login);
CREATE INDEX IF NOT EXISTS idx_entities_type ON graph_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_label ON graph_entities(label);
CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_fingerprint ON graph_entities(fingerprint);

CREATE TABLE IF NOT EXISTS graph_edges (
  edge_id       TEXT NOT NULL PRIMARY KEY,
  user_login    TEXT NOT NULL,
  source_id     TEXT NOT NULL REFERENCES graph_entities(entity_id) ON DELETE CASCADE,
  target_id     TEXT NOT NULL REFERENCES graph_entities(entity_id) ON DELETE CASCADE,
  relationship  TEXT NOT NULL
    CHECK(relationship IN ('connects_to','runs_on','exploits','manages','located_at','manufactured_by','depends_on','communicates_with','authenticates','monitors','contains','upgrades_to')),
  weight        REAL DEFAULT 1.0,
  properties_json TEXT,                       -- JSON: edge metadata
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_edges_user ON graph_edges(user_login);
CREATE INDEX IF NOT EXISTS idx_edges_source ON graph_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON graph_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_relationship ON graph_edges(relationship);
CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_unique ON graph_edges(user_login, source_id, target_id, relationship);
