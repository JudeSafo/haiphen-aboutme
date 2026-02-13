# Haiphen Security Operations Guide

## 1. Cloudflare WAF Rate Limiting Rules

Apply these rules in the Cloudflare Dashboard under **Security > WAF > Rate limiting rules** for zone `haiphen.io`.

### Rule 1: API Global Rate Limit
- **Name**: `api-global-rate-limit`
- **Expression**: `(http.host eq "api.haiphen.io")`
- **Rate**: 300 requests per 1 minute per IP
- **Action**: Block for 60 seconds
- **Response code**: 429

### Rule 2: Auth Login Brute-Force Protection
- **Name**: `auth-login-rate-limit`
- **Expression**: `(http.host eq "auth.haiphen.io" and http.request.uri.path contains "/login")`
- **Rate**: 10 requests per 1 minute per IP
- **Action**: Block for 300 seconds
- **Response code**: 429

### Rule 3: Contact Form Anti-Spam
- **Name**: `contact-form-rate-limit`
- **Expression**: `(http.host eq "contact.haiphen.io" and http.request.method eq "POST")`
- **Rate**: 5 requests per 1 minute per IP
- **Action**: Block for 600 seconds
- **Response code**: 429

### Rule 4: Checkout Payment Protection
- **Name**: `checkout-rate-limit`
- **Expression**: `(http.host eq "checkout.haiphen.io" and http.request.method eq "POST")`
- **Rate**: 10 requests per 1 minute per IP
- **Action**: Block for 300 seconds
- **Response code**: 429

### Rule 5: Internal Endpoints Protection
- **Name**: `internal-endpoint-rate-limit`
- **Expression**: `(http.request.uri.path contains "/v1/internal/")`
- **Rate**: 60 requests per 1 minute per IP
- **Action**: Block for 300 seconds

### Rule 6: Scaffold Service Protection
- **Name**: `scaffold-service-rate-limit`
- **Expression**: `(http.host in {"secure.haiphen.io" "network.haiphen.io" "graph.haiphen.io" "risk.haiphen.io" "causal.haiphen.io" "supply.haiphen.io"})`
- **Rate**: 120 requests per 1 minute per IP
- **Action**: Block for 120 seconds

---

## 2. Cloudflare Access for Internal Endpoints

Use **Cloudflare Zero Trust > Access > Applications** to protect internal/admin endpoints.

### Application 1: Admin API Endpoints
- **Name**: `haiphen-admin`
- **Domain**: `api.haiphen.io`
- **Path**: `/v1/admin/*`, `/v1/internal/*`
- **Policy**: Allow — Email matches `jude@haiphen.io`
- **Session duration**: 24h

### Application 2: Orchestrator Dashboard
- **Name**: `haiphen-orchestrator`
- **Domain**: `orchestrator.haiphen.io`
- **Path**: `/*`
- **Policy**: Allow — Email matches `jude@haiphen.io`
- **Session duration**: 24h

### Application 3: Watchdog Dashboard
- **Name**: `haiphen-watchdog`
- **Domain**: `watchdog.haiphen.io`
- **Path**: `/*`
- **Policy**: Allow — Email matches `jude@haiphen.io`
- **Session duration**: 24h

**Note**: Internal endpoints already require `X-Internal-Token` auth, but Cloudflare Access adds a second layer (Zero Trust) before the request reaches the Worker.

---

## 3. Fail-Closed Worker Routes

Current route configuration ensures all traffic goes through zone-level WAF:

| Worker | Route | Zone |
|--------|-------|------|
| haiphen-api | `api.haiphen.io/*` | haiphen.io |
| haiphen-auth | `auth.haiphen.io/*`, `app.haiphen.io/*` | haiphen.io |
| haiphen-checkout | `checkout.haiphen.io/*` | haiphen.io |
| haiphen-contact | `contact.haiphen.io/*` | haiphen.io |
| haiphen-crawler | `crawler.haiphen.io/*` | haiphen.io |
| haiphen-orchestrator | `orchestrator.haiphen.io/*` | haiphen.io |
| haiphen-secure | `secure.haiphen.io/*` | haiphen.io |
| haiphen-network | `network.haiphen.io/*` | haiphen.io |
| haiphen-graph | `graph.haiphen.io/*` | haiphen.io |
| haiphen-risk | `risk.haiphen.io/*` | haiphen.io |
| haiphen-causal | `causal.haiphen.io/*` | haiphen.io |
| haiphen-supply | `supply.haiphen.io/*` | haiphen.io |
| haiphen-watchdog | (cron-only, no routes) | N/A |

All workers have `workers_dev = false` — no `*.workers.dev` bypass routes exist.

### Adding a Fail-Closed Catch-All Route

In **Cloudflare Dashboard > Workers & Pages > Routes**, add:
- **Route**: `*.haiphen.io/*`
- **Worker**: (none — fails closed)
- **Zone**: `haiphen.io`

This ensures any subdomain not explicitly routed returns a CF error page rather than exposing origin.

