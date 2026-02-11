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

## Phase 2: Content & Messaging Refresh ← CURRENT

**Goal**: Align website content with professional positioning in pptx deck and service agreement.

### 2A: Subscription Preferences in #profile
- [ ] Add "Email Preferences" section to logged-in user profile (`#profile`)
- [ ] Allow users to toggle subscription categories:
  - Daily market digest
  - Weekly performance summary  
  - Product updates & announcements
  - Cohort program communications
- [ ] Create/update D1 table for subscription preferences
- [ ] Update `haiphen-contact/src/worker.ts` cron job to respect preferences
- [ ] API endpoint: `PUT /v1/preferences/subscriptions`

### 2B: Cohort Screening Section Redesign
- [ ] Transform minimal "Cohort Screening" into comprehensive standalone section
- [ ] Content to include (source from pptx + service agreement):
  - Program overview & value proposition
  - Who it's for (target audience criteria)
  - What's included (deliverables, support, metrics)
  - Timeline & structure (3-month program phases)
  - Application process (step-by-step)
  - Pricing/commitment (from service agreement)
  - FAQ
- [ ] Design requirements:
  - Professional hero with compelling headline
  - Visual timeline/roadmap diagram
  - Benefits grid with icons
  - Testimonials placeholder
  - Clear CTA to survey/application
- [ ] Must be "shareable" — works as standalone link for client outreach
- [ ] Location: Enhance existing `docs/components/cohort/` or create new section

### 2C: Mission Section Refresh
- [ ] Update Mission section in `docs/index.html` to align with:
  - Fintech/trading infrastructure positioning
  - Semantic Edge Protocol messaging from pptx
  - Professional tone matching service agreement
- [ ] Include relevant figures/diagrams from pptx (export as SVG/PNG)
- [ ] Ensure thematic consistency with rest of site

---

## Phase 3: User Preferences Backend

**Goal**: Persist user preferences server-side for cross-device sync.

- [ ] Create `user_preferences` table in D1:
  ```sql
  CREATE TABLE user_preferences (
    github_login TEXT PRIMARY KEY,
    theme TEXT DEFAULT 'system',
    sidebar_collapsed INTEGER DEFAULT 0,
    notification_settings TEXT, -- JSON blob
    subscription_preferences TEXT, -- JSON: {daily_digest, weekly_summary, updates, cohort}
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  ```
- [ ] Add `GET /v1/preferences` endpoint in haiphen-api
- [ ] Add `PUT /v1/preferences` endpoint in haiphen-api
- [ ] Update haiphen-contact cron to query preferences before sending

---

## Phase 4: Subscription Management Page

**Goal**: Self-service subscription management for paying users.

- [ ] New section at `#subscription` or dedicated page
- [ ] Display current plan (Free / Pro / Enterprise)
- [ ] Usage statistics (API calls, rate limit utilization)
- [ ] Plan comparison table
- [ ] Upgrade/downgrade CTAs
- [ ] Link to Stripe Customer Portal
- [ ] Billing history

---

## Phase 5: API Documentation Overhaul

**Goal**: Production-ready API docs with real endpoints and interactive examples.

- [ ] Complete endpoint reference for all `/v1/*` routes
- [ ] Authentication guide (JWT vs API keys)
- [ ] Rate limiting documentation
- [ ] Error code reference
- [ ] Webhook integration guide
- [ ] SDK examples (curl, Python, Node.js, Go)
- [ ] Interactive "Try It" console
- [ ] OpenAPI/Swagger spec

---

## Phase 6: Enhanced Email Notifications

**Goal**: Transactional emails for key user events.

- [ ] Payment confirmation email
- [ ] Subscription change notifications
- [ ] Usage alert emails (approaching rate limits)
- [ ] Welcome email improvements
- [ ] New endpoints in `haiphen-contact/worker.ts`
- [ ] SendGrid dynamic templates

---

## Phase 7: haiphen-api Enhancements

**Goal**: Extend API with new endpoints and improved data models.

- [ ] `GET /v1/trades` — paginated trade history
- [ ] `GET /v1/trades/:id` — single trade details
- [ ] `POST /v1/trades` — record new trade
- [ ] `GET /v1/analytics/summary` — aggregated analytics
- [ ] Schema updates to trades tables
- [ ] Input validation with Zod

---

## Phase 8: CLI Enhancements

- [ ] `haiphen metrics` command with terminal charts
- [ ] `haiphen metrics --export csv/json`
- [ ] `haiphen digest` — daily summary in terminal

---

## Phase 9: Mobile App Foundation

- [ ] React Native vs Tauri Mobile evaluation
- [ ] Shared API client library
- [ ] Push notification infrastructure

---

## Phase 10: Design System & Theming

- [ ] Dark/light theme toggle
- [ ] CSS custom properties for both themes
- [ ] Theme persistence (localStorage + server sync)
- [ ] Apply to all components

---

## Architectural Guidelines

### Content & Messaging
- **Source of truth**: `Haiphen.pptx` and `Haiphen_Updated_Service_Agreement.docx`
- **Tone**: Professional, enterprise-grade, fintech-focused
- **Themes**: Edge computing, semantic protocols, trading infrastructure, quantitative signals

### User Preferences
- Always check for authenticated user first
- Fall back to localStorage for anonymous users
- Sync to server when user logs in

### Air-Gap Architecture (INVIOLABLE)
- This repository (haiphen-aboutme) must NEVER have direct access to the GKE cluster, its databases, or any Kubernetes resources
- The GKE cluster pushes data TO Cloudflare Workers (haiphen-api) via authenticated HTTPS endpoints; this repo reads FROM D1 via wrangler
- No `kubectl`, `k8s/` manifests, Kubernetes secrets, or GKE connection strings may exist in this repo
- The purpose of the GKE → Cloudflare Worker → D1 hop is to air-gap this project from the upstream cluster, preventing injection attacks
- Any future pipeline that requires GKE data must flow through the existing `POST /v1/internal/trades/snapshot` (or similar) authenticated API endpoint — never via direct database or cluster access

### API Design
- All new endpoints under `/v1/` prefix
- Consistent error format: `{ "error": { "code": "string", "message": "string" } }`
- Rate limiting on all public endpoints

### Frontend Components
- Follow existing pattern in `docs/components/`
- Each component: folder with `.html`, `.js`, `.css`
- Register with `window.HAIPHEN.components`

### Email & Subscriptions
- Respect user preferences from `user_preferences` table
- Use SendGrid dynamic templates
- Include unsubscribe link

### Database Migrations
- Sequential numbering: `NNNN_description.sql`
- Test locally before remote
- Update `d1/schema-snapshot.sql` after applying

---

## Quick Reference: What's Where

| Feature | Frontend | Backend | Database |
|---------|----------|---------|----------|
| Profile/Subscriptions | `docs/components/profile/` | `haiphen-contact`, `haiphen-api` | `user_preferences` |
| Cohort Screening | `docs/components/cohort/` | `haiphen-contact` | `cohort_submissions` |
| Mission section | `docs/index.html` | — | — |
| Email digest | — | `haiphen-contact` cron | `email_list_subscribers` |
