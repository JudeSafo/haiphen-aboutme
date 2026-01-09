-- d1/migrations/0005_identity_and_keys.sql
PRAGMA foreign_keys=ON;

-- ------------------------------------------------------------
-- 1) Expand users so /v1/me can return user {email, name}
-- ------------------------------------------------------------
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN name TEXT;

-- Optional: keep a last_seen_at for debugging/support
ALTER TABLE users ADD COLUMN last_seen_at TEXT;

-- ------------------------------------------------------------
-- 2) Unify identity columns: use user_login everywhere
--    Your earlier migrations created entitlements/checkout_sessions with user_id.
--    Rename those columns to user_login so they match users/plans/api_keys.
-- ------------------------------------------------------------

-- entitlements(user_id -> user_login)
ALTER TABLE entitlements RENAME COLUMN user_id TO user_login;

-- checkout_sessions(user_id -> user_login)
ALTER TABLE checkout_sessions RENAME COLUMN user_id TO user_login;

-- Add indexes to keep lookups snappy
CREATE INDEX IF NOT EXISTS idx_entitlements_user_login
  ON entitlements(user_login);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_user_login
  ON checkout_sessions(user_login);

-- ------------------------------------------------------------
-- 3) Key management correctness
--    Your api_keys table supports many keys per user (great).
--    If your product contract is "one current active key", enforce it:
--    - Allow many revoked keys
--    - Allow at most one active key per user
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uidx_api_keys_one_active_per_user
  ON api_keys(user_login)
  WHERE status = 'active';

-- Helpful for /v1/keys/current queries:
CREATE INDEX IF NOT EXISTS idx_api_keys_user_status_created
  ON api_keys(user_login, status, created_at);

-- (Optional) If you want to ensure key_prefix is unique too:
-- CREATE UNIQUE INDEX IF NOT EXISTS uidx_api_keys_prefix
--   ON api_keys(key_prefix);