-- 0035_triples.sql — RDF-style triple store for investigation knowledge graph
--
-- Unlike graph_entities/graph_edges (migration 0021) which are user-scoped with
-- typed CHECK constraints for manual population, triples are schema-free,
-- investigation-scoped, and auto-populated from lead data + service findings.

CREATE TABLE IF NOT EXISTS triples (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject     TEXT NOT NULL,    -- e.g. "vuln:CVE-2024-1234" or "entity:Huawei"
  predicate   TEXT NOT NULL,    -- e.g. "affects", "has_severity", "depends_on"
  object      TEXT NOT NULL,    -- e.g. "entity:Huawei", "high", "entity:OpenSSL"
  confidence  REAL DEFAULT 1.0, -- 0.0-1.0, from extraction heuristics
  source      TEXT,             -- which service/step produced this triple
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Three covering indexes for any traversal direction (SPO, POS, OSP)
CREATE INDEX IF NOT EXISTS idx_triples_spo ON triples(subject, predicate, object);
CREATE INDEX IF NOT EXISTS idx_triples_pos ON triples(predicate, object, subject);
CREATE INDEX IF NOT EXISTS idx_triples_osp ON triples(object, subject, predicate);

-- Dedup: same triple from same source is idempotent
CREATE UNIQUE INDEX IF NOT EXISTS idx_triples_dedup ON triples(subject, predicate, object, source);

-- Add gaps_json column to investigation_steps for gap reporting
ALTER TABLE investigation_steps ADD COLUMN gaps_json TEXT;
