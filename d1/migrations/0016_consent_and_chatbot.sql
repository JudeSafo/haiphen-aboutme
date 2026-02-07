-- 0016_consent_and_chatbot.sql
-- Cookie consent preferences and chatbot interaction analytics

CREATE TABLE IF NOT EXISTS cookie_consent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_login TEXT,
  session_id TEXT NOT NULL,
  essential INTEGER NOT NULL DEFAULT 1,
  analytics INTEGER NOT NULL DEFAULT 0,
  marketing INTEGER NOT NULL DEFAULT 0,
  ip_country TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS chatbot_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_login TEXT,
  session_id TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  target_section TEXT,
  target_element TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
