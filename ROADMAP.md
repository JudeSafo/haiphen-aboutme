# Haiphen Feature Roadmap

> **For Claude Code**: Be aware of all planned features when making architectural decisions,
> but only implement what is explicitly requested in each session. Design for extensibility.

---

## Phase 1: Design System & Theming ← CURRENT

**Goal**: Professional dark/light theme with enterprise-grade visual design.

- [ ] Dark/light theme toggle with CSS custom properties
- [ ] Define complete color palette for both themes in `docs/assets/base.css`
- [ ] Create `docs/components/theme-toggle/` component
- [ ] localStorage persistence for anonymous users
- [ ] Respect `prefers-color-scheme` media query on first visit
- [ ] Apply theme consistently to ALL existing components
- [ ] Smooth transition animations between themes
- [ ] Update favicon/logo variants for dark mode if needed

**Design Notes**:
- Structure theme system knowing Phase 2 will add server-side sync
- Theme toggle should expose a simple API: `window.HAIPHEN.theme.get()`, `.set()`, `.toggle()`
- CSS should use `:root` for light (default) and `[data-theme="dark"]` on `<html>` for dark

---

## Phase 2: User Preferences Backend

**Goal**: Persist user preferences server-side for cross-device sync.

- [ ] Create `user_preferences` table in D1:
  ```sql
  CREATE TABLE user_preferences (
    github_login TEXT PRIMARY KEY,
    theme TEXT DEFAULT 'system', -- 'light' | 'dark' | 'system'
    sidebar_collapsed INTEGER DEFAULT 0,
    notification_settings TEXT, -- JSON blob
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  ```
- [ ] Add `GET /v1/preferences` endpoint in haiphen-api
- [ ] Add `PUT /v1/preferences` endpoint in haiphen-api
- [ ] Update theme-toggle component to:
  1. Check if user is authenticated (via `/me`)
  2. If yes: fetch from `/v1/preferences`, fall back to localStorage
  3. If no: use localStorage only
- [ ] Sync preference changes to server when logged in

---

## Phase 3: Cohort Screening Redesign

**Goal**: Professional, comprehensive cohort program page that converts visitors.

### Content Requirements
- [ ] Clear explanation of what the Cohort Program is
- [ ] Who it's for (target audience)
- [ ] What participants will learn/gain
- [ ] Time commitment and schedule
- [ ] Application process steps
- [ ] Selection criteria
- [ ] FAQ specific to cohort program
- [ ] Testimonials/success stories (placeholder for now)

### Design Requirements
- [ ] Professional hero section with compelling headline
- [ ] Step-by-step visual timeline of the program
- [ ] Benefits grid with icons
- [ ] Application form redesign (currently in `docs/components/cohort/`)
- [ ] Progress indicator for multi-step form
- [ ] Professional assets (illustrations, icons)
- [ ] Mobile-optimized layout

### Technical
- [ ] Update `docs/components/cohort/` component
- [ ] Ensure form submits to existing `haiphen-contact` worker endpoint
- [ ] Add form validation with helpful error messages
- [ ] Success state with next steps

---

## Phase 4: Subscription Management Page

**Goal**: Self-service subscription management for paying users.

- [ ] New section at `#subscription` or dedicated page
- [ ] Display current plan (Free / Pro / Enterprise)
- [ ] Usage statistics:
  - API calls this billing period
  - Rate limit utilization
  - Storage usage (if applicable)
- [ ] Plan comparison table
- [ ] Upgrade/downgrade CTAs
- [ ] Link to Stripe Customer Portal for:
  - Update payment method
  - View invoices
  - Cancel subscription
- [ ] Billing history (recent invoices)

### Backend Requirements
- [ ] `GET /v1/subscription` endpoint (plan, usage stats, limits)
- [ ] `GET /v1/usage` endpoint (detailed usage metrics)
- [ ] Stripe Customer Portal session creation endpoint

---

## Phase 5: API Documentation Overhaul

**Goal**: Production-ready API docs with real endpoints and interactive examples.

### Content
- [ ] Complete endpoint reference for all `/v1/*` routes
- [ ] Authentication guide (JWT vs API keys)
- [ ] Rate limiting documentation
- [ ] Error code reference
- [ ] Webhook integration guide
- [ ] SDK/client library examples (curl, Python, Node.js, Go)
- [ ] Real request/response examples (not mocked)

