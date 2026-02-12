# Haiphen Feature Roadmap

> **For Claude Code**: Be aware of all planned features when making architectural decisions,
> but only implement what is explicitly requested in each session. Design for extensibility.

---

## Context Documents

The following documents in the project root provide authoritative content and branding:

| File | Purpose |
|------|---------|
| `Haiphen.pptx` | Investor/client deck with messaging, figures, diagrams, value props |
| `Haiphen_Updated_Service_Agreement.docx` | Service terms, cohort program details, deliverables |

**When updating content, messaging, or creating new sections, these documents are the source of truth.**

---

## Phase 1: Security & Code Hygiene ✅ COMPLETED

- [x] Remove `/kv-test` debug endpoint from haiphen-auth
- [x] Fix revocation fail-open in haiphen-auth (require jti + REVOKE_KV)
- [x] Fix revocation fail-open in haiphen-checkout
- [x] Remove duplicate admin metrics upsert in haiphen-api
- [x] Add SSRF domain allowlist to admin metrics fetch
- [x] Add KPI parameter validation
- [x] Remove duplicate /vpn/discover route in orchestrator
- [x] Add queue pruning for completed/dead-letter tasks

---

## Phase 2: Content & Messaging Refresh ✅ COMPLETED

- [x] Subscription preferences section in #profile
- [x] Cohort screening section redesign
- [x] Mission section refresh aligned with fintech positioning

---

## Phase 3: User Preferences Backend ✅ COMPLETED

- [x] `user_preferences` table in D1
- [x] `GET /v1/preferences` and `PUT /v1/preferences` endpoints
- [x] haiphen-contact cron respects preferences

---

## Phase 4: Subscription Management ✅ COMPLETED

- [x] Plan display (Free / Pro / Enterprise)
- [x] Usage statistics
- [x] Plan comparison table
- [x] Stripe Customer Portal link
- [x] Billing history

---

## Phase 5: API Documentation & Quota System ✅ COMPLETED

- [x] Complete endpoint reference for all `/v1/*` routes
- [x] Authentication guide (JWT vs API keys)
- [x] Rate limiting documentation
- [x] QuotaDO: daily limits Free=200, Pro=10k, Enterprise=50k; global ceiling 95k
- [x] Scaffold services check quota via HTTP to `api.haiphen.io/v1/internal/quota/consume`
- [x] VHS demos, SEO pages, hero launcher

---

## Phase 6: Hero Launcher & Visual Assets ✅ COMPLETED

- [x] Hero device launcher with debounced hover
- [x] 6 scenario SVGs (960×540)
- [x] Dark logo variants (robot_haiphen_dark.svg, logo_dark.svg)

---

## Phase 7: Scaffold Services & Apps ✅ COMPLETED

- [x] D1 migrations 0018–0024 for 6 scaffold services
- [x] 6 service implementations (secure, network, graph, risk, causal, supply)
- [x] services.json flipped all `coming_soon` → `available`
- [x] 5 email templates, 3 HMAC endpoints
- [x] Desktop app — React 18 + Tauri 2 (5,719 lines)
- [x] Mobile app — React Native + Expo (2,514 lines)
- [x] Install page (`install.html`)

---

## Phase 8: Google OAuth & Profile ✅ COMPLETED

- [x] Google OAuth — `/login?provider=google`, `/callback/google`
- [x] Dual login buttons (GitHub dark + Google white)
- [x] Profile with 4 CSS-only tabs (overview / apikeys / settings / billing)
- [x] `body.sidebar-collapsed` toggle

---

## Phase 9: Sidebar, Billing & Profile Tabs ✅ COMPLETED

- [x] Sidebar waits for header's `haiphen:session:ready` event
- [x] NAV_MAP hash routing for profile tabs
- [x] 3 billing endpoints (account/status, billing/portal, account/suspend)
- [x] `hydrateBillingTab()` fetches live data from checkout

---

## Phase 10: Lens Toggle & Finance Theme ✅ COMPLETED

- [x] Lens toggle component (`docs/components/lens-toggle/`)
- [x] Driven by `html[data-lens="finance"]` + localStorage `haiphen.lens`
- [x] Custom event `haiphen:lens` with `detail.lens` = "tech" | "finance"
- [x] Public API: `window.HAIPHEN.lens.get()`, `.set()`, `.toggle()`
- [x] Finance dark theme overrides across base.css, site-header.css, mission.css, chatbot.css

---

## Phase 11: Navigation & Finance Assets ✅ COMPLETED

- [x] Stripe price ID fixed: `haiphen_cohort_pro` → `price_1SmGzEJRL3AYFpZZIjsqhB1T`
- [x] Nav renamed: Fin/Tech→Featured, Services→Services, Collaborate→Documentation, FAQ→Company
- [x] Sidebar links with `data-tech-label`/`data-finance-label`/`data-tech-icon`/`data-finance-icon`
- [x] finance-dashboard.svg, hero-device-launcher lens-aware
- [x] api-docs-finance.html with template overrides

---

## Phase 12: Mission Spotlight & Catalogue ✅ COMPLETED

