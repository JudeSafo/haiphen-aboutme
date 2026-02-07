
 ⛅️ wrangler 4.54.0 (update available 4.62.0)
─────────────────────────────────────────────
Resource location: remote 

🌀 Executing on remote database haiphen_api (9a26fb67-b6e5-4d5f-8e62-3ecfde5ee8c2):
🌀 To execute on your local development database, remove the --remote flag from your wrangler command.
🚣 Executed 1 command in 0.37ms
[
  {
    "results": [
      {
        "sql": "CREATE TABLE _cf_KV (\n        key TEXT PRIMARY KEY,\n        value BLOB\n      ) WITHOUT ROWID"
      },
      {
        "sql": "CREATE TABLE api_keys (\n  key_id TEXT PRIMARY KEY,                 \n  user_login TEXT NOT NULL,\n  key_prefix TEXT NOT NULL,                \n  key_hash TEXT NOT NULL UNIQUE,           \n  scopes TEXT NOT NULL,                    \n  status TEXT NOT NULL CHECK(status IN ('active','revoked')) DEFAULT 'active',\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  revoked_at TEXT,\n  last_used_at TEXT,\n  FOREIGN KEY(user_login) REFERENCES users(user_login) ON DELETE CASCADE\n)"
      },
      {
        "sql": "CREATE TABLE checkout_sessions (\n  checkout_id TEXT PRIMARY KEY,\n  user_login TEXT NOT NULL,\n  stripe_session_id TEXT,\n  status TEXT NOT NULL,\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL\n)"
      },
      {
        "sql": "CREATE TABLE cohort_submissions (\n  submission_id TEXT PRIMARY KEY, \n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  source_page_url TEXT,\n  user_agent TEXT,\n\n  \n  name TEXT,\n  email TEXT NOT NULL,\n  occupation TEXT,\n  education TEXT,\n  linkedin TEXT,\n\n  \n  schema_version TEXT NOT NULL,\n  answers_json TEXT NOT NULL,\n\n  \n  subscribe_daily INTEGER NOT NULL DEFAULT 0\n)"
      },
      {
        "sql": "CREATE TABLE d1_migrations(\n\t\tid         INTEGER PRIMARY KEY AUTOINCREMENT,\n\t\tname       TEXT UNIQUE,\n\t\tapplied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL\n)"
      },
      {
        "sql": "CREATE TABLE email_deliveries (\n  delivery_id TEXT PRIMARY KEY,             \n  user_login TEXT NOT NULL,\n  list_id TEXT NOT NULL,\n  send_date TEXT NOT NULL,                  \n  status TEXT NOT NULL\n    CHECK(status IN ('queued','sent','failed','skipped')),\n  message_id TEXT,\n  error TEXT,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  FOREIGN KEY(user_login) REFERENCES users(user_login) ON DELETE CASCADE,\n  FOREIGN KEY(list_id) REFERENCES email_lists(list_id) ON DELETE CASCADE\n)"
      },
      {
        "sql": "CREATE TABLE email_list_subscribers (\n  email TEXT NOT NULL,\n  list_id TEXT NOT NULL, \n  active INTEGER NOT NULL DEFAULT 1,\n  name TEXT,\n  source TEXT, \n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  PRIMARY KEY (email, list_id)\n)"
      },
      {
        "sql": "CREATE TABLE email_lists (\n  list_id TEXT PRIMARY KEY,                 \n  name TEXT NOT NULL,                       \n  description TEXT,\n  status TEXT NOT NULL DEFAULT 'active'\n    CHECK(status IN ('active','disabled')),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n)"
      },
      {
        "sql": "CREATE TABLE entitlements (\n  user_login TEXT PRIMARY KEY,\n  active INTEGER NOT NULL DEFAULT 0,\n  updated_at INTEGER NOT NULL\n)"
      },
      {
        "sql": "CREATE TABLE metrics_daily (\n  date TEXT PRIMARY KEY,                   \n  updated_at TEXT NOT NULL,\n  headline TEXT NOT NULL,\n  summary TEXT NOT NULL,\n  rows_json TEXT NOT NULL,                 \n  overlay_json TEXT NOT NULL               \n)"
      },
      {
        "sql": "CREATE TABLE metrics_extremes_items (\n  date TEXT NOT NULL,\n  kpi TEXT NOT NULL,\n  side TEXT NOT NULL CHECK(side IN ('hi','lo')),\n  rank INTEGER NOT NULL,\n  trade_id INTEGER,\n  symbol TEXT,\n  contract_name TEXT,\n  metric_raw REAL,\n  metric_abs REAL,\n  individual_pnl REAL,\n  abs_individual_pnl REAL,\n  percent_change REAL,\n  cost_basis REAL,\n  qty REAL,\n  bid_price REAL,\n  ask_price REAL,\n  mid_price REAL,\n  mid_ts TEXT,\n  mid_mark_pnl REAL,\n  liquidity_drag REAL,\n  item_json TEXT NOT NULL,                  \n  PRIMARY KEY (date, kpi, side, rank, contract_name, trade_id),\n  FOREIGN KEY(date) REFERENCES metrics_daily(date) ON DELETE CASCADE\n)"
      },
      {
        "sql": "CREATE TABLE metrics_kpi_values (\n  date TEXT NOT NULL,                       \n  kpi TEXT NOT NULL,\n  value_text TEXT NOT NULL,                 \n  value_num REAL,                           \n  value_kind TEXT NOT NULL DEFAULT 'text'   \n    CHECK(value_kind IN ('number','percent','text')),\n  PRIMARY KEY (date, kpi),\n  FOREIGN KEY(date) REFERENCES metrics_daily(date) ON DELETE CASCADE\n)"
      },
      {
        "sql": "CREATE TABLE metrics_portfolio_assets (\n  date TEXT NOT NULL,\n  trade_id INTEGER NOT NULL,\n  symbol TEXT,\n  contract_name TEXT NOT NULL,\n  PRIMARY KEY (date, trade_id, contract_name),\n  FOREIGN KEY(date) REFERENCES metrics_daily(date) ON DELETE CASCADE\n)"
      },
      {
        "sql": "CREATE TABLE metrics_series_points (\n  date TEXT NOT NULL,\n  kpi TEXT NOT NULL,\n  t TEXT NOT NULL,                          \n  v REAL NOT NULL,\n  src TEXT,                                 \n  PRIMARY KEY (date, kpi, t),\n  FOREIGN KEY(date) REFERENCES metrics_daily(date) ON DELETE CASCADE\n)"
      },
      {
        "sql": "CREATE TABLE plans (\n  user_login TEXT PRIMARY KEY,\n  plan TEXT NOT NULL CHECK(plan IN ('free','pro','enterprise')),\n  active INTEGER NOT NULL DEFAULT 1,\n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  FOREIGN KEY(user_login) REFERENCES users(user_login) ON DELETE CASCADE\n)"
      },
      {
        "sql": "CREATE TABLE sqlite_sequence(name,seq)"
      },
      {
        "sql": "CREATE TABLE stripe_webhook_events (\n  event_id TEXT PRIMARY KEY,\n  type TEXT,\n  created INTEGER,                 \n  processed_at INTEGER NOT NULL    \n)"
      },
      {
        "sql": "CREATE TABLE tos_acceptances (\n  acceptance_id TEXT PRIMARY KEY,                            \n  user_login TEXT NOT NULL,\n  tos_version TEXT NOT NULL,\n  content_sha256 TEXT NOT NULL,\n  accepted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  ip TEXT,\n  user_agent TEXT,\n  origin TEXT,\n  FOREIGN KEY(user_login) REFERENCES users(user_login) ON DELETE CASCADE,\n  FOREIGN KEY(tos_version) REFERENCES tos_documents(tos_version) ON DELETE RESTRICT\n)"
      },
      {
        "sql": "CREATE TABLE tos_documents (\n  tos_version TEXT PRIMARY KEY,                              \n  content_sha256 TEXT NOT NULL,                              \n  title TEXT NOT NULL,\n  url TEXT,                                                  \n  effective_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n)"
      },
      {
        "sql": "CREATE TABLE user_email_subscriptions (\n  user_login TEXT NOT NULL,\n  list_id TEXT NOT NULL,\n  active INTEGER NOT NULL DEFAULT 1,\n  prefs_json TEXT,                          \n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  PRIMARY KEY (user_login, list_id),\n  FOREIGN KEY(user_login) REFERENCES users(user_login) ON DELETE CASCADE,\n  FOREIGN KEY(list_id) REFERENCES email_lists(list_id) ON DELETE CASCADE\n)"
      },
      {
        "sql": "CREATE TABLE users (\n  user_login TEXT PRIMARY KEY,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n, email TEXT, name TEXT, last_seen_at TEXT)"
      },
      {
        "sql": "CREATE TABLE webhook_deliveries (\n  delivery_id TEXT PRIMARY KEY,\n  webhook_id TEXT NOT NULL,\n  event TEXT NOT NULL,\n  date TEXT,\n  request_id TEXT NOT NULL,\n  status_code INTEGER,\n  error TEXT,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  FOREIGN KEY(webhook_id) REFERENCES webhooks(webhook_id) ON DELETE CASCADE\n)"
      },
      {
        "sql": "CREATE TABLE webhooks (\n  webhook_id TEXT PRIMARY KEY,             \n  user_login TEXT NOT NULL,\n  url TEXT NOT NULL,\n  events_json TEXT NOT NULL,               \n  secret TEXT NOT NULL,                    \n  status TEXT NOT NULL CHECK(status IN ('active','disabled')) DEFAULT 'active',\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  FOREIGN KEY(user_login) REFERENCES users(user_login) ON DELETE CASCADE\n)"
      },
      {
        "sql": "CREATE TABLE welcome_emails (\n  user_login TEXT PRIMARY KEY,\n  entitlement_updated_at INTEGER,\n  sent_at TEXT NOT NULL,\n  message_id TEXT,\n  source TEXT,\n  request_id TEXT,\n  details_json TEXT\n)"
      },
      {
        "sql": "CREATE TABLE cookie_consent (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_login TEXT,\n  session_id TEXT NOT NULL,\n  essential INTEGER NOT NULL DEFAULT 1,\n  analytics INTEGER NOT NULL DEFAULT 0,\n  marketing INTEGER NOT NULL DEFAULT 0,\n  ip_country TEXT,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n)"
      },
      {
        "sql": "CREATE TABLE chatbot_interactions (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_login TEXT,\n  session_id TEXT NOT NULL,\n  prompt_text TEXT NOT NULL,\n  target_section TEXT,\n  target_element TEXT,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n)"
      }
    ],
    "success": true,
    "meta": {
      "served_by": "v3-prod",
      "served_by_region": "ENAM",
      "served_by_colo": "ORD",
      "served_by_primary": true,
      "timings": {
        "sql_duration_ms": 0.3684
      },
      "duration": 0.3684,
      "changes": 0,
      "last_row_id": 0,
      "changed_db": false,
      "size_after": 1343488,
      "rows_read": 96,
      "rows_written": 0,
      "total_attempts": 1
    }
  }
]
