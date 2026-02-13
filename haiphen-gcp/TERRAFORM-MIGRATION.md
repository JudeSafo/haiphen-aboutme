# Terraform Migration Guide — Haiphen Infrastructure

Cloud-portable infrastructure-as-code strategy for migrating Haiphen's
Cloudflare Workers stack to any provider using Terraform.

---

## 1. Infrastructure Inventory

### 1a. Compute (12 Workers)

| Worker | Subdomain | Language | Durable Objects | Cron |
|--------|-----------|----------|-----------------|------|
| haiphen-api | api | TypeScript | RateLimiterDO, QuotaDO | — |
| haiphen-auth | auth | JavaScript | — | — |
| haiphen-checkout | checkout | TypeScript | StatusDO | — |
| haiphen-contact | contact | TypeScript | TicketQueue | weekdays 1pm UTC |
| edge-crawler | crawler | TypeScript | — | every 30min |
| haiphen-orchestrator | orchestrator | JavaScript | WorkQueueDO | weekdays 1pm UTC |
| haiphen-watchdog | watchdog | TypeScript | — | hourly + weekdays 8am UTC |
| haiphen-secure | secure | TypeScript | — | — |
| haiphen-network | network | TypeScript | — | — |
| haiphen-graph | graph | TypeScript | — | — |
| haiphen-risk | risk | TypeScript | — | — |
| haiphen-causal | causal | TypeScript | — | — |
| haiphen-supply | supply | TypeScript | — | — |

### 1b. Database

| Resource | Type | ID | Notes |
|----------|------|----|-------|
| Shared D1 | SQLite | `9a26fb67-b6e5-4d5f-8e62-3ecfde5ee8c2` | 24 migrations, ~10 tables |

### 1c. KV Namespaces (5)

| Namespace | Purpose | Key patterns |
|-----------|---------|--------------|
| REVOKE_KV | Token + API key revocation, plan cache | `revoke:<jti>`, `revoked:<key_hash>`, `plan:<login>` |
| ENTITLE_KV | Payment status after Stripe checkout | `entitlement:<user_id>` |
| CACHE_KV | Metrics response caching | `cache:<endpoint>:<params_hash>` |
| CRAWL_KV | Crawler state + visited URLs | `visited:<url_hash>` |
| STATE_KV / WATCHDOG_KV | Orchestrator state + watchdog GCP URLs | `gcp:<worker>`, `state:*` |

### 1d. Durable Objects (5)

| DO Class | Worker | State Model | GCP Replacement |
|----------|--------|-------------|-----------------|
| RateLimiterDO | api | Sliding window in-memory + alarm persist | Firestore token bucket |
| QuotaDO | api | Daily counter + alarm reset | Firestore atomic increment |
| StatusDO | checkout | WebSocket broadcast | Firestore (polling during failover) |
| TicketQueue | contact | Queue + batch digest | Firestore collection |
| WorkQueueDO | orchestrator | Task queue + dead-letter | Firestore collection |

### 1e. DNS Routes

All routes are `*.haiphen.io/*` pattern-matched via CF zone `6839cf5279822fd740a95e38d80c11f3`.

### 1f. Secrets (7)

| Secret | Used by |
|--------|---------|
| JWT_SECRET | auth, api, checkout, scaffold services |
| INTERNAL_TOKEN | api, scaffold services |
| API_KEY_PEPPER | api |
| ADMIN_TOKEN | api, watchdog |
| STRIPE_SECRET_KEY | checkout |
| SENDGRID_API_KEY | auth, contact |
| GITHUB_CLIENT_ID / SECRET | auth |
| GOOGLE_CLIENT_ID / SECRET | auth |

---

## 2. Terraform Resource Mapping

### 2a. Recommended Module Structure

