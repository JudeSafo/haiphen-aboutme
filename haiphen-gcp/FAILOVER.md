# Manual GCP Failover Guide

Step-by-step instructions for manually pivoting Haiphen backend services from
Cloudflare Workers to GCP free-tier compute. Use this if the watchdog worker
is itself unreachable or you need to bypass automated failover.

---

## Prerequisites

- `gcloud` CLI authenticated (`gcloud auth login`)
- GCP project set up (`haiphen-gcp/setup.sh` already run)
- CF API token with **Analytics Read + Workers Routes Edit + DNS Edit**
- GCP Cloud Functions / Cloud Run services already deployed (Steps 6-7 of the plan)

```bash
export CF_API_TOKEN="your-cloudflare-api-token"
export CF_ZONE_ID="your-zone-id"
export CF_ACCOUNT_ID="your-account-id"
export GCP_PROJECT_ID="haiphen-failover"
```

---

## 1. Check Current CF Usage

Before failing over, confirm usage levels:

```bash
# Via the watchdog (if reachable)
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://watchdog.haiphen.io/v1/watchdog/status | jq

# Or directly via CF API
curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/graphql" \
  -d '{"query":"{ viewer { accounts(filter:{accountTag:\"'$CF_ACCOUNT_ID'\"}) { workersInvocationsAdaptive(filter:{datetime_geq:\"2026-02-01T00:00:00Z\"},limit:1) { sum { requests } } } } }"}' \
  | jq '.data.viewer.accounts[0].workersInvocationsAdaptive[0].sum.requests'
```

---

## 2. Fail Over a Single Worker (via Watchdog)

If the watchdog is still running:

```bash
# Fail over haiphen-api to GCP
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  https://watchdog.haiphen.io/v1/watchdog/failover \
  -d '{"worker":"haiphen-api"}'

# Check status
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://watchdog.haiphen.io/v1/watchdog/status | jq '.failedOver'
```

---

## 3. Manual Failover (Watchdog Unreachable)

If the watchdog itself is down, manually delete CF routes and create DNS records:

### 3a. List existing worker routes

```bash
curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/workers/routes" \
  | jq '.result[] | {id, pattern, script}'
```

### 3b. Delete the route for the target worker

```bash
# Replace ROUTE_ID with the ID from step 3a
ROUTE_ID="abc123"
curl -X DELETE -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/workers/routes/$ROUTE_ID"
```

### 3c. Create DNS CNAME pointing to GCP

```bash
# Example: fail over api.haiphen.io → GCP Cloud Run
GCP_TARGET="haiphen-api-xxxxx.us-central1.run.app"

curl -X POST -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records" \
  -d '{
    "type": "CNAME",
    "name": "api.haiphen.io",
    "content": "'$GCP_TARGET'",
    "ttl": 60,
    "proxied": false
  }'
```

**Save the DNS record ID** from the response — you'll need it for rollback.

### 3d. Repeat for each worker

Worker → GCP target mapping (all Cloud Functions gen2, backed by Cloud Run):

| Worker | Subdomain | Cloud Run Hostname |
|--------|-----------|------------|
| haiphen-api | api | `haiphen-api-ifkn3iz6zq-uc.a.run.app` |
| haiphen-auth | auth | `haiphen-auth-fn-ifkn3iz6zq-uc.a.run.app` |
| haiphen-checkout | checkout | `haiphen-checkout-ifkn3iz6zq-uc.a.run.app` |
| haiphen-secure | secure | `haiphen-secure-ifkn3iz6zq-uc.a.run.app` |
| haiphen-network | network | `haiphen-network-ifkn3iz6zq-uc.a.run.app` |
| haiphen-graph | graph | `haiphen-graph-ifkn3iz6zq-uc.a.run.app` |
| haiphen-risk | risk | `haiphen-risk-ifkn3iz6zq-uc.a.run.app` |
| haiphen-causal | causal | `haiphen-causal-ifkn3iz6zq-uc.a.run.app` |
| haiphen-supply | supply | `haiphen-supply-ifkn3iz6zq-uc.a.run.app` |
| haiphen-contact | contact | *(not yet deployed)* |
| edge-crawler | crawler | *(not yet deployed)* |
| haiphen-orchestrator | orchestrator | *(not yet deployed)* |

Get the Cloud Run hostname for any function:

```bash
gcloud functions describe haiphen-secure --gen2 --region=us-central1 --format='value(serviceConfig.uri)'
```

> **CNAME Host Header Note**: When a CNAME points `api.haiphen.io` →
> `haiphen-api-ifkn3iz6zq-uc.a.run.app`, Cloud Run receives requests with
> `Host: api.haiphen.io`. Cloud Run needs a custom domain mapping to route
> these correctly. Set this up **before** failover:
>
> ```bash
> gcloud run domain-mappings create --service=haiphen-api \
>   --domain=api.haiphen.io --region=us-central1
> ```
>
> This requires DNS verification (TXT record) and takes ~15 min for TLS
> certificate provisioning. Do this proactively for all subdomains so
> failover is instant when needed.

