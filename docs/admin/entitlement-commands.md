# Entitlement & Subscription Admin Commands

Admin SQL commands for managing entitlements and service subscriptions via Wrangler D1.
All commands target the `haiphen_api` database on the remote environment.

---

## 1. Grant Pro/Enterprise Plan to a User

```bash
# Grant Pro plan
npx wrangler d1 execute haiphen_api --remote --command "INSERT INTO plans (user_login, plan, active) VALUES ('username', 'pro', 1) ON CONFLICT(user_login) DO UPDATE SET plan = 'pro', active = 1;"

# Grant Enterprise plan
npx wrangler d1 execute haiphen_api --remote --command "INSERT INTO plans (user_login, plan, active) VALUES ('username', 'enterprise', 1) ON CONFLICT(user_login) DO UPDATE SET plan = 'enterprise', active = 1;"
```

---

## 2. Activate a Service Subscription

```bash
npx wrangler d1 execute haiphen_api --remote --command "INSERT INTO service_subscriptions (user_login, service_id, status) VALUES ('username', 'haiphen_secure', 'active') ON CONFLICT(user_login, service_id) DO UPDATE SET status = 'active';"
```

---

## 3. Activate All Services for a User (Batch)

```bash
npx wrangler d1 execute haiphen_api --remote --command "
INSERT INTO service_subscriptions (user_login, service_id, status) VALUES
  ('username', 'haiphen_secure', 'active'),
  ('username', 'network_trace', 'active'),
  ('username', 'knowledge_graph', 'active'),
  ('username', 'risk_analysis', 'active'),
  ('username', 'causal_chain', 'active'),
  ('username', 'supply_chain', 'active'),
  ('username', 'haiphen_cli', 'active'),
  ('username', 'haiphen_webapp', 'active'),
  ('username', 'haiphen_mobile', 'active'),
  ('username', 'haiphen_desktop', 'active'),
  ('username', 'daily_newsletter', 'active'),
  ('username', 'slackbot_discord', 'active')
ON CONFLICT(user_login, service_id) DO UPDATE SET status = 'active';
"
```

---

## 4. Revoke a Plan

```bash
npx wrangler d1 execute haiphen_api --remote --command "UPDATE plans SET active = 0 WHERE user_login = 'username';"
```

To fully remove the plan row:

```bash
npx wrangler d1 execute haiphen_api --remote --command "DELETE FROM plans WHERE user_login = 'username';"
```

---

## 5. Revoke a Service Subscription

```bash
# Revoke a single service
npx wrangler d1 execute haiphen_api --remote --command "UPDATE service_subscriptions SET status = 'revoked' WHERE user_login = 'username' AND service_id = 'haiphen_secure';"

# Revoke all services for a user
npx wrangler d1 execute haiphen_api --remote --command "UPDATE service_subscriptions SET status = 'revoked' WHERE user_login = 'username';"
```

---

## 6. Check Current Entitlements for a User

```bash
# Check plan
npx wrangler d1 execute haiphen_api --remote --command "SELECT * FROM plans WHERE user_login = 'username';"

# Check service subscriptions
npx wrangler d1 execute haiphen_api --remote --command "SELECT * FROM service_subscriptions WHERE user_login = 'username';"

# Check entitlement record
npx wrangler d1 execute haiphen_api --remote --command "SELECT * FROM entitlements WHERE user_login = 'username';"

# Combined view: plan + active services
npx wrangler d1 execute haiphen_api --remote --command "SELECT p.user_login, p.plan, p.active AS plan_active, s.service_id, s.status FROM plans p LEFT JOIN service_subscriptions s ON p.user_login = s.user_login WHERE p.user_login = 'username';"
```

---

## 7. List All Active Subscribers

```bash
# All users with an active plan
npx wrangler d1 execute haiphen_api --remote --command "SELECT user_login, plan FROM plans WHERE active = 1;"

# All active service subscriptions grouped by user
npx wrangler d1 execute haiphen_api --remote --command "SELECT user_login, GROUP_CONCAT(service_id, ', ') AS services FROM service_subscriptions WHERE status = 'active' GROUP BY user_login;"

# Count of active subscribers per plan tier
npx wrangler d1 execute haiphen_api --remote --command "SELECT plan, COUNT(*) AS subscriber_count FROM plans WHERE active = 1 GROUP BY plan;"
```

---

## 8. Bulk Operations

### Activate all services for all Pro users

```bash
npx wrangler d1 execute haiphen_api --remote --command "
INSERT INTO service_subscriptions (user_login, service_id, status)
SELECT p.user_login, s.service_id, 'active'
FROM plans p
CROSS JOIN (
  SELECT 'haiphen_secure' AS service_id UNION ALL
  SELECT 'network_trace' UNION ALL
  SELECT 'knowledge_graph' UNION ALL
  SELECT 'risk_analysis' UNION ALL
  SELECT 'causal_chain' UNION ALL
  SELECT 'supply_chain' UNION ALL
  SELECT 'haiphen_cli' UNION ALL
  SELECT 'haiphen_webapp' UNION ALL
  SELECT 'haiphen_mobile' UNION ALL
  SELECT 'haiphen_desktop' UNION ALL
  SELECT 'daily_newsletter' UNION ALL
  SELECT 'slackbot_discord'
) s
WHERE p.plan = 'pro' AND p.active = 1
ON CONFLICT(user_login, service_id) DO UPDATE SET status = 'active';
"
```

### Activate all services for all Enterprise users

```bash
npx wrangler d1 execute haiphen_api --remote --command "
INSERT INTO service_subscriptions (user_login, service_id, status)
SELECT p.user_login, s.service_id, 'active'
FROM plans p
CROSS JOIN (
  SELECT 'haiphen_secure' AS service_id UNION ALL
  SELECT 'network_trace' UNION ALL
  SELECT 'knowledge_graph' UNION ALL
  SELECT 'risk_analysis' UNION ALL
  SELECT 'causal_chain' UNION ALL
  SELECT 'supply_chain' UNION ALL
  SELECT 'haiphen_cli' UNION ALL
  SELECT 'haiphen_webapp' UNION ALL
  SELECT 'haiphen_mobile' UNION ALL
  SELECT 'haiphen_desktop' UNION ALL
  SELECT 'daily_newsletter' UNION ALL
  SELECT 'slackbot_discord'
) s
WHERE p.plan = 'enterprise' AND p.active = 1
ON CONFLICT(user_login, service_id) DO UPDATE SET status = 'active';
"
```

### Revoke all services for all inactive plans

```bash
npx wrangler d1 execute haiphen_api --remote --command "UPDATE service_subscriptions SET status = 'revoked' WHERE user_login IN (SELECT user_login FROM plans WHERE active = 0);"
```

### Sync entitlements table for all active plan holders

```bash
npx wrangler d1 execute haiphen_api --remote --command "
INSERT INTO entitlements (user_login, active, updated_at)
SELECT user_login, 1, strftime('%s', 'now')
FROM plans WHERE active = 1
ON CONFLICT(user_login) DO UPDATE SET active = 1, updated_at = strftime('%s', 'now');
"
```