```
terraform/
├── modules/
│   ├── dns/              # Zone, records, routes
│   ├── compute/          # Serverless functions / containers
│   ├── database/         # SQL database (D1, Cloud SQL, RDS, etc.)
│   ├── kv-store/         # Key-value store (KV, Redis, DynamoDB, etc.)
│   ├── secrets/          # Secret management
│   └── scheduling/       # Cron triggers
├── environments/
│   ├── cloudflare/       # Current production (import existing)
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── terraform.tfvars
│   ├── gcp/              # Failover target
│   ├── aws/              # Alternative provider
│   └── bare-metal/       # Self-hosted (Hetzner/OVH)
├── shared/
│   ├── versions.tf       # Provider version constraints
│   └── outputs.tf        # Cross-module output definitions
└── README.md
```

### 2b. Provider Equivalents

| Haiphen Resource | Cloudflare | GCP | AWS | Azure | Bare Metal |
|-----------------|------------|-----|-----|-------|------------|
| Worker (compute) | `cloudflare_worker_script` | Cloud Functions gen2 | Lambda + API Gateway | Azure Functions | Node.js + systemd |
| D1 (database) | `cloudflare_d1_database` | Cloud SQL (PostgreSQL) | RDS (PostgreSQL) | Azure SQL | SQLite / PostgreSQL |
| KV (key-value) | `cloudflare_workers_kv_namespace` | Firestore | DynamoDB | Cosmos DB | Redis / KeyDB |
| DO (stateful) | `cloudflare_worker_script` (DO binding) | Firestore + Cloud Tasks | DynamoDB + SQS | Cosmos DB + Queue | Redis + Bull |
| DNS | `cloudflare_record` | Cloud DNS | Route 53 | Azure DNS | bind9 / PowerDNS |
| Secrets | Worker env vars / Wrangler secrets | Secret Manager | Secrets Manager | Key Vault | SOPS / Vault |
| Cron | `cloudflare_worker_cron_trigger` | Cloud Scheduler | EventBridge | Timer trigger | systemd timer / cron |
| TLS | Automatic (CF proxy) | Managed certs | ACM | App Service certs | Let's Encrypt / certbot |

### 2c. GCP Terraform Example

```hcl
# --- Provider ---
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = "united-lane-361102"
  region  = "us-central1"
}

# --- Secrets ---
resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "HAIPHEN_JWT_SECRET"
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "jwt_secret_v1" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = var.jwt_secret  # from terraform.tfvars (gitignored)
}

# --- Cloud Function (scaffold example) ---
resource "google_cloudfunctions2_function" "haiphen_secure" {
  name     = "haiphen-secure"
  location = "us-central1"

  build_config {
    runtime     = "nodejs20"
    entry_point = "handler"
    source {
      storage_source {
        bucket = google_storage_bucket.functions_source.name
        object = google_storage_bucket_object.secure_zip.name
      }
    }
  }

  service_config {
    max_instance_count = 1
    available_memory   = "256Mi"
    timeout_seconds    = 30

    secret_environment_variables {
      key        = "JWT_SECRET"
      project_id = "united-lane-361102"
      secret     = "HAIPHEN_JWT_SECRET"
      version    = "latest"
    }
    secret_environment_variables {
      key        = "INTERNAL_TOKEN"
      project_id = "united-lane-361102"
      secret     = "HAIPHEN_INTERNAL_TOKEN"
      version    = "latest"
    }
  }
}

# --- Firestore (KV replacement) ---
resource "google_firestore_database" "default" {
  name        = "(default)"
  location_id = "us-central1"
  type        = "FIRESTORE_NATIVE"
}

# --- Cloud Scheduler (cron) ---
resource "google_cloud_scheduler_job" "d1_sync" {
  name     = "d1-firestore-sync"
  schedule = "0 2 * * *"
  time_zone = "UTC"

  http_target {
    http_method = "POST"
    uri         = google_cloudfunctions2_function.haiphen_sync.service_config[0].uri
    oidc_token {
      service_account_email = google_service_account.worker.email
    }
  }
}
```

### 2d. AWS Terraform Example

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