---

## 4. API Token Scoping

### Current Secrets Inventory

| Secret | Used By | Scope |
|--------|---------|-------|
| `JWT_SECRET` | api, auth, checkout, 6 scaffold | JWT signing/verification |
| `API_KEY_PEPPER` | api | API key hashing |
| `ADMIN_TOKEN` | api, watchdog | Admin-only operations |
| `INTERNAL_TOKEN` | api, contact, 6 scaffold | Service-to-service auth |
| `CREDENTIAL_KEY` | api | Envelope encryption master key |
| `SIGNING_SECRET` | api | HMAC signing (trades sync) |
| `PROSPECT_HMAC_SECRET` | api, contact | Prospect outreach signing |
| `SENDGRID_API_KEY` | contact, watchdog | Email delivery |
| `CF_API_TOKEN` | watchdog | CF Analytics Read + Workers Routes Edit + DNS Edit |
| `GITHUB_PAT` | watchdog | GitHub Actions trigger |
| `STRIPE_SECRET_KEY` | checkout | Stripe payments |

### Token Rotation Procedure

1. Generate new secret: `openssl rand -hex 32`
2. Set on CF Worker: `wrangler secret put <SECRET_NAME> -n <worker-name>`
3. If shared, update ALL workers that use it
4. If GKE CronJobs depend on it, update K8s Secret: `kubectl create secret generic trades-sync-secret --from-literal=<key>=<value> --dry-run=client -o yaml | kubectl apply -f -`
5. Verify: `wrangler secret list -n <worker-name>`

### CF API Token Best Practices

The `CF_API_TOKEN` used by haiphen-watchdog should have minimal permissions:
- **Account Analytics**: Read
- **Zone Workers Routes**: Edit (for failover route deletion)
- **Zone DNS**: Edit (for failover CNAME creation)
- **Zone**: haiphen.io only (not account-wide)

Create a dedicated token at: **Cloudflare Dashboard > My Profile > API Tokens > Create Token**

---

## 5. Security Hardening Checklist

### Applied (Code-Level)
- [x] `workers_dev = false` on all 13 Workers
- [x] `upload_source_maps = false` on all 13 Workers
- [x] `cpu_ms` limits on all Workers (50ms for api/contact/watchdog, 30ms for others)
- [x] Service Bindings for inter-worker calls (no public HTTP traversal)
- [x] Security headers on all responses (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- [x] CORS fail-closed (no origin reflection when allowlist empty)
- [x] Revocation fail-closed (haiphen-auth, haiphen-checkout)
- [x] SSRF domain allowlist (admin metrics ingest)
- [x] KPI parameter format validation
- [x] Queue pruning (WorkQueueDO, 24h TTL)
- [x] Turnstile CAPTCHA on login and contact forms
- [x] Honeypot fields on forms
- [x] HMAC signing on all inter-worker webhook calls

### Dashboard Configuration (Manual)
- [ ] WAF rate limiting rules (Section 1 above)
- [ ] Cloudflare Access applications (Section 2 above)
- [ ] Fail-closed catch-all route (Section 3 above)
- [ ] API token scoping review (Section 4 above)
- [ ] Enable Bot Fight Mode: **Security > Bots > Bot Fight Mode**
- [ ] Enable "Under Attack Mode" if needed: **Security > Settings**
- [ ] Set Minimum TLS Version to 1.2: **SSL/TLS > Edge Certificates**
- [ ] Enable DNSSEC: **DNS > Settings**
- [ ] Set up billing alerts: **Account > Billing > Alerts** (set at 50%, 75%, 90% of plan limits)

### Monitoring
- Watchdog hourly usage checks (cron `0 * * * *`)
- Watchdog daily digest email (cron `0 8 * * 1-5`)
- Error section in digest shows failed CF API queries
- CF Dashboard: **Analytics & Logs > Workers** for request patterns

---

## 6. Plaintext Secrets Warning

The following secrets are currently stored as plaintext `[vars]` in wrangler configs due to a wrangler v4.54+ secret binding bug:

| Worker | Secret | File |
|--------|--------|------|
| haiphen-contact | `DIGEST_HMAC_SECRET` | wrangler.toml:60 |
| haiphen-contact | `INTERNAL_TOKEN` | wrangler.toml:61 |
| haiphen-api | `INTERNAL_TOKEN` | wrangler.toml:86 |
| haiphen-api | `SIGNING_SECRET` | wrangler.toml:87 |

**Action**: When the wrangler bug is fixed, move these to `wrangler secret put` and remove from config files. Then rotate the exposed values.

---

## 7. Geo-Blocking (Optional)

For additional protection, consider blocking traffic from regions that don't have legitimate users:

**Cloudflare Dashboard > Security > WAF > Custom rules:**
```
(ip.geoip.country in {"CN" "RU" "KP"} and not cf.client.bot)
→ Block
```

Adjust the country list based on actual traffic patterns visible in **Analytics > Traffic**.
