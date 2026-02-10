# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Haiphen is a Semantic Edge Protocol Intelligence Platform — a B2B SaaS that parses industrial IoT, edge protocol, and OT traffic data, delivering normalized APIs. It runs entirely on Cloudflare Workers with D1 (SQLite), Workers KV, and Durable Objects for state.

## Repository Structure

Each `haiphen-*` directory is an independent service with its own `package.json` and wrangler config:

| Component | Language | Purpose | Route |
|-----------|----------|---------|-------|
| `haiphen-api` | TypeScript | Metrics, API keys, webhooks, RSS, QuotaDO | `api.haiphen.io/v1/*` |
| `haiphen-auth` | JavaScript | GitHub/Google OAuth, JWT, entitlements | `auth.haiphen.io/*` |
| `haiphen-checkout` | TypeScript | Stripe payments, ToS, WebSocket status | `checkout.haiphen.io/v1/*` |
| `haiphen-contact` | TypeScript | SendGrid email, ticket queue | `contact.haiphen.io/*` |
| `haiphen-crawler` | TypeScript | Cron-based web crawler | `crawler.haiphen.io/*` |
| `haiphen-orchestrator` | JavaScript | Task queue, Headscale VPN integration | `orchestrator.haiphen.io/*` |
| `haiphen-watchdog` | TypeScript | Usage monitoring, GCP failover, digest emails | `watchdog.haiphen.io/*` |
| `haiphen-secure` | TypeScript | CVE matcher service | (routes pending) |
| `haiphen-network` | TypeScript | Protocol analyzer service | (routes pending) |
| `haiphen-graph` | TypeScript | Recursive CTE / graph queries | (routes pending) |
| `haiphen-risk` | TypeScript | Monte Carlo risk simulation | (routes pending) |
| `haiphen-causal` | TypeScript | DAG builder / causal inference | (routes pending) |
| `haiphen-supply` | TypeScript | Weighted risk scorer (counterparty intel) | (routes pending) |
| `haiphen-cli` | Go 1.22 | Local gateway + OAuth CLI (Cobra) | `localhost:8787` |
| `haiphen-desktop` | React 18 + Tauri 2 | Cross-platform desktop app (Material-UI) | N/A |
| `haiphen-mobile` | React Native + Expo | Mobile app (7 screens, bottom tab nav) | N/A |
| `haiphen-gcp` | Shell + TypeScript | GCP failover infra (Firestore adapters, sync) | N/A |
| `docs/` | Static HTML/CSS/JS | Landing page SPA (no build system) | `haiphen.io` |
| `d1/migrations/` | SQL | D1 schema migrations (0001–0024) | N/A |

## Build & Run Commands

### Cloudflare Workers (all TypeScript/JS services)
```bash
cd haiphen-<service>
npm install
npm run dev          # Local dev server (where available)
npm run deploy       # Deploy to Cloudflare
```

### Auth (has tests)
```bash
cd haiphen-auth
npm test             # Runs vitest with @cloudflare/vitest-pool-workers
```

### API (D1 database utilities)
```bash
cd haiphen-api
npm run d1:tables:local    # Query local D1
npm run d1:tables:remote   # Query remote D1
npm run d1:count:remote    # Count remote records
```

### CLI (Go)
```bash
cd haiphen-cli
go build -o haiphen ./cmd/haiphen/main.go
./haiphen serve      # Local gateway on :8787
./haiphen login      # GitHub OAuth via browser
./haiphen logout
./haiphen status     # Check entitlement
```

### Desktop
```bash
cd haiphen-desktop
npm run dev          # React dev server
npm run tauri:dev    # Full desktop app with Tauri
npm run tauri:build  # Build installer
```

### Mobile
```bash
cd haiphen-mobile
npm install
npx expo start       # Expo dev server
```

### Static docs site
```bash
npm start            # live-server on docs/
```

## Architecture Details

### Worker Routing Pattern
All workers use **raw `fetch()` handlers with manual URL pathname matching** — no routing libraries (no itty-router, no Hono). Pattern:
```javascript
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/v1/endpoint") { ... }
  }
};
```
Entry point filenames vary: `src/index.ts` (api, checkout), `src/index.js` (auth), `src/worker.ts` (contact), `src/orchestrator.js`, `src/edge-crawler.js`. Durable Object classes are exported alongside the default handler.

### Wrangler Config
- Mix of `.toml` (api, contact, checkout, orchestrator) and `.jsonc` (auth, crawler) formats
- All use `compatibility_date: "2025-07-16"`
- Routes are domain-pattern based (e.g., `api.haiphen.io/*`)
- KV namespace IDs are shared across workers (e.g., `REVOKE_KV` ID `7ef6277b...` appears in api, auth, checkout)

### Scaffold Services (secure, network, graph, risk, causal, supply)
All 6 follow the same pattern: `src/index.ts` entry point, D1 binding to shared database, quota checks via HTTP to `api.haiphen.io/v1/internal/quota/consume` with `INTERNAL_TOKEN`. Routes are currently commented out in wrangler configs (not yet live). Migrations: 0019–0024.

### Watchdog & GCP Failover
`haiphen-watchdog` polls the CF GraphQL Analytics API hourly for worker requests, D1, KV, and DO usage. Thresholds: 60% WARNING, 80% FAILOVER, 90% CRITICAL. Failover deletes the CF worker route and creates a DNS CNAME to the GCP endpoint. `haiphen-gcp/` contains Firestore-based D1/KV drop-in adapters and a Cloud Function for daily D1→Firestore sync.

