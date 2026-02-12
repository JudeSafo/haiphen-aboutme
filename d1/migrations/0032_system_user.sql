-- System user for automated email deliveries (trading report, etc.)
-- Needed because email_deliveries has FK on users(user_login)
INSERT OR IGNORE INTO users(user_login, email, name) VALUES ('system', 'system@haiphen.io', 'System');
