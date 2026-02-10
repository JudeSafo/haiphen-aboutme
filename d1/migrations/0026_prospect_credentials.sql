-- 0026_prospect_credentials.sql
-- Encrypted per-user API key storage for prospect engine third-party services

CREATE TABLE prospect_credentials (
  user_id         TEXT NOT NULL,
  provider        TEXT NOT NULL CHECK(provider IN ('nvd','github','shodan')),
  encrypted_key   TEXT NOT NULL,
  label           TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, provider)
);