- [x] mission.html: dual hero (data-lens-tech/data-lens-finance), catalogue + spotlight grid
- [x] mission.js: SERVICES array (7 entries), `renderSpotlightWithTabs()`, `renderCatalogue()`
- [x] 5-tab content system: Intro, Use Cases, Installation, Integration, Subscribe
- [x] Hash routing: `#mission:svc-risk:installation` pre-selects service + tab
- [x] services.json merge at load for pricing/features/trial data
- [x] 16 partner SVGs, 2 diagram SVGs, provider logo cards

---

## Phase 13: Watchdog & GCP Failover ✅ COMPLETED

- [x] haiphen-watchdog CF Worker — polls CF GraphQL Analytics API hourly
- [x] Thresholds: 60% WARN, 80% FAILOVER, 90% CRITICAL
- [x] Failover: delete CF worker route + create DNS CNAME → GCP endpoint
- [x] Admin endpoints: GET /v1/watchdog/status, POST /check, /failover, /revert, /digest
- [x] GCP infrastructure: Firestore D1/KV adapters, sync function, 3 core + 6 scaffold Cloud Functions
- [x] All 10 GCP Cloud Functions deployed + healthy (us-central1)
- [x] 9 GCP hostnames registered in WATCHDOG_KV
- [x] Crons: hourly check + weekday daily digest

---

## Phase 14: Prospect Engine ✅ COMPLETED

- [x] D1 migrations: 0025 (prospect tables), 0026 (credentials), 0027 (rules/regression)
- [x] Cloud Run Job: NVD, OSV, GitHub Advisory, Shodan crawlers
- [x] Envelope encryption credential vault (AES-256-GCM, per-row DEK)
- [x] 10 seed fintech-first use-case rules
- [x] Analyze fan-out: rule matching → service override → 6-service dispatch
- [x] Regression detection: entity dimension + vuln_class dimension
- [x] Outreach workflow: draft → approve → send (HMAC → SendGrid)
- [x] CLI: `haiphen prospect {list,get,analyze,outreach,sources,crawl,rules,regressions,approve,send,set-key,list-keys,delete-key}`
- [x] API: prospect CRUD, rules CRUD, credentials CRUD, regression, outreach

---

## Phase 15: Investigation Engine ✅ COMPLETED

- [x] D1 migration: 0028 (investigations, steps, requirements + ALTER prospect_leads)
- [x] Sequential pipeline: secure → network → causal → risk → graph → supply with upstream_context
- [x] Weighted aggregate scoring (secure 0.20, network 0.15, causal 0.20, risk 0.20, graph 0.10, supply 0.15)
- [x] Budget gate: watchdog status via CACHE_KV, blocks at 80%, constrains Claude at 60%
- [x] Claude API triple-gate: aggregate ≥60 OR step ≥80, budget normal, daily calls <50
- [x] Requirements engine: 8 rules → data_gap, capability_gap, monitor_needed, integration_needed
- [x] Solution execution: auto-resolves data_gap, monitor_needed, integration_needed
- [x] Re-investigate with risk_reduction delta
- [x] CLI: `haiphen prospect {investigate,investigation,investigations,solve,re-investigate}`

---

## Phase 16: Live Trades Pipeline ✅ COMPLETED

- [x] D1 migration: 0029 (drop unused tables, add extremes index)
- [x] API: `GET /v1/trades/latest` (public, KV-cached 5min), `GET /v1/trades/dates`, `POST /v1/internal/trades/snapshot`
- [x] Snapshot endpoint: dual auth (X-Internal-Token + HMAC-SHA256 X-Signature)
- [x] Frontend + contact worker: API-first with static file fallback (parallel fetch, newer wins)
- [x] GCP sync job: queries 4 Postgres MVs, POSTs to API
- [x] E2E verified: 26 KPIs, 24 portfolio assets, 5 extremes KPIs
- [x] Cohort survey: broker dropdown (Q2), COHORT_SCHEMA_VERSION `v2_2026-02-11`

---

## Phase 17: Broker Integration — Paper Trading ✅ COMPLETED

- [x] D1 migration: 0030 (broker_connections, broker_sync_log)
- [x] CLI: `haiphen broker {init,status,trade,positions,orders,order,cancel,halt,watch,sync,config,disconnect}`
- [x] Alpaca paper trading only — compile-time constant, defense-in-depth URL validation
- [x] Adapter interface (`internal/broker/broker.go`) with Alpaca impl + Schwab stub
- [x] Encrypted credential store: AES-256-GCM, PBKDF2, machine-bound key
- [x] Safety rails: max 1000 shares/order, max $50k/order, $10k daily loss limit
- [x] Pipeline sync: maps paper data → 7 KPIs (source: "paper:alpaca")
- [x] WebSocket streaming: `wss://paper-api.alpaca.markets/stream`
- [x] API: PUT/GET/DELETE `/v1/broker/connections/:broker`, POST `/v1/broker/sync`
- [x] Security hardening: D1 account_id encryption, constraints_json validation, rate limiting, KPI validation
- [x] 38 unit tests across 6 packages
- [x] E2E test runbook: `haiphen-cli/TESTING.md` (9-phase, 21-step checkpoint system)
- [x] Broker API docs section in api-docs.html