### Authentication Flow
Auth uses GitHub/Google OAuth → JWT stored in cookies scoped to `*.haiphen.io`. The `haiphen-auth` worker handles `/login`, `/callback`, `/callback/google`, `/logout`, `/me`, `/entitlement`, and `/checkout` routes. Google OAuth uses `?provider=google` and state carries `JSON.stringify({to, provider})`. JWTs are verified across all workers using a shared `JWT_SECRET`. Revoked tokens are tracked in `REVOKE_KV` with key pattern `revoke:<jti>`. Revocation is **fail-closed**: missing jti or REVOKE_KV binding causes rejection.

### API Key System
API keys are hashed with a pepper (`API_KEY_PEPPER`) and stored in D1. Keys have scopes (`metrics:read`, `rss:read`, `webhooks:write`) and are tied to user plans. Revoked keys use `REVOKE_KV` with key pattern `revoked:<key_hash>`.

### Rate Limiting
Implemented via `RateLimiterDO` (Durable Object) with sliding window. Limits by plan tier: free (60/min), pro (600/min), enterprise (6000/min).

### Payments
Stripe checkout sessions with webhook deduplication (via `stripe_webhook_events` table). Successful payments update `ENTITLE_KV` and broadcast via `StatusDO` WebSocket.

### Shared Infrastructure
- **D1 Database**: Single shared instance (`9a26fb67-...`) across API, auth, checkout workers
- **KV Namespaces**: `REVOKE_KV` (token/key revocation + plan cache), `ENTITLE_KV` (payment status), `CACHE_KV` (metrics), `CRAWL_KV`, `STATE_KV`
- **Durable Objects**: `RateLimiterDO` (API), `QuotaDO` (API), `StatusDO` (checkout), `TicketQueue` (contact), `WorkQueueDO` (orchestrator)

### CORS
All workers validate origin against allowed list: `haiphen.io`, `www.haiphen.io`, `app.haiphen.io`, `auth.haiphen.io`, plus `localhost` variants for dev.

### Cron Triggers
- Crawler: every 30 minutes
- Orchestrator: weekdays at 1pm UTC
- Contact (digest emails): weekdays at 1pm UTC
- Watchdog: hourly (`0 * * * *`) usage check + weekdays 8am UTC (`0 8 * * 1-5`) daily digest

### D1 Migrations
Located in `d1/migrations/`. Naming convention: `####_description.sql` (4-digit sequential prefix). Latest: `0024_supply_tables.sql`. Test locally before applying to remote. Update `d1/schema-snapshot.sql` after applying.

### Frontend (docs/) Architecture
The `docs/` site is a **static SPA with no build system** — no bundler, no transpilation. All files are served as-is.

- **Routing**: Section-based SPA via `showSection()` function defined inline in `index.html`
- **Global namespace**: `window.HAIPHEN` initialized in `index.html`; all components register on it
- **Component pattern**: Each component is a directory under `docs/components/` containing `.js`, `.html` (template), and `.css` files. Components use an IIFE pattern, fetch their own HTML template via `fetch()`, and inject into a mount point:
  ```javascript
  (function () {
    const NS = (window.HAIPHEN = window.HAIPHEN || {});
    NS.loadMyComponent = async function(mountSelector) {
      const mount = document.querySelector(mountSelector);
      const resp = await fetch('components/my-component/my-component.html');
      mount.innerHTML = await resp.text();
      // init logic
    };
  })();
  ```
- **CSS**: `assets/base.css` for shared styles + per-component CSS files
- **Script loading**: All component scripts loaded via `<script>` tags in `index.html` `<head>` (synchronous, no modules)
- **CAPTCHA**: Cloudflare Turnstile integration on forms

### Dual-Lens System (Tech / Finance)
The site has a lens toggle (`docs/components/lens-toggle/`) driven by `html[data-lens="finance"]` attribute + `localStorage` key `haiphen.lens`. Custom event `haiphen:lens` with `detail.lens` = "tech" | "finance". Public API: `window.HAIPHEN.lens.get()`, `.set()`, `.toggle()`. Many components listen for this event and swap content/theme accordingly (mission, hero, sidebar labels, API docs). Finance lens applies dark theme overrides across base.css, site-header.css, mission.css, and chatbot.css.

### Mission / Services Architecture
`docs/components/mission/mission.js` contains a `SERVICES` array (7 entries: 1 platform + 6 individual) with tech/finance content variants. The mission page has a 5-tab content system (Intro, Use Cases, Installation, Integration, Subscribe) rendered data-driven from the SERVICES array. Hash routing: `#mission:svc-risk:installation`. A vertical catalogue sidebar allows service switching. The mission page fetches `services.json` at load and merges pricing/features/trial data.

### Content & Messaging
Source-of-truth documents for content/branding: `Haiphen.pptx` (investor deck) and `Haiphen_Updated_Service_Agreement.docx` (service terms). See `ROADMAP.md` for planned features and phase status.

### SVG Design System
- Mission SVGs: 360×240 viewBox, dark gradient background (#0b1220→#0f1b2e), dot grid pattern
- Cohort hero SVG: 420×260 viewBox, light theme with gradient card fills
- Palette: `#5A9BD4` (blue), `#10B981` (teal), `#8B5CF6` (purple), `#F59E0B` (amber), `#e2e8f0` (text)
- Shared techniques: gradient fills, glow filters, dot-grid patterns, monospace labels, subtle animations

### CLI Architecture (Go)
Uses Cobra framework. Internal packages: `auth` (OAuth flow), `config` (profile management), `server` (HTTP proxy gateway), `store` (encrypted disk token storage), `entitlement` (plan checks), `ratelimit` (local rate limiting). Supports `--profile` for multi-account switching.

### Error Formats
Not yet standardized. `haiphen-api` uses `{ "error": { "code": "string", "message": "string" } }`. Other workers use `{ "ok": false, "error": "message" }`. New endpoints should follow the API format per `ROADMAP.md`.
