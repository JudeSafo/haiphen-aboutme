# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Haiphen is a Semantic Edge Protocol Intelligence Platform — a B2B SaaS that parses industrial IoT, edge protocol, and OT traffic data, delivering normalized APIs. It runs entirely on Cloudflare Workers with D1 (SQLite), Workers KV, and Durable Objects for state.

## Repository Structure

Each `haiphen-*` directory is an independent service with its own `package.json` and wrangler config:

| Component | Language | Purpose | Route |
|-----------|----------|---------|-------|
| `haiphen-api` | TypeScript | Metrics, API keys, webhooks, RSS | `api.haiphen.io/v1/*` |
| `haiphen-auth` | JavaScript | GitHub OAuth, JWT, entitlements | `auth.haiphen.io/*` |
| `haiphen-checkout` | TypeScript | Stripe payments, ToS, WebSocket status | `checkout.haiphen.io/v1/*` |
| `haiphen-contact` | TypeScript | SendGrid email, ticket queue | `contact.haiphen.io/*` |
| `haiphen-crawler` | TypeScript | Cron-based web crawler | `crawler.haiphen.io/*` |
| `haiphen-orchestrator` | JavaScript | Task queue, Headscale VPN integration | `orchestrator.haiphen.io/*` |
| `haiphen-cli` | Go 1.22 | Local gateway + OAuth CLI (Cobra) | `localhost:8787` |
| `haiphen-desktop` | React 18 + Tauri | Cross-platform desktop app | N/A |
| `docs/` | Static HTML | Landing page and documentation site | `haiphen.io` |
| `d1/migrations/` | SQL | D1 schema migrations (12 files) | N/A |

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
npm test             # Runs vitest
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

### Static docs site
```bash
npm start            # live-server on docs/
```

## Architecture Details

### Authentication Flow
Auth uses GitHub OAuth → JWT stored in cookies scoped to `*.haiphen.io`. The `haiphen-auth` worker handles `/login`, `/callback`, `/logout`, `/me`, `/entitlement`, and `/checkout` routes. JWTs are verified across all workers using a shared `JWT_SECRET`. Revoked tokens are tracked in `REVOKE_KV`.

### API Key System
API keys are hashed with a pepper (`API_KEY_PEPPER`) and stored in D1. Keys have scopes (`metrics:read`, `rss:read`, `webhooks:write`) and are tied to user plans.

### Rate Limiting
Implemented via `RateLimiterDO` (Durable Object) with sliding window. Limits by plan tier: free (60/min), pro (600/min), enterprise (6000/min).

### Payments
Stripe checkout sessions with webhook deduplication (via `stripe_webhook_events` table). Successful payments update `ENTITLE_KV` and broadcast via `StatusDO` WebSocket.

### Shared Infrastructure
- **D1 Database**: Single shared instance (`9a26fb67-...`) across API, auth, checkout workers
- **KV Namespaces**: `REVOKE_KV` (token/key revocation + plan cache), `ENTITLE_KV` (payment status), `CACHE_KV` (metrics), `CRAWL_KV`, `STATE_KV`
- **Durable Objects**: `RateLimiterDO` (API), `StatusDO` (checkout), `TicketQueue` (contact), `WorkQueueDO` (orchestrator)

### CORS
All workers validate origin against allowed list: `haiphen.io`, `www.haiphen.io`, `app.haiphen.io`, `auth.haiphen.io`, plus `localhost` variants for dev.

### CLI Architecture (Go)
Uses Cobra framework. Internal packages: `auth` (OAuth flow), `config` (profile management), `server` (HTTP proxy gateway), `store` (encrypted disk token storage), `entitlement` (plan checks), `ratelimit` (local rate limiting). Supports `--profile` for multi-account switching.

### Cron Triggers
- Crawler: every 30 minutes
- Orchestrator: weekdays at 1pm UTC
- Contact (digest emails): weekdays at 1pm UTC
