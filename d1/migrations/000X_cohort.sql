-- Cohort submissions (anonymous-friendly; not tied to users.user_login)
CREATE TABLE IF NOT EXISTS cohort_submissions (
  submission_id TEXT PRIMARY KEY, -- uuid
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  source_page_url TEXT,
  user_agent TEXT,

  -- identity
  name TEXT,
  email TEXT NOT NULL,
  occupation TEXT,
  education TEXT,
  linkedin TEXT,

  -- answers JSON (versioned by schema_version)
  schema_version TEXT NOT NULL,
  answers_json TEXT NOT NULL,

  -- optional subscribe flag
  subscribe_daily INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cohort_submissions_email_created
ON cohort_submissions(email, created_at);

-- Email-only list membership (for visitors not logged in)
CREATE TABLE IF NOT EXISTS email_list_subscribers (
  email TEXT NOT NULL,
  list_id TEXT NOT NULL, -- e.g. 'daily_digest'
  active INTEGER NOT NULL DEFAULT 1,
  name TEXT,
  source TEXT, -- e.g. 'cohort_survey'
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (email, list_id)
);

CREATE INDEX IF NOT EXISTS idx_email_list_subscribers_list_active
ON email_list_subscribers(list_id, active);