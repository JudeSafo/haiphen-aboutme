-- Waitlist entries for "Coming Soon" services
-- Uses existing email_lists + email_list_subscribers tables
-- Migration: 0015_service_waitlist.sql

INSERT OR IGNORE INTO email_lists (list_id, name, description, status)
VALUES
  ('waitlist_haiphen_secure',   'Haiphen Secure Waitlist',    'Get notified when Haiphen Secure launches',  'active'),
  ('waitlist_network_trace',    'Network Trace Waitlist',     'Get notified when Network Trace launches',   'active'),
  ('waitlist_knowledge_graph',  'Knowledge Graph Waitlist',   'Get notified when Knowledge Graph launches', 'active'),
  ('waitlist_risk_analysis',    'Risk Analysis Waitlist',     'Get notified when Risk Analysis launches',   'active'),
  ('waitlist_causal_chain',     'Causal Chain Waitlist',      'Get notified when Causal Chain launches',    'active'),
  ('waitlist_supply_chain',     'Supply Chain Waitlist',      'Get notified when Supply Chain launches',    'active'),
  ('waitlist_haiphen_mobile',   'Mobile App Waitlist',        'Get notified when Mobile App launches',      'active'),
  ('waitlist_slackbot_discord', 'Slack/Discord Bot Waitlist', 'Get notified when integrations launch',      'active');