### Features
- [ ] Interactive "Try It" console connected to real API (with user's API key)
- [ ] Code snippet generator (copy-paste ready)
- [ ] API key management inline (issue/revoke from docs)
- [ ] Search across all documentation
- [ ] Changelog/versioning notes

### Technical
- [ ] Update `docs/components/api-docs/`
- [ ] OpenAPI/Swagger spec generation from worker code
- [ ] Syntax highlighting for code blocks

---

## Phase 6: Enhanced Email Notifications

**Goal**: Transactional emails for key user events.

- [ ] Payment confirmation email (on Stripe webhook success)
  - Receipt details
  - What's now unlocked
  - Getting started links
- [ ] Subscription change notifications
  - Upgrade confirmation
  - Downgrade notice with what's changing
  - Cancellation confirmation
- [ ] Usage alert emails
  - Approaching rate limit (80%, 95%)
  - Usage spike detection
- [ ] Welcome email improvements
  - Onboarding checklist
  - Quick start guide
  - Support contact info

### Technical
- [ ] New endpoints in `haiphen-contact/worker.ts`:
  - `POST /internal/email/payment-confirmation`
  - `POST /internal/email/subscription-change`
  - `POST /internal/email/usage-alert`
- [ ] SendGrid dynamic templates for each email type
- [ ] HMAC verification for internal endpoints
- [ ] Idempotency keys to prevent duplicate sends

---

## Phase 7: haiphen-api Enhancements

**Goal**: Extend API with new endpoints and improved data models.

### New Endpoints
- [ ] `GET /v1/trades` — paginated trade history
- [ ] `GET /v1/trades/:id` — single trade details
- [ ] `POST /v1/trades` — record new trade (for data ingestion)
- [ ] `GET /v1/analytics/summary` — aggregated analytics
- [ ] `GET /v1/analytics/performance` — performance metrics over time

### Schema Updates
- [ ] Review and extend `trades` table schema:
  - Additional fields for trade metadata
  - Indexing for common query patterns
  - Consider partitioning strategy for scale
- [ ] Create migration files in `d1/migrations/`

### Improvements
- [ ] Input validation with Zod or similar
- [ ] Consistent error response format across all endpoints
- [ ] Request logging for debugging
- [ ] API versioning strategy documentation

---

## Phase 8: CLI Enhancements

**Goal**: Extend haiphen-cli with metrics visualization.

- [ ] `haiphen metrics` command
  - Fetch and display daily metrics
  - ASCII/Unicode chart rendering in terminal
  - Color-coded KPI display
- [ ] `haiphen metrics --export csv` — export to CSV
- [ ] `haiphen metrics --export json` — export to JSON
- [ ] `haiphen digest` — daily digest summary in terminal
- [ ] Interactive mode with arrow-key navigation

### Technical
- [ ] Port trades-overlay chart logic to Go (or call via embedded WebView)
- [ ] Use `github.com/gizak/termui` or similar for terminal UI
- [ ] Respect terminal width for responsive output

---

## Phase 9: Mobile App Foundation

**Goal**: Cross-platform mobile app sharing code with existing React/web.

### Evaluation
- [ ] Compare React Native vs Tauri Mobile vs PWA
- [ ] Document decision and rationale

### Shared Infrastructure
- [ ] Extract API client into shared library
- [ ] Define shared TypeScript types
- [ ] Authentication flow for mobile (OAuth deep links)

### Push Notifications
- [ ] Firebase Cloud Messaging (FCM) setup
- [ ] Apple Push Notification Service (APNs) setup
- [ ] Notification preferences in user settings

---

## Phase 10: Security Hardening

**Goal**: Address security issues identified in codebase analysis.

### High Priority
- [ ] Add rate limiting to `haiphen-contact` form endpoints
- [ ] Add rate limiting to `haiphen-auth` /login and /callback
- [ ] Fix revocation fail-open in haiphen-auth (require REVOKE_KV binding)
- [ ] Fix SSRF in admin metrics ingest (URL allowlist)
- [ ] Persist WorkQueueDO tasks to Durable Object storage

### Medium Priority
- [ ] Remove `/kv-test` debug endpoint from haiphen-auth
- [ ] Authenticate WebSocket connections in StatusDO
- [ ] Add KPI parameter allowlist validation
- [ ] Move CLI tokens to OS keyring (macOS Keychain, Windows Credential Manager)

---

## Architectural Guidelines

### User Preferences
- Always check for authenticated user first
- Fall back to localStorage for anonymous users
- Sync to server when user logs in

### API Design
- All new endpoints under `/v1/` prefix
- Consistent error format: `{ "error": { "code": "string", "message": "string" } }`
- Rate limiting on all public endpoints

### Frontend Components
- Follow existing pattern in `docs/components/`
- Each component: folder with `component.html`, `component.js`, `component.css`
- Register with `window.HAIPHEN.components`
- Support both light and dark themes

### Email Templates
- Use SendGrid dynamic templates
- Consistent branding across all emails
- Include unsubscribe link where required
- Test in multiple email clients

### Database Migrations
- Sequential numbering: `NNNN_description.sql`
- Test locally before applying to remote
- Update `d1/schema-snapshot.sql` after applying
- Never use destructive operations without backup

### Git Workflow
- Feature branches for each phase
- Squash commits on merge
- Tag releases with semver

---

## Quick Reference: What's Where

| Feature | Frontend | Backend | Database |
|---------|----------|---------|----------|
| Theme toggle | `docs/components/theme-toggle/` | `haiphen-api /v1/preferences` | `user_preferences` |
| Cohort signup | `docs/components/cohort/` | `haiphen-contact` | `cohort_submissions` |
| Subscription | `docs/components/subscription/` (new) | `haiphen-api`, `haiphen-checkout` | `entitlements`, `checkout_sessions` |
| API docs | `docs/components/api-docs/` | `haiphen-api` | — |
| Emails | — | `haiphen-contact` | `email_deliveries` |
