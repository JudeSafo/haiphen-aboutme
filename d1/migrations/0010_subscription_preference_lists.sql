-- Seed email_lists with the four subscription categories.
-- user_email_subscriptions (from 0008) already stores per-user opt-in/out via the `active` column.
-- Default behavior: users are subscribed to all lists unless they explicitly opt out.

INSERT OR IGNORE INTO email_lists (list_id, name, description, status)
VALUES
  ('daily_digest',    'Daily Market Digest',              'Daily trading metrics, KPIs, and market signals', 'active'),
  ('weekly_summary',  'Weekly Performance Summary',       'Weekly aggregated performance and analytics',     'active'),
  ('product_updates', 'Product Updates & Announcements',  'New features, API changes, and platform news',    'active'),
  ('cohort_comms',    'Cohort Program Communications',    'Cohort onboarding, scheduling, and updates',      'active');