---

## 4. Verify Failover

```bash
# Check DNS resolution (should point to GCP, not CF)
dig api.haiphen.io CNAME +short

# Test the endpoint
curl -s https://api.haiphen.io/v1/health

# Check GCP logs
gcloud functions logs read haiphen-secure --gen2 --region=us-central1 --limit=20
# or for Cloud Run:
gcloud run services logs read haiphen-api --region=us-central1 --limit=20
```

---

## 5. Rollback to Cloudflare

### 5a. Via watchdog

```bash
# Revert all
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://watchdog.haiphen.io/v1/watchdog/revert

# Revert a single worker
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://watchdog.haiphen.io/v1/watchdog/revert/haiphen-api
```

### 5b. Manual rollback

```bash
# 1. Delete the GCP DNS CNAME record
DNS_RECORD_ID="xyz789"
curl -X DELETE -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$DNS_RECORD_ID"

# 2. Recreate the CF worker route
curl -X POST -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/workers/routes" \
  -d '{"pattern":"api.haiphen.io/*","script":"haiphen-api"}'
```

---

## 6. D1 → Firestore Sync

GCP services read from Firestore instead of D1. Ensure sync is current:

```bash
# Trigger sync manually
curl -X POST \
  "https://us-central1-$GCP_PROJECT_ID.cloudfunctions.net/haiphen-sync"

# Check last sync status
gcloud firestore documents get _sync_log/$(date -u +%Y-%m-%d) \
  --project=$GCP_PROJECT_ID
```

The sync runs automatically daily at 2am UTC via Cloud Scheduler.
For a more recent sync during active failover, trigger it manually or
increase the Cloud Scheduler frequency:

```bash
gcloud scheduler jobs update http d1-firestore-sync \
  --location=us-central1 --schedule="0 */4 * * *"  # every 4 hours
```

---

## 7. Special Cases

### Checkout (Stripe webhooks)

If haiphen-checkout is failed over, Stripe webhooks still point to
`checkout.haiphen.io` which now resolves to GCP. The GCP checkout service
must handle the same webhook signature verification. **Update the Stripe
webhook endpoint URL in the Stripe dashboard if the GCP endpoint uses a
different path.**

### Cron triggers

CF cron triggers (crawler, contact digest) stop firing when routes are deleted.
Re-create equivalent schedules in Cloud Scheduler:

```bash
# Crawler (every 30 min)
gcloud scheduler jobs create http haiphen-crawler-cron \
  --location=us-central1 --schedule="*/30 * * * *" \
  --uri="https://us-central1-$GCP_PROJECT_ID.cloudfunctions.net/haiphen-crawler" \
  --http-method=POST

# Contact digest (weekdays 1pm UTC)
gcloud scheduler jobs create http haiphen-contact-digest \
  --location=us-central1 --schedule="0 13 * * 1-5" \
  --uri="https://us-central1-$GCP_PROJECT_ID.cloudfunctions.net/haiphen-contact" \
  --http-method=POST \
  --message-body='{"type":"digest"}'
```

### Durable Objects

DOs (RateLimiterDO, QuotaDO, StatusDO, TicketQueue, WorkQueueDO) don't exist
in GCP. Cloud Run replacements use Firestore for persistence:

| DO | GCP Replacement |
|----|----------------|
| RateLimiterDO | In-memory token bucket + Firestore write-behind (5s) |
| QuotaDO | Firestore `quota/{date}` with atomic increment |
| StatusDO | Disabled during failover (checkout uses polling) |
| TicketQueue | Firestore `tickets/` collection |
| WorkQueueDO | Firestore `work_queue/` collection |

---

## 8. Deploying GCP Services

All 9 services deploy as **Cloud Functions gen2** (backed by Cloud Run).
Scaffold services compile TS together; core services (api, checkout) use
esbuild to bundle the CF worker source to CJS first.

### 8a. Build all services locally

```bash
cd haiphen-gcp

# 6 scaffold Cloud Functions + auth (copies shared adapters + compiles)
for svc in secure network graph risk causal supply auth; do
  ./build-function.sh $svc
done

# api + checkout (uses esbuild to bundle CF worker TS → CJS, then compiles wrapper)
for svc in api checkout; do
  ./build-function.sh $svc
done
```

### 8b. Deploy 6 scaffold Cloud Functions

```bash
for svc in secure network graph risk causal supply; do
  cd functions/haiphen-$svc
  gcloud functions deploy haiphen-$svc \
    --gen2 --runtime=nodejs20 --region=us-central1 \
    --source=. --entry-point=handler \
    --trigger-http --allow-unauthenticated \
    --memory=256Mi --timeout=30s \
    --set-secrets=JWT_SECRET=HAIPHEN_JWT_SECRET:latest,INTERNAL_TOKEN=HAIPHEN_INTERNAL_TOKEN:latest
  cd ../..
done
```

