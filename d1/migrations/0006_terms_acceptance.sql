PRAGMA foreign_keys=ON;

-- Versioned terms documents. Keep this minimal now; expand later (pdf_url, markdown, etc).
CREATE TABLE IF NOT EXISTS tos_documents (
  tos_version TEXT PRIMARY KEY,                              -- e.g. "sla_v0.1_2026-01-10"
  content_sha256 TEXT NOT NULL,                              -- sha256 hex of canonical content
  title TEXT NOT NULL,
  url TEXT,                                                  -- optional canonical URL on haiphen.io
  effective_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- User acceptance log (legally useful metadata).
CREATE TABLE IF NOT EXISTS tos_acceptances (
  acceptance_id TEXT PRIMARY KEY,                            -- uuid
  user_login TEXT NOT NULL,
  tos_version TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ip TEXT,
  user_agent TEXT,
  origin TEXT,
  FOREIGN KEY(user_login) REFERENCES users(user_login) ON DELETE CASCADE,
  FOREIGN KEY(tos_version) REFERENCES tos_documents(tos_version) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_tos_acceptances_user
  ON tos_acceptances(user_login, accepted_at DESC);

CREATE INDEX IF NOT EXISTS idx_tos_acceptances_version
  ON tos_acceptances(tos_version, accepted_at DESC);