---

## Phase 18: CLI Distribution ✅ COMPLETED

- [x] `.goreleaser.yaml` — cross-compile darwin/linux × amd64/arm64
- [x] `scripts/build-release.sh` — local build script for 4 platforms
- [x] GitHub repos: `haiphenAI/haiphen-cli` (releases), `haiphenAI/homebrew-tap` (formula)
- [x] **v0.1.0 released** — https://github.com/haiphenAI/haiphen-cli/releases/tag/v0.1.0
- [x] Homebrew formula auto-updated by goreleaser with SHA256 checksums
- [x] Install: `brew tap haiphenAI/tap && brew install haiphen`

---

## Upcoming Work

### Error Format Standardization
- [ ] Unify error format across all workers to `{ "error": { "code": "string", "message": "string" } }`
- [ ] Currently: haiphen-api uses structured errors, others use `{ "ok": false, "error": "message" }`

### Rate Limiting Gaps
- [ ] Add rate limiting to haiphen-contact form endpoints
- [ ] Add rate limiting to haiphen-auth login/callback

### CLI Improvements
- [ ] Fix `--profile` flag init order bug (store initialized before flags parsed)
- [ ] Token encryption at rest (currently plaintext in session file)
- [ ] `haiphen metrics` command with terminal charts
- [ ] `haiphen digest` — daily summary in terminal

### GCP Failover Completion
- [ ] Cloud Run custom domain mapping for all subdomains (required for CNAME failover)
- [ ] GCP deploy for contact, crawler, orchestrator workers

### WebSocket Auth
- [ ] Add authentication to StatusDO WebSocket (checkout)

### OpenAPI Spec
- [ ] Generate OpenAPI/Swagger spec from existing endpoints
- [ ] Interactive "Try It" console in api-docs

---

## Architectural Guidelines

### Content & Messaging
- **Source of truth**: `Haiphen.pptx` and `Haiphen_Updated_Service_Agreement.docx`
- **Tone**: Professional, enterprise-grade, fintech-focused
- **Themes**: Edge computing, semantic protocols, trading infrastructure, quantitative signals

### Distribution (INVIOLABLE)
- CLI releases, Homebrew tap, and binaries go to the `haiphenAI` GitHub account — NEVER to `JudeSafo`
- Repos: `haiphenAI/haiphen-cli` (releases), `haiphenAI/homebrew-tap` (brew formula)
- The dev source repo is `JudeSafo/haiphen-aboutme`

### Air-Gap Architecture (INVIOLABLE)
- This repository (haiphen-aboutme) must NEVER have direct access to the GKE cluster, its databases, or any Kubernetes resources
- The GKE cluster pushes data TO Cloudflare Workers (haiphen-api) via authenticated HTTPS endpoints; this repo reads FROM D1 via wrangler
- No `kubectl`, `k8s/` manifests, Kubernetes secrets, or GKE connection strings may exist in this repo
- Any future pipeline that requires GKE data must flow through authenticated API endpoints — never via direct database or cluster access

### API Design
- All new endpoints under `/v1/` prefix
- Consistent error format: `{ "error": { "code": "string", "message": "string" } }`
- Rate limiting on all public endpoints

### Frontend Components
- Follow existing pattern in `docs/components/`
- Each component: folder with `.html`, `.js`, `.css`
- Register with `window.HAIPHEN.components`

### Database Migrations
- Sequential numbering: `NNNN_description.sql`
- Test locally before remote
- Latest: `0030_broker_connections.sql`

---

## Quick Reference

| Phase | Feature | D1 Migrations | Key Files |
|-------|---------|---------------|-----------|
| 1 | Security & Hygiene | — | haiphen-auth, haiphen-api, haiphen-checkout |
| 2–4 | Content, Prefs, Subs | user_preferences | docs/components/cohort/, profile/ |
| 5–6 | API Docs, Quota, Hero | — | docs/components/api-docs/, QuotaDO |
| 7 | Scaffold Services + Apps | 0018–0024 | haiphen-{secure,network,graph,risk,causal,supply}, desktop, mobile |
| 8–9 | OAuth, Profile, Billing | — | haiphen-auth, docs/components/profile/ |
| 10–12 | Lens, Nav, Mission | — | docs/components/lens-toggle/, mission/ |
| 13 | Watchdog + GCP | — | haiphen-watchdog, haiphen-gcp/ |
| 14 | Prospect Engine | 0025–0027 | haiphen-api, haiphen-gcp/jobs/haiphen-prospect-crawler/ |
| 15 | Investigation Engine | 0028 | haiphen-api (investigate/solve/re-investigate) |
| 16 | Live Trades Pipeline | 0029 | haiphen-api, haiphen-gcp/jobs/haiphen-trades-sync/ |
| 17 | Broker Integration | 0030 | haiphen-cli/internal/broker/, haiphen-api |
| 18 | CLI Distribution | — | .goreleaser.yaml, haiphenAI/haiphen-cli |
