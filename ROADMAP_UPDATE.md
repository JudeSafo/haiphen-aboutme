# Haiphen Roadmap Update: Services Catalog + Secure Checkout + Trial Paywall

> Audience: Claude Opus multi-agent execution.
> Primary objective: replace the current `#services` horizontal cards with a full service catalog grid, routed through `haiphen-checkout` with auth + ToS gating, and enforce free trial limits server-side before paywall.

---

## 1) Scope and Outcomes

1. Redesign `/#services` into a complete catalog of currently available and planned products.
2. Keep `/#subscribe` as a focused purchase/onboarding entrypoint.
3. Route paid actions through `haiphen-checkout` and Terms agreement before Stripe.
4. Enforce per-service free trial request limits (server-side) before purchase.
5. Keep `haiphen-api`, `haiphen-checkout`, `haiphen-contact`, `haiphen-cli`, and docs in sync.
6. Produce execution-ready requirements for Claude Opus sub-agents, including dependencies, permissions, blockers, and acceptance criteria.

---

## 2) Non-Negotiable Constraints

1. No direct Stripe payment links exposed in end-user UI.
2. Checkout flow must always be:
   - authenticated
   - ToS-gated
   - entitlement-aware
3. Trial gating must be enforced in backend APIs, not just frontend JS.
4. Every catalog service must define:
   - stable `service_id`
   - status (`LIVE`, `MVP_IN_PROGRESS`, `PLANNED`)
   - trial limit policy
   - Stripe pricing mapping (if paid)
   - destination links and CTA behavior
5. Changes must be auditable and reversible (migrations, env vars, routes, docs).

---

## 3) Service Catalog Definition

### 3.1 Key Focus / Highlight

1. `haiphen_cli`
   - Telemetry, data ingestion, manipulation, and command/control center.
   - Position as the primary operator surface and integration hub.

### 3.2 Fintech

1. `fintech_webapp`
   - Full web app access and richer time-sensitive data, previewed by `trades-overlay`.
2. `daily_newsletter`
   - Free signup for daily trade engine updates via `/#profile` preferences.
3. `mobile_app`
   - iOS/Android app with interactive chart views, notifications, and subscription-triggered event updates.
4. `desktop_app`
   - Desktop app (macOS, Windows, Linux), more robust and interactive than mobile.
5. `chatbot_webhooks`
   - Slack/Discord integration for webhook notifications linked to newsletter and telemetry events.

### 3.3 Tech

1. `haiphen_secure`
   - Open-source assisted infra tracing (`nslookup`, network trace, packet visibility) to highlight unintended service creep.
2. `network_trace`
   - Local network quality insights and optimal signal placement guidance.
3. `commercial_knowledge_graph`
   - Postgres + ontology customizations for dynamic, real-time entity relationship representation and pruning.
4. `risk_analysis`
   - Actuarial-style confidence and risk scoring for decision workflows.
5. `causal_chain`
   - Decision-tree and long-tail causal path exploration with telemetry-driven factor pruning.
6. `supply_chain_intel`
   - SDLC lifecycle and dependency exposure visibility, including downstream and transitive risk.

---

## 4) UX and Route Requirements

1. `#services` route:
   - render full catalog grid
   - group by `Highlight`, `Fintech`, `Tech`
   - show status badges and trial badges
   - show SVG preview image slot per card
2. `#subscribe` route:
   - render a focused single checkout experience
   - show only subscription onboarding card, with context and trust copy
3. CTA behavior:
   - `Try` (if trial available and not exhausted)
   - `Subscribe` (calls checkout route, not Stripe directly)
   - `Notify` (for planned services)
4. Maintain existing styling language and responsive behavior; do not degrade current navigation.

---

## 5) Checkout and Stripe Flow

1. Frontend CTA must call `haiphen-checkout`:
   - `/v1/checkout/start?service_id=<id>&price_id=<price>&plan=<plan>&tos_version=<version>`
2. `haiphen-checkout` must:
   - require auth (redirect to `auth.haiphen.io/login?to=...` when missing)
   - check service entitlement first
   - if already entitled, route to onboarding/profile destination (no repurchase)
   - if ToS missing, redirect to terms gate with resume URL
   - only then create Stripe session/payment link redirect
3. Stripe usage:
   - use local Stripe API key to manage product/price/payment-link mappings
   - keep `service_id` in Stripe metadata for traceability
4. No hardcoded Stripe URL in static docs; all routes must pass through checkout worker.

---

## 6) Trial and Paywall Rules

1. Free trial is request-count based and service-specific.
2. Trial counters must be checked/consumed server-side.
3. Once trial quota is exhausted:
   - return `payment_required` from API
   - include checkout URL payload for current service
4. `haiphen-checkout` and `haiphen-api` must share service access state consistently.

---

## 7) D1 Data Model Changes (Proposed)

Create next migration(s) in `d1/migrations/`.

### 7.1 `catalog_services`

1. `service_id TEXT PRIMARY KEY`
2. `category TEXT NOT NULL` (`highlight|fintech|tech`)
3. `name TEXT NOT NULL`
4. `summary TEXT NOT NULL`
5. `status TEXT NOT NULL` (`LIVE|MVP_IN_PROGRESS|PLANNED`)
6. `requires_payment INTEGER NOT NULL DEFAULT 1`
7. `trial_requests_limit INTEGER NOT NULL DEFAULT 0`
8. `stripe_price_id TEXT`
9. `sort_order INTEGER NOT NULL DEFAULT 0`
10. `assets_json TEXT`
11. `created_at TEXT NOT NULL`
12. `updated_at TEXT NOT NULL`

### 7.2 `user_service_access`