# --- Lambda Function ---
resource "aws_lambda_function" "haiphen_secure" {
  function_name = "haiphen-secure"
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  memory_size   = 256
  timeout       = 30

  filename         = "${path.module}/dist/haiphen-secure.zip"
  source_code_hash = filebase64sha256("${path.module}/dist/haiphen-secure.zip")

  environment {
    variables = {
      JWT_SECRET     = data.aws_secretsmanager_secret_version.jwt.secret_string
      INTERNAL_TOKEN = data.aws_secretsmanager_secret_version.internal.secret_string
    }
  }
}

# --- API Gateway (HTTP API) ---
resource "aws_apigatewayv2_api" "haiphen" {
  name          = "haiphen-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "secure" {
  api_id             = aws_apigatewayv2_api.haiphen.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.haiphen_secure.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "secure" {
  api_id    = aws_apigatewayv2_api.haiphen.id
  route_key = "ANY /v1/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.secure.id}"
}

# --- DynamoDB (KV replacement) ---
resource "aws_dynamodb_table" "revoke_kv" {
  name         = "haiphen-revoke-kv"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "key"

  attribute {
    name = "key"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
}

# --- RDS (D1 replacement) ---
resource "aws_db_instance" "haiphen" {
  identifier     = "haiphen-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t4g.micro"  # free tier eligible
  allocated_storage = 20

  db_name  = "haiphen"
  username = "haiphen"
  password = var.db_password

  skip_final_snapshot = true
}

# --- Secrets Manager ---
resource "aws_secretsmanager_secret" "jwt" {
  name = "haiphen/jwt-secret"
}

# --- EventBridge (cron) ---
resource "aws_scheduler_schedule" "d1_sync" {
  name       = "haiphen-d1-sync"
  schedule_expression = "cron(0 2 * * ? *)"

  target {
    arn      = aws_lambda_function.haiphen_sync.arn
    role_arn = aws_iam_role.scheduler.arn
  }

  flexible_time_window { mode = "OFF" }
}
```

### 2e. Cloudflare Terraform Example (Import Existing)

```hcl
terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cf_api_token
}

# Import existing zone
import {
  to = cloudflare_zone.haiphen
  id = "6839cf5279822fd740a95e38d80c11f3"
}

resource "cloudflare_zone" "haiphen" {
  account_id = "307a5117867a624064b8ec44fb1bac76"
  zone       = "haiphen.io"
}

# Import existing D1 database
import {
  to = cloudflare_d1_database.main
  id = "307a5117867a624064b8ec44fb1bac76/9a26fb67-b6e5-4d5f-8e62-3ecfde5ee8c2"
}

resource "cloudflare_d1_database" "main" {
  account_id = "307a5117867a624064b8ec44fb1bac76"
  name       = "haiphen-db"
}

# Worker script + route
resource "cloudflare_worker_script" "api" {
  account_id = "307a5117867a624064b8ec44fb1bac76"
  name       = "haiphen-api"
  content    = file("${path.module}/dist/haiphen-api/index.js")
  module     = true

  d1_database_binding {
    name = "DB"
    id   = cloudflare_d1_database.main.id
  }

  kv_namespace_binding {
    name         = "REVOKE_KV"
    namespace_id = "7ef6277b..."  # existing KV ID
  }

  secret_text_binding {
    name = "JWT_SECRET"
    text = var.jwt_secret
  }
}

resource "cloudflare_worker_route" "api" {
  zone_id     = cloudflare_zone.haiphen.id
  pattern     = "api.haiphen.io/*"
  script_name = cloudflare_worker_script.api.name
}

# Cron trigger
resource "cloudflare_worker_cron_trigger" "crawler" {
  account_id  = "307a5117867a624064b8ec44fb1bac76"
  script_name = "edge-crawler"
  schedules   = ["*/30 * * * *"]
}
```

---

## 3. Migration Strategy

### Phase 1: DNS Layer (Week 1)

**Goal**: Import Cloudflare zone + routes into Terraform state without changing anything.

1. Initialize Terraform with the Cloudflare provider
2. Import the zone: `terraform import cloudflare_zone.haiphen 6839cf5279822fd740a95e38d80c11f3`
3. Import all 12 worker routes + DNS records
4. Run `terraform plan` — should show no changes (drift check)
5. Commit the `.tf` files. DNS is now managed by Terraform.

**Risk**: Zero — import is read-only. Changes only happen on `terraform apply`.

### Phase 2: Compute Layer (Week 2)

**Goal**: Define all 12 workers as Terraform resources (Cloudflare first, then GCP/AWS modules).

1. Create `cloudflare_worker_script` resources for each worker
2. Import existing scripts: `terraform import cloudflare_worker_script.api 307a.../haiphen-api`
3. Create parallel GCP/AWS modules using the resource mappings from Section 2
4. Use `terraform workspace` or separate env dirs to switch providers:
   ```bash
   cd environments/gcp && terraform apply    # deploy GCP failover
   cd environments/aws && terraform apply    # deploy AWS alternative
   ```

**Portability notes**:
- All workers bundle to CJS via `esbuild` — this is standard Node.js, runs anywhere
- Entry point is always `handler` (functions-framework compatible)
- GCP Cloud Functions gen2 already proven working (Phase 13)

### Phase 3: Data Layer (Week 3)

**Goal**: Define database, KV, and DO replacements.

| CF Resource | Portable Replacement | Migration Path |
|-------------|---------------------|----------------|
| D1 (SQLite) | PostgreSQL or SQLite file | `sqlite3 .dump` → `psql` import. Schema in `d1/migrations/*.sql` is standard SQL. |
| KV | Redis / DynamoDB / Firestore | Simple GET/PUT interface — adapter pattern already in `haiphen-gcp/shared/firestore-kv.ts` |
| Durable Objects | Firestore / DynamoDB + SQS | Adapters already built in `haiphen-gcp/shared/firestore-*.ts` |

**D1 migration is the easiest** — it's literally SQLite. Export with:
```bash
# Export from CF D1
wrangler d1 export haiphen-db --remote --output=d1-dump.sql

# Import to PostgreSQL
psql -d haiphen < d1-dump.sql
# (minor syntax fixes: AUTOINCREMENT → GENERATED ALWAYS AS IDENTITY, etc.)

# Or just use SQLite directly
sqlite3 haiphen.db < d1-dump.sql
```

### Phase 4: CI/CD (Week 4)

**Goal**: Add Terraform to the existing GitHub Actions workflow.

```yaml
# .github/workflows/terraform.yml
name: Terraform
on:
  push:
    paths: ['terraform/**']
  pull_request:
    paths: ['terraform/**']

jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init
        working-directory: terraform/environments/${{ matrix.env }}
      - run: terraform plan -no-color
        working-directory: terraform/environments/${{ matrix.env }}
    strategy:
      matrix:
        env: [cloudflare, gcp]

  apply:
    if: github.ref == 'refs/heads/master'
    needs: plan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - run: terraform apply -auto-approve
        working-directory: terraform/environments/${{ matrix.env }}
    strategy:
      matrix:
        env: [cloudflare]  # only auto-apply CF; GCP is failover-on-demand
```

---

## 4. Cost Comparison

| Provider | Monthly Cost | Compute | Database | KV/Cache | Notes |
|----------|-------------|---------|----------|----------|-------|
| **Cloudflare** | **~$5** | Workers Paid ($5, 10M req) | D1 (included) | KV (included) | Current production. Best value. |
| **GCP free tier** | **$0–2** | Cloud Functions (2M free) | Firestore (1GB free) | Firestore (50k reads/day free) | Failover only. Scale-to-zero. Artifact storage adds ~$1. |
| **AWS** | **~$5–8** | Lambda (1M free) + API GW ($1/M req) | RDS db.t4g.micro (free tier 12mo) | DynamoDB (25GB free) | Good Lambda free tier. API Gateway adds cost. |
| **Azure** | **~$3–6** | Functions (1M free) | Azure SQL (free tier 32GB) | Cosmos DB (1000 RU/s free) | Competitive free tiers. More complex IAM. |
| **Hetzner** | **~$5** | CX22 (2 vCPU, 4GB) | SQLite on disk | Redis on same box | Self-managed. Best for full control. Needs own TLS + monitoring. |

### Cost Drivers & Optimization

**Cloudflare ($5/mo)**: The Workers Paid plan is a flat $5/mo for 10M requests, 25B D1 reads, 10M KV reads. Haiphen uses <1% of these limits. This is by far the most cost-effective option.

**GCP ($0–2/mo for failover)**: Cloud Functions gen2 scale to zero — no idle cost. The main cost drivers are:
- Artifact Registry storage (~$0.10/GB/mo for container images)
- Cloud Build minutes (~$0.003/min, first 120 min free)
- The GKE cluster `realtime-data` ($260+/mo) is unrelated to Haiphen

**AWS ($5–8/mo)**: Lambda is free up to 1M requests. API Gateway HTTP API is $1/M requests (cheaper than REST API at $3.50/M). DynamoDB on-demand is free up to 25GB. RDS free tier is 12 months only.

**Self-hosted ($5/mo)**: Hetzner CX22 at ~$4.50/mo. Run Node.js processes behind Caddy (auto-TLS). Use SQLite directly (no migration needed). Requires ops effort: monitoring, updates, backups.

---

## 5. Key Portability Notes

### What's Easy to Migrate

- **Workers → Node.js functions**: All workers use `fetch()` handlers that esbuild bundles to CJS. The GCP Cloud Functions wrappers in `haiphen-gcp/functions/` prove this works. Same pattern applies to Lambda, Azure Functions, or bare Express/Hono.

- **D1 → any SQL database**: D1 is SQLite. The 24 migration files in `d1/migrations/` use standard SQL. Only minor changes needed for PostgreSQL (e.g., `AUTOINCREMENT` → `SERIAL`).

- **KV → any key-value store**: Simple GET/PUT/DELETE interface. The adapter in `haiphen-gcp/shared/firestore-kv.ts` shows the pattern — implement the same interface for Redis, DynamoDB, etc.

- **Secrets**: All 7 secrets are simple string values. Every provider has a secrets manager.

- **Cron**: Every provider has a scheduler. Map CF cron expressions directly.

### What's Hard to Migrate

- **Durable Objects**: The hardest part. DOs provide single-threaded, transactional, in-memory state with persistence. No direct equivalent exists elsewhere. The Firestore adapters in `haiphen-gcp/shared/` are functional but lose:
  - WebSocket support (StatusDO) — must use polling or a separate WebSocket service
  - Guaranteed single-instance execution — must use distributed locks
  - Sub-millisecond latency — Firestore/DynamoDB add 5–50ms

- **CF Worker routing**: Workers use domain-pattern routing (`api.haiphen.io/*`). Other providers need an explicit API gateway or reverse proxy layer.

- **CNAME failover**: The watchdog's CNAME strategy requires Cloud Run custom domain mapping to handle the `Host: *.haiphen.io` header. This is a documented limitation — domain mappings need DNS verification and ~15 min for TLS cert provisioning.

### Migration Checklist

- [ ] Initialize Terraform with Cloudflare provider
- [ ] Import existing zone, routes, D1, KV namespaces
- [ ] Verify `terraform plan` shows no drift
- [ ] Create GCP module (already have working Cloud Functions)
- [ ] Create AWS module (Lambda + API Gateway + DynamoDB)
- [ ] Add CI/CD pipeline for terraform plan/apply
- [ ] Test failover: CF → GCP → revert
- [ ] Test failover: CF → AWS → revert
- [ ] Document runbook for each provider