### 8c. Deploy 3 core Cloud Functions

```bash
# haiphen-auth (auth worker is JS, loaded via dynamic import as .mjs)
cd functions/haiphen-auth
gcloud functions deploy haiphen-auth-fn \
  --gen2 --runtime=nodejs20 --region=us-central1 \
  --source=. --entry-point=handler \
  --trigger-http --allow-unauthenticated \
  --memory=256Mi --timeout=30s \
  --set-secrets="JWT_SECRET=HAIPHEN_JWT_SECRET:latest,SENDGRID_API_KEY=HAIPHEN_SENDGRID_API_KEY:latest,GITHUB_CLIENT_ID=HAIPHEN_GITHUB_CLIENT_ID:latest,GITHUB_CLIENT_SECRET=HAIPHEN_GITHUB_CLIENT_SECRET:latest,GOOGLE_CLIENT_ID=HAIPHEN_GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=HAIPHEN_GOOGLE_CLIENT_SECRET:latest"
cd ../..

# haiphen-api (worker bundled to CJS via esbuild)
cd functions/haiphen-api
gcloud functions deploy haiphen-api \
  --gen2 --runtime=nodejs20 --region=us-central1 \
  --source=. --entry-point=handler \
  --trigger-http --allow-unauthenticated \
  --memory=256Mi --timeout=30s \
  --set-secrets="JWT_SECRET=HAIPHEN_JWT_SECRET:latest,API_KEY_PEPPER=HAIPHEN_API_KEY_PEPPER:latest,ADMIN_TOKEN=HAIPHEN_ADMIN_TOKEN:latest,INTERNAL_TOKEN=HAIPHEN_INTERNAL_TOKEN:latest"
cd ../..

# haiphen-checkout (worker bundled to CJS via esbuild)
cd functions/haiphen-checkout
gcloud functions deploy haiphen-checkout \
  --gen2 --runtime=nodejs20 --region=us-central1 \
  --source=. --entry-point=handler \
  --trigger-http --allow-unauthenticated \
  --memory=256Mi --timeout=30s \
  --set-secrets="JWT_SECRET=HAIPHEN_JWT_SECRET:latest,STRIPE_SECRET_KEY=HAIPHEN_STRIPE_SECRET_KEY:latest"
cd ../..
```

### 8d. Get deployed URLs

```bash
# All services are Cloud Functions gen2 (each backed by a Cloud Run service)
for svc in secure network graph risk causal supply api auth-fn checkout; do
  echo "haiphen-$svc: $(gcloud functions describe haiphen-$svc --gen2 --region=us-central1 --format='value(serviceConfig.uri)')"
done
```

### 8e. Register GCP URLs with the watchdog

The watchdog stores **Cloud Run hostnames** (not full URLs) for CNAME targets:

```bash
for svc in secure network graph risk causal supply api auth-fn checkout; do
  URI=$(gcloud functions describe haiphen-$svc --gen2 --region=us-central1 --format='value(serviceConfig.uri)')
  HOSTNAME="${URI#https://}"
  # Map auth-fn → haiphen-auth for watchdog worker name
  WORKER="haiphen-${svc/auth-fn/auth}"
  curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    https://haiphen-watchdog.pi-307.workers.dev/v1/watchdog/gcp-url \
    -d "{\"worker\":\"$WORKER\",\"url\":\"$HOSTNAME\"}"
done
```

---

## 9. Emergency: Full Failover Checklist

If CF is completely down or over quota:

1. [ ] Run `haiphen-gcp/setup.sh` (if not already done)
2. [ ] Deploy sync function: `cd haiphen-gcp/functions/haiphen-sync && gcloud functions deploy ...`
3. [ ] Trigger immediate sync: `curl -X POST <sync-url>`
4. [ ] Build all services: `./build-function.sh <svc>` + `./build-cloudrun.sh <svc>` (Section 8a)
5. [ ] Deploy 6 scaffold Cloud Functions (Section 8b)
6. [ ] Deploy 3 core Cloud Run services (Section 8c)
7. [ ] Register GCP URLs with watchdog (Section 8e)
8. [ ] For each worker: delete CF route + create DNS CNAME (Section 3 above)
9. [ ] Create Cloud Scheduler jobs for cron-driven workers (Section 7)
10. [ ] Update Stripe webhook URL if checkout is failed over
11. [ ] Verify all endpoints: `curl https://{subdomain}.haiphen.io/healthz`
12. [ ] Monitor GCP usage: `gcloud monitoring dashboards list`

**Estimated failover time**: ~15 minutes if GCP services are pre-deployed.