1. `user_login TEXT NOT NULL`
2. `service_id TEXT NOT NULL`
3. `access_state TEXT NOT NULL` (`trial|paid|revoked`)
4. `trial_requests_used INTEGER NOT NULL DEFAULT 0`
5. `trial_started_at TEXT`
6. `paid_activated_at TEXT`
7. `updated_at TEXT NOT NULL`
8. `PRIMARY KEY (user_login, service_id)`

### 7.3 `service_usage_events`

1. `event_id TEXT PRIMARY KEY`
2. `user_login TEXT NOT NULL`
3. `service_id TEXT NOT NULL`
4. `channel TEXT NOT NULL` (`web|api|cli|mobile|webhook`)
5. `request_kind TEXT NOT NULL`
6. `created_at TEXT NOT NULL`
7. `meta_json TEXT`

---

## 8) Required API Surface (`haiphen-api`)

1. `GET /v1/catalog/services`
2. `GET /v1/catalog/services/:service_id`
3. `GET /v1/services/:service_id/access`
4. `POST /v1/services/:service_id/trial/consume`
5. `POST /v1/services/:service_id/access/grant` (admin/support)
6. `POST /v1/services/:service_id/access/revoke` (admin/support)
7. Consistent paywall error contract:
   - `error.code = "payment_required"`
   - include `service_id`, `checkout_url`, `trial_requests_used`, `trial_requests_limit`

---

## 9) CLI Requirements (`haiphen-cli`)

1. Add commands:
   - `haiphen services list`
   - `haiphen services status <service_id>`
   - `haiphen services trial <service_id>`
   - `haiphen services checkout <service_id>`
2. CLI must proxy API/checkout endpoints only.
3. CLI must not query D1 directly.

---

## 10) Contact + Email Requirements (`haiphen-contact`)

1. Maintain a dedicated cohort onboarding template.
2. Send onboarding email exactly once on first successful paid activation path (idempotent check in D1).
3. Include in onboarding email:
   - profile/API key link
   - docs link
   - CLI quickstart link
   - websocket endpoint guidance
   - newsletter preference link
4. Maintain event/audit logging for send status and message IDs.

---

## 11) Stripe Workstream (Local API Driven)

1. Validate catalog service-to-product mapping in Stripe.
2. Create/confirm `price_id` per paid service.
3. Set metadata on Stripe products/prices:
   - `service_id`
   - `plan_tier`
   - `tos_version`
   - `environment`
4. Keep mapping in D1 (`catalog_services.stripe_price_id`) as source of truth for runtime routing.

Suggested verification commands:

```bash
curl -sS https://api.stripe.com/v1/products?active=true&limit=100 -u "$STRIPE_SECRET_KEY:"
curl -sS https://api.stripe.com/v1/prices?active=true&limit=100 -u "$STRIPE_SECRET_KEY:"
curl -sS https://api.stripe.com/v1/payment_links?limit=100 -u "$STRIPE_SECRET_KEY:"
```

---

## 12) Claude Opus Multi-Agent Delegation Plan

### Agent A: Frontend Catalog and UX

1. Replace services horizontal cards with catalog grid and category filters.
2. Add card components and SVG preview slots.
3. Implement `#subscribe` focused view with clear context.
4. Wire CTAs to checkout/API routes.

### Agent B: D1 + API

1. Add migrations for service catalog/access/usage.
2. Implement catalog/access/trial endpoints.
3. Add server-side trial gating and `payment_required` responses.

### Agent C: Checkout + Stripe

1. Implement service-aware checkout start flow.
2. Enforce auth + ToS + entitlement checks before Stripe redirect.
3. Integrate Stripe mapping by `service_id`.
4. Handle already-paid users by redirecting to onboarding destination.

### Agent D: CLI

1. Add `services` subcommands.
2. Support status, trial state, and checkout initiation.
3. Keep auth/rate-limit behavior aligned with API.

### Agent E: Contact + Docs + QA

1. Ensure onboarding email trigger/idempotency and template data quality.
2. Update API docs and user docs for all new services and flows.
3. Build test matrix across web/API/CLI/checkout/email.

---

## 13) Permissions and Secrets Checklist

1. Cloudflare API token scopes:
   - Workers Scripts + Routes
   - D1 edit/read
   - KV edit/read
2. Stripe secret key with product/price/payment-link read/write access.
3. SendGrid API key with template and mail send access.
4. Env var validation across workers:
   - `haiphen-api`
   - `haiphen-checkout`
   - `haiphen-contact`
   - `haiphen-auth` (for auth redirects/entitlement KV sync)

---

## 14) Known Blockers and Risk Log

1. Cloudflare deploy failures from insufficient token scopes.
2. Static docs deploy lag causing route mismatch.
3. Auth identity mismatch when adding non-GitHub providers later.
4. Stripe ID drift if IDs are hardcoded in multiple places.
5. Email deliverability/spam scoring for onboarding templates.

---

## 15) Acceptance Criteria

1. `#services` shows complete catalog (current + planned) with statuses and CTA behavior.
2. `#subscribe` is focused and routes through secure checkout.
3. Trial limits are enforced server-side and produce deterministic paywall behavior.
4. Paid users are redirected to onboarding/profile destinations instead of repurchase.
5. Onboarding email is sent once and recorded with message ID.
6. CLI can list services and retrieve user access/trial status.
7. Docs reflect new service routes, API endpoints, and user flow.

---

## 16) Delivery Sequence

1. Schema and API read layer.
2. Frontend catalog rendering with stub CTA wiring.
3. Checkout service-aware gating and Stripe mapping.
4. Trial consume/paywall enforcement.
5. CLI service command rollout.
6. Email and docs finalization.
7. End-to-end QA and rollback plan validation.
