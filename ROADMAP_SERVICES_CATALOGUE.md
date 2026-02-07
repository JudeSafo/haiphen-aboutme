# Haiphen Feature Roadmap

> **For Claude Code**: Be aware of all planned features when making architectural decisions,
> but only implement what is explicitly requested in each session. Design for extensibility.
> 
> **Multi-Agent Mode**: This roadmap is designed for delegation to Claude Opus subagents.
> Each service in the catalogue can be assigned to a dedicated agent with scoped permissions.

---

## Table of Contents

1. [Context Documents](#context-documents)
2. [Phase 1: Security & Code Hygiene](#phase-1-security--code-hygiene) ✅
3. [Phase 2: Content & Messaging Refresh](#phase-2-content--messaging-refresh) ← CURRENT
4. [Phase 3: Services Catalogue Expansion](#phase-3-services-catalogue-expansion) ← NEW
5. [Phase 4: User Preferences Backend](#phase-4-user-preferences-backend)
6. [Multi-Agent Configuration](#multi-agent-configuration)
7. [Stripe Integration Patterns](#stripe-integration-patterns)
8. [Checkpointing & Rollback](#checkpointing--rollback)
9. [Architectural Guidelines](#architectural-guidelines)

---

## Context Documents

| File | Purpose |
|------|---------|
| `Haiphen.pptx` | Investor/client deck with messaging, figures, diagrams, value props |
| `Haiphen_Updated_Service_Agreement.docx` | Service terms, cohort program details, deliverables |
| `CLAUDE.md` | Codebase context for Claude Code |

**Environment Variables Required:**
```bash
STRIPE_SECRET_KEY       # Stripe API key (exported to env)
STRIPE_WEBHOOK_SECRET   # For webhook verification
SENDGRID_API_KEY        # Email delivery
GITHUB_CLIENT_ID        # OAuth
GITHUB_CLIENT_SECRET    # OAuth
```

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

**Goal**: Align website content with professional positioning.

### 2A: Subscription Preferences in #profile
- [ ] Add "Email Preferences" section to logged-in user profile
- [ ] Allow users to toggle subscription categories
- [ ] Update `haiphen-contact/src/worker.ts` cron job to respect preferences
- [ ] API endpoint: `PUT /v1/preferences/subscriptions`

### 2B: Cohort Screening Section Redesign
- [ ] Transform into comprehensive standalone shareable section
- [ ] Professional hero, timeline diagram, benefits grid, FAQ, CTA

### 2C: Mission Section Refresh
- [ ] Update with fintech/trading infrastructure positioning
- [ ] Include relevant figures/diagrams from pptx

---

## Phase 3: Services Catalogue Expansion ← NEW (MULTI-AGENT)

**Goal**: Transform the `#services` section into a comprehensive product catalogue with:
- Grid display of all services (available + coming soon)
- Stripe payment integration via haiphen-checkout
- Free trial mechanism (N requests before paywall)
- ToS acceptance flow before payment

### Services Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         docs/#services                                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │ haiphen-cli │ │   webapp    │ │ mobile app  │ │ desktop app │       │
│  │  [featured] │ │             │ │             │ │             │       │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘       │
│         │               │               │               │               │
│  ┌──────┴───────────────┴───────────────┴───────────────┴──────┐       │
│  │                    haiphen-checkout                          │       │
│  │  1. Auth check → 2. Free trial check → 3. ToS → 4. Stripe   │       │
│  └──────────────────────────────────────────────────────────────┘       │
│         │                                                               │
│  ┌──────┴──────┐                                                       │
│  │   Stripe    │  Payment Links / Checkout Sessions                    │
│  └─────────────┘                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 3.1 Service Definitions

#### 🎯 KEY FOCUS (Featured)

##### haiphen-cli
> **The Magnum Opus** — Command center for all Haiphen services

| Attribute | Value |
|-----------|-------|
| **Status** | Active Development |
| **Pricing** | Free tier (100 req/day) → Pro $29/mo → Enterprise $99/mo |
| **Stripe Product ID** | `prod_haiphen_cli` (create via API) |
| **Trial** | 100 API requests |
| **Location** | `haiphen-cli/` (Go 1.22 + Cobra) |

**Features:**
- [ ] Telemetry dashboard in terminal
- [ ] Data ingestion feed management
- [ ] Data manipulation & transformation
- [ ] Command and control for all services
- [ ] Multi-profile support
- [ ] Background sync with cloud

**Implementation Notes:**
```bash
# Agent assignment: AGENT_CLI
# Permissions: Read/Write haiphen-cli/**, Bash(go:*), Bash(make:*)
# Dependencies: None (standalone Go binary)
```

---

#### 💰 FINTECH SERVICES

##### webapp
> Full interactive trading dashboard

| Attribute | Value |
|-----------|-------|
| **Status** | MVP (trades-overlay preview exists) |
| **Pricing** | Free preview → Pro $19/mo |
| **Stripe Product ID** | `prod_haiphen_webapp` |
| **Trial** | 7 days full access |
| **Location** | `docs/` + new `haiphen-webapp/` worker |

**Features:**
- [ ] Full trades-overlay with real data
- [ ] Historical chart navigation
- [ ] Portfolio analytics
- [ ] Export to CSV/PDF
- [ ] Real-time WebSocket updates

**Implementation Notes:**
```bash
# Agent assignment: AGENT_WEBAPP
# Permissions: Read/Write docs/**, haiphen-api/**
# Dependencies: haiphen-api, D1 metrics tables
```

---

##### daily-newsletter
> Automated daily digest of trading activity

| Attribute | Value |
|-----------|-------|
| **Status** | Exists (haiphen-contact cron) |
| **Pricing** | Free (with account) |
| **Stripe Product ID** | N/A (free tier) |
| **Trial** | N/A |
| **Location** | `haiphen-contact/src/worker.ts` |

**Features:**
- [ ] Daily email at configurable time
- [ ] Personalized KPI highlights
- [ ] Link to full webapp dashboard
- [ ] Unsubscribe management
- [ ] HTML + plain text versions

**Implementation Notes:**
```bash
# Agent assignment: AGENT_EMAIL
# Permissions: Read/Write haiphen-contact/**
# Dependencies: SendGrid API, D1 email_list_subscribers
```

---

##### mobile-app
> iOS & Android app with push notifications

| Attribute | Value |
|-----------|-------|
| **Status** | Not Started |
| **Pricing** | Free download → In-app Pro $9.99/mo |
| **Stripe Product ID** | `prod_haiphen_mobile` |
| **Trial** | 14 days Pro features |
| **Location** | NEW `haiphen-mobile/` (React Native or Tauri Mobile) |

**Features:**
- [ ] Interactive charts (trades-overlay port)
- [ ] Push notifications for:
  - Daily digest
  - Trade alerts
  - Webhook events
- [ ] Biometric authentication
- [ ] Offline mode with sync

**Implementation Notes:**
```bash
# Agent assignment: AGENT_MOBILE
# Permissions: Create haiphen-mobile/**, Read haiphen-api/**
# Dependencies: Firebase (FCM), Apple Push (APNs)
# Tech decision needed: React Native vs Tauri Mobile vs Expo
```

---

##### desktop-app
> Cross-platform desktop application

| Attribute | Value |
|-----------|-------|
| **Status** | Boilerplate exists (haiphen-desktop) |
| **Pricing** | Free → Pro $14.99/mo |
| **Stripe Product ID** | `prod_haiphen_desktop` |
| **Trial** | 30 days Pro features |
| **Location** | `haiphen-desktop/` (React 18 + Tauri 2.7) |

**Features:**
- [ ] All mobile app features
- [ ] System tray notifications
- [ ] Keyboard shortcuts
- [ ] Multi-window support
- [ ] Local data caching
- [ ] Auto-updates

**Implementation Notes:**
```bash
# Agent assignment: AGENT_DESKTOP
# Permissions: Read/Write haiphen-desktop/**
# Dependencies: Tauri 2.7, React 18, MUI 5
```

---

##### slackbot-discord
> Webhook notifications for Slack & Discord

| Attribute | Value |
|-----------|-------|
| **Status** | Not Started |
| **Pricing** | Free (with Pro subscription to any service) |
| **Stripe Product ID** | N/A (bundled) |
| **Trial** | N/A |
| **Location** | NEW `haiphen-integrations/` worker |

**Features:**
- [ ] Slack app with slash commands
- [ ] Discord bot with commands
- [ ] Webhook event forwarding
- [ ] Customizable alert thresholds
- [ ] Channel/DM routing

**Implementation Notes:**
```bash
# Agent assignment: AGENT_INTEGRATIONS
# Permissions: Create haiphen-integrations/**
# Dependencies: Slack API, Discord API, haiphen-api webhooks
```

---

#### 🔧 TECH SERVICES

##### haiphen-secure
> Network security monitoring & agent creep detection

| Attribute | Value |
|-----------|-------|
| **Status** | Not Started |
| **Pricing** | $39/mo |
| **Stripe Product ID** | `prod_haiphen_secure` |
| **Trial** | 50 scans |
| **Location** | NEW `haiphen-secure/` worker + CLI extension |

**Features:**
- [ ] nslookup integration
- [ ] Network trace analysis
- [ ] Packet inspection (via CLI)
- [ ] Agent activity monitoring
- [ ] Unintended network creep alerts
- [ ] Compliance reporting

**Implementation Notes:**
```bash
# Agent assignment: AGENT_SECURITY
# Permissions: Create haiphen-secure/**, Bash(nslookup:*), Bash(traceroute:*)
# Dependencies: OS-level network tools, haiphen-cli
# Security: Sandboxed execution required
```

---

##### network-trace
> WiFi signal optimization & network diagnostics

| Attribute | Value |
|-----------|-------|
| **Status** | Not Started |
| **Pricing** | $9.99/mo |
| **Stripe Product ID** | `prod_network_trace` |
| **Trial** | 10 scans |
| **Location** | NEW `haiphen-network/` + desktop app integration |

**Features:**
- [ ] Signal strength mapping
- [ ] Optimal router placement suggestions
- [ ] Interference detection
- [ ] Speed test integration
- [ ] Historical tracking

**Implementation Notes:**
```bash
# Agent assignment: AGENT_NETWORK
# Permissions: Create haiphen-network/**
# Dependencies: haiphen-desktop (for local scanning)
```

---

##### knowledge-graph
> Commercial ontological database

| Attribute | Value |
|-----------|-------|
| **Status** | Not Started |
| **Pricing** | $99/mo (Enterprise) |
| **Stripe Product ID** | `prod_knowledge_graph` |
| **Trial** | 1000 entities |
| **Location** | NEW `haiphen-graph/` + PostgreSQL |

**Features:**
- [ ] Dynamic ontology management
- [ ] Real-time entity relationships
- [ ] Self-pruning stale data
- [ ] GraphQL API
- [ ] Visualization dashboard
- [ ] Import/export (RDF, JSON-LD)

**Implementation Notes:**
```bash
# Agent assignment: AGENT_GRAPH
# Permissions: Create haiphen-graph/**
# Dependencies: PostgreSQL (Neon/Supabase), GraphQL
# Infrastructure: Separate from D1 (needs full Postgres)
```

---

##### risk-analysis
> Actuarial confidence assessments

| Attribute | Value |
|-----------|-------|
| **Status** | Not Started |
| **Pricing** | $49/mo |
| **Stripe Product ID** | `prod_risk_analysis` |
| **Trial** | 25 assessments |
| **Location** | NEW `haiphen-risk/` worker |

**Features:**
- [ ] Decision confidence scoring
- [ ] Baseline actuarial distributions
- [ ] Custom risk model creation
- [ ] Historical accuracy tracking
- [ ] API for programmatic access
- [ ] PDF report generation

**Implementation Notes:**
```bash
# Agent assignment: AGENT_RISK
# Permissions: Create haiphen-risk/**
# Dependencies: Statistical libraries (Python microservice or WASM)
# Math: Beta distributions, Monte Carlo, Bayesian inference
```

---

##### causal-chain
> Decision tree navigation & visualization

| Attribute | Value |
|-----------|-------|
| **Status** | Not Started |
| **Pricing** | $29/mo |
| **Stripe Product ID** | `prod_causal_chain` |
| **Trial** | 10 chain analyses |
| **Location** | NEW `haiphen-causal/` worker |

**Features:**
- [ ] Long-tail decision tree modeling
- [ ] Contributing factor identification
- [ ] Visual tree/graph rendering
- [ ] Pruning suggestions
- [ ] What-if scenario analysis
- [ ] Export to various formats

**Implementation Notes:**
```bash
# Agent assignment: AGENT_CAUSAL
# Permissions: Create haiphen-causal/**
# Dependencies: D3.js or similar for visualization
```

---

##### supply-chain
> SDLC asset tracking & dependency risk

| Attribute | Value |
|-----------|-------|
| **Status** | Not Started |
| **Pricing** | $79/mo |
| **Stripe Product ID** | `prod_supply_chain` |
| **Trial** | 5 asset analyses |
| **Location** | NEW `haiphen-supply/` worker |

**Features:**
- [ ] Asset lifecycle tracking
- [ ] Dependency graph analysis
- [ ] Downstream risk propagation
- [ ] SBOM (Software Bill of Materials) generation
- [ ] Vulnerability correlation
- [ ] Compliance reporting (SOC2, etc.)

**Implementation Notes:**
```bash
# Agent assignment: AGENT_SUPPLY
# Permissions: Create haiphen-supply/**
# Dependencies: GitHub API (for repo analysis), NPM/PyPI APIs
```

---

### 3.2 Services Grid UI Requirements

**Location**: `docs/components/services/` (update existing)

**Layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│                    🎯 FEATURED SERVICE                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     haiphen-cli                            │  │
│  │  [Large hero card with CLI screenshot/animation]          │  │
│  │  "Command Center for Edge Intelligence"                   │  │
│  │  [Get Started - Free] [View Pricing]                      │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                    💰 FINTECH                                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │ webapp  │ │newsletter│ │ mobile  │ │ desktop │ │slack/dc │  │
│  │ $19/mo  │ │  FREE   │ │ $9.99/mo│ │$14.99/mo│ │ bundled │  │
│  │[Preview]│ │[Sign Up]│ │[Soon]   │ │[Download│ │ [Soon]  │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                    🔧 TECH                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │ secure  │ │ network │ │knowledge│ │  risk   │ │ causal  │  │
│  │ $39/mo  │ │ $9.99/mo│ │ $99/mo  │ │ $49/mo  │ │ $29/mo  │  │
│  │ [Soon]  │ │ [Soon]  │ │ [Soon]  │ │ [Soon]  │ │ [Soon]  │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
│  ┌─────────┐                                                    │
│  │ supply  │                                                    │
│  │ $79/mo  │                                                    │
│  │ [Soon]  │                                                    │
│  └─────────┘                                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Card States**:
- **Available**: Full color, active CTA buttons
- **Coming Soon**: Grayscale/muted, "Notify Me" button
- **Free**: Green accent, "Sign Up" button
- **Trial Available**: Badge showing "X days/requests free"

**Assets Needed** (per service):
- [ ] Icon/logo (SVG, 64x64)
- [ ] Preview image or screenshot (PNG, 800x600)
- [ ] Short description (1-2 sentences)
- [ ] Feature list (3-5 bullets)

---

### 3.3 Stripe Integration Requirements

**Products to Create via Stripe API**:

```javascript
// Run this script to create all Stripe products
// Location: scripts/stripe-setup.js

const products = [
  { id: 'prod_haiphen_cli', name: 'Haiphen CLI', prices: [
    { amount: 0, interval: null, lookup_key: 'cli_free' },
    { amount: 2900, interval: 'month', lookup_key: 'cli_pro' },
    { amount: 9900, interval: 'month', lookup_key: 'cli_enterprise' }
  ]},
  { id: 'prod_haiphen_webapp', name: 'Haiphen WebApp', prices: [
    { amount: 1900, interval: 'month', lookup_key: 'webapp_pro' }
  ]},
  { id: 'prod_haiphen_mobile', name: 'Haiphen Mobile', prices: [
    { amount: 999, interval: 'month', lookup_key: 'mobile_pro' }
  ]},
  { id: 'prod_haiphen_desktop', name: 'Haiphen Desktop', prices: [
    { amount: 1499, interval: 'month', lookup_key: 'desktop_pro' }
  ]},
  { id: 'prod_haiphen_secure', name: 'Haiphen Secure', prices: [
    { amount: 3900, interval: 'month', lookup_key: 'secure_pro' }
  ]},
  { id: 'prod_network_trace', name: 'Network Trace', prices: [
    { amount: 999, interval: 'month', lookup_key: 'network_pro' }
  ]},
  { id: 'prod_knowledge_graph', name: 'Knowledge Graph', prices: [
    { amount: 9900, interval: 'month', lookup_key: 'graph_enterprise' }
  ]},
  { id: 'prod_risk_analysis', name: 'Risk Analysis', prices: [
    { amount: 4900, interval: 'month', lookup_key: 'risk_pro' }
  ]},
  { id: 'prod_causal_chain', name: 'Causal Chain', prices: [
    { amount: 2900, interval: 'month', lookup_key: 'causal_pro' }
  ]},
  { id: 'prod_supply_chain', name: 'Supply Chain Intel', prices: [
    { amount: 7900, interval: 'month', lookup_key: 'supply_pro' }
  ]}
];
```

**Checkout Flow** (update `haiphen-checkout`):

```
User clicks "Subscribe" on service card
         │
         ▼
┌─────────────────────┐
│ 1. Auth Check       │ → Not logged in? → Redirect to /login
└─────────┬───────────┘
         │
         ▼
┌─────────────────────┐
│ 2. Free Trial Check │ → Trial available? → Grant trial, skip payment
└─────────┬───────────┘
         │
         ▼
┌─────────────────────┐
│ 3. ToS Acceptance   │ → Not accepted? → Show ToS modal
└─────────┬───────────┘
         │
         ▼
┌─────────────────────┐
│ 4. Stripe Checkout  │ → Create session with product/price
└─────────┬───────────┘
         │
         ▼
┌─────────────────────┐
│ 5. Webhook Handler  │ → Update entitlements in D1
└─────────────────────┘
```

**D1 Schema Updates Needed**:

```sql
-- Migration: 0014_service_subscriptions.sql
-- (Next after existing 0013_onboarding_confirmations.sql)

CREATE TABLE IF NOT EXISTS service_subscriptions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_login TEXT NOT NULL,
  service_id TEXT NOT NULL,  -- e.g., 'haiphen_cli', 'webapp', etc.
  stripe_subscription_id TEXT,
  status TEXT DEFAULT 'trialing', -- trialing, active, canceled, past_due
  trial_requests_used INTEGER DEFAULT 0,
  trial_requests_limit INTEGER DEFAULT 0,
  current_period_start TEXT,
  current_period_end TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_login, service_id)
);

CREATE INDEX idx_service_subs_user ON service_subscriptions(user_login);
CREATE INDEX idx_service_subs_status ON service_subscriptions(status);
```

---

## Multi-Agent Configuration

### Claude Code Subagent Setup

As of Claude Code v2.1+, you can spawn subagents for parallel work. Here's how to configure for this project:

#### 1. Enable Multi-Agent Mode

```bash
# In your Claude Code session
/config

# Set these options:
# - Enable subagents: Yes
# - Max concurrent agents: 4 (recommended for M2 MacBook)
# - Agent timeout: 30 minutes
```

#### 2. Create Agent Assignments File

Create `.claude/agents.json` in your project root:

```json
{
  "agents": {
    "AGENT_CLI": {
      "scope": ["haiphen-cli/**"],
      "permissions": {
        "allow": ["Read(./**)", "Edit(haiphen-cli/**)", "Bash(go:*)", "Bash(make:*)"],
        "deny": ["Edit(haiphen-api/**)", "Bash(rm -rf:*)"]
      },
      "model": "opus",
      "description": "CLI development and Go code"
    },
    "AGENT_WEBAPP": {
      "scope": ["docs/**", "haiphen-api/**"],
      "permissions": {
        "allow": ["Read(./**)", "Edit(docs/**)", "Edit(haiphen-api/**)"],
        "deny": ["Bash(rm -rf:*)"]
      },
      "model": "opus",
      "description": "Frontend and API development"
    },
    "AGENT_MOBILE": {
      "scope": ["haiphen-mobile/**"],
      "permissions": {
        "allow": ["Read(./**)", "Edit(haiphen-mobile/**)", "Bash(npm:*)", "Bash(npx:*)"],
        "deny": ["Bash(rm -rf:*)"]
      },
      "model": "opus",
      "description": "Mobile app development"
    },
    "AGENT_DESKTOP": {
      "scope": ["haiphen-desktop/**"],
      "permissions": {
        "allow": ["Read(./**)", "Edit(haiphen-desktop/**)", "Bash(npm:*)", "Bash(cargo:*)"],
        "deny": ["Bash(rm -rf:*)"]
      },
      "model": "opus",
      "description": "Desktop app development"
    },
    "AGENT_STRIPE": {
      "scope": ["scripts/stripe-*", "haiphen-checkout/**"],
      "permissions": {
        "allow": ["Read(./**)", "Edit(scripts/stripe-*)", "Edit(haiphen-checkout/**)"],
        "deny": ["Bash(rm -rf:*)"]
      },
      "model": "sonnet",
      "description": "Stripe integration and payment flows"
    },
    "AGENT_NEW_SERVICES": {
      "scope": ["haiphen-secure/**", "haiphen-network/**", "haiphen-graph/**", 
                "haiphen-risk/**", "haiphen-causal/**", "haiphen-supply/**"],
      "permissions": {
        "allow": ["Read(./**)", "Bash(mkdir:*)", "Bash(npm init:*)"],
        "deny": ["Bash(rm -rf:*)"]
      },
      "model": "opus",
      "description": "New service scaffolding"
    }
  },
  "orchestrator": {
    "model": "opus",
    "checkpointInterval": "15m",
    "rollbackOnFailure": true
  }
}
```

#### 3. Start Multi-Agent Session

```bash
cd /Users/jks142857/Desktop/haiphen-aboutme

# Start Claude Code with multi-agent enabled
claude --multi-agent

# Or in an existing session:
/agents enable
```

#### 4. Delegate Tasks to Agents

In your Claude Code session:

```
@AGENT_CLI Build the telemetry dashboard feature in haiphen-cli. 
Requirements:
- New command: `haiphen telemetry`
- Show real-time metrics from haiphen-api
- Use termui for terminal UI
- Add to existing Cobra command structure

@AGENT_WEBAPP Update the services grid in docs/components/services/ with the new catalogue layout.
Requirements:
- Grid of service cards (see ROADMAP.md section 3.2)
- Card states: available, coming soon, free, trial
- Connect CTA buttons to haiphen-checkout flow

@AGENT_STRIPE Create Stripe products and prices for all services.
Requirements:
- Script at scripts/stripe-setup.js
- Use STRIPE_SECRET_KEY from environment
- Create products per ROADMAP.md section 3.3
```

#### 5. Monitor Agent Progress

```
/agents status          # See all agent statuses
/agents logs AGENT_CLI  # View specific agent logs
/agents pause AGENT_CLI # Pause an agent
/agents resume AGENT_CLI
/agents cancel AGENT_CLI
```

---

## Stripe Integration Patterns

### Environment Setup

```bash
# Add to your shell profile or .env
export STRIPE_SECRET_KEY="sk_live_..." # or sk_test_... for testing
export STRIPE_WEBHOOK_SECRET="whsec_..."

# Verify Stripe CLI is installed
brew install stripe/stripe-cli/stripe
stripe login
```

### Create Products Script

Create `scripts/stripe-setup.js`:

```javascript
#!/usr/bin/env node
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const SERVICES = [
  {
    name: 'Haiphen CLI',
    id: 'haiphen_cli',
    description: 'Command center for edge intelligence',
    prices: [
      { nickname: 'Free', unit_amount: 0, recurring: null },
      { nickname: 'Pro', unit_amount: 2900, recurring: { interval: 'month' } },
      { nickname: 'Enterprise', unit_amount: 9900, recurring: { interval: 'month' } }
    ],
    metadata: { trial_requests: '100', category: 'featured' }
  },
  // ... add all other services
];

async function createProducts() {
  for (const service of SERVICES) {
    console.log(`Creating product: ${service.name}`);
    
    const product = await stripe.products.create({
      name: service.name,
      description: service.description,
      metadata: { service_id: service.id, ...service.metadata }
    });
    
    for (const priceData of service.prices) {
      const price = await stripe.prices.create({
        product: product.id,
        currency: 'usd',
        unit_amount: priceData.unit_amount,
        nickname: priceData.nickname,
        recurring: priceData.recurring,
        lookup_key: `${service.id}_${priceData.nickname.toLowerCase()}`,
        metadata: { service_id: service.id }
      });
      console.log(`  Created price: ${price.lookup_key}`);
    }
  }
}

createProducts().catch(console.error);
```

### Checkout Flow Update

Update `haiphen-checkout/src/index.ts` with service-aware checkout:

```typescript
// Add to existing checkout handler
async function createServiceCheckout(
  env: Env,
  userLogin: string,
  serviceId: string,
  priceLookupKey: string
): Promise<Response> {
  // 1. Check if user already has active subscription
  const existing = await env.DB.prepare(
    `SELECT * FROM service_subscriptions 
     WHERE user_login = ? AND service_id = ? AND status IN ('active', 'trialing')`
  ).bind(userLogin, serviceId).first();
  
  if (existing) {
    return new Response(JSON.stringify({ 
      error: 'Already subscribed to this service' 
    }), { status: 400 });
  }
  
  // 2. Check trial eligibility
  const trialUsed = await env.DB.prepare(
    `SELECT * FROM service_subscriptions 
     WHERE user_login = ? AND service_id = ?`
  ).bind(userLogin, serviceId).first();
  
  // 3. Create Stripe checkout session
  const session = await stripe.checkout.sessions.create({
    customer_email: userEmail,
    line_items: [{
      price: priceLookupKey,
      quantity: 1
    }],
    mode: 'subscription',
    success_url: `${env.APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.APP_URL}/checkout/cancel`,
    subscription_data: {
      trial_period_days: trialUsed ? 0 : 14,
      metadata: { service_id: serviceId, user_login: userLogin }
    },
    metadata: { service_id: serviceId, user_login: userLogin }
  });
  
  return Response.redirect(session.url, 303);
}
```

---

## Checkpointing & Rollback

### Git-Based Checkpoints

Before each major multi-agent task:

```bash
# Create checkpoint branch
git checkout -b checkpoint/phase3-services-$(date +%Y%m%d-%H%M)
git add -A
git commit -m "Checkpoint before Phase 3 services expansion"
git checkout main
```

### Automatic Checkpoints in Claude Code

Add to `.claude/settings.json`:

```json
{
  "checkpoints": {
    "enabled": true,
    "interval": "15m",
    "maxCheckpoints": 10,
    "location": ".claude/checkpoints/"
  }
}
```

### Rollback Commands

```bash
# List checkpoints
ls -la .claude/checkpoints/

# View what changed since checkpoint
git diff checkpoint/phase3-services-20250205-1430

# Full rollback to checkpoint
git reset --hard checkpoint/phase3-services-20250205-1430

# Partial rollback (specific files)
git checkout checkpoint/phase3-services-20250205-1430 -- haiphen-api/

# Rollback uncommitted changes only
git checkout .
```

### Multi-Agent Rollback

If an agent goes wrong:

```
/agents rollback AGENT_CLI    # Rollback specific agent's changes
/agents rollback --all        # Rollback all agent changes since session start
```

---

## Architectural Guidelines

### Content & Messaging
- **Source of truth**: `Haiphen.pptx` and `Haiphen_Updated_Service_Agreement.docx`
- **Tone**: Professional, enterprise-grade, fintech-focused
- **Themes**: Edge computing, semantic protocols, trading infrastructure

### Service Development Pattern

Each new service should follow:

```
haiphen-{service}/
├── src/
│   └── index.ts          # Worker entry point
├── wrangler.toml         # Cloudflare config
├── package.json
├── tsconfig.json
├── README.md             # Service documentation
└── tests/
    └── index.test.ts
```

### API Design
- All endpoints under `/v1/` prefix
- Consistent error format: `{ "error": { "code": "string", "message": "string" } }`
- Rate limiting on all public endpoints
- Service-specific rate limits in `service_subscriptions` table

### Frontend Components
- Follow existing pattern in `docs/components/`
- Each component: folder with `.html`, `.js`, `.css`
- Service cards should be data-driven (from config, not hardcoded)

### Database Migrations
- Sequential numbering: `NNNN_description.sql`
- Test locally: `npx wrangler d1 execute haiphen_api --local --file=...`
- Then remote: `npx wrangler d1 execute haiphen_api --remote --file=...`
- Update `d1/schema-snapshot.sql` after applying

---

## Quick Reference

### Agent Assignment Summary

| Agent | Services | Tech Stack |
|-------|----------|------------|
| AGENT_CLI | haiphen-cli | Go, Cobra |
| AGENT_WEBAPP | webapp, trades-overlay | Vanilla JS, CSS |
| AGENT_MOBILE | mobile-app | React Native / Tauri |
| AGENT_DESKTOP | desktop-app | React, Tauri |
| AGENT_STRIPE | checkout, payments | TypeScript, Stripe API |
| AGENT_EMAIL | newsletter, notifications | TypeScript, SendGrid |
| AGENT_INTEGRATIONS | slack, discord | TypeScript, Bot APIs |
| AGENT_SECURITY | haiphen-secure | TypeScript, network tools |
| AGENT_NETWORK | network-trace | TypeScript, desktop integration |
| AGENT_GRAPH | knowledge-graph | TypeScript, PostgreSQL, GraphQL |
| AGENT_RISK | risk-analysis | Python/WASM, statistics |
| AGENT_CAUSAL | causal-chain | TypeScript, D3.js |
| AGENT_SUPPLY | supply-chain | TypeScript, GitHub API |

### Service Pricing Summary

| Service | Free Tier | Pro | Enterprise |
|---------|-----------|-----|------------|
| haiphen-cli | 100 req/day | $29/mo | $99/mo |
| webapp | Preview only | $19/mo | — |
| newsletter | ✅ | — | — |
| mobile | 14-day trial | $9.99/mo | — |
| desktop | 30-day trial | $14.99/mo | — |
| slack/discord | Bundled | — | — |
| haiphen-secure | 50 scans | $39/mo | — |
| network-trace | 10 scans | $9.99/mo | — |
| knowledge-graph | 1000 entities | — | $99/mo |
| risk-analysis | 25 assessments | $49/mo | — |
| causal-chain | 10 analyses | $29/mo | — |
| supply-chain | 5 analyses | $79/mo | — |
