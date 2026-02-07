# Phase 3: Services Catalogue Build
# Self-contained prompt for Claude Code v2.1.31+
# Copy this entire file content and paste into Claude Code session

---

## CONTEXT (Read First)

**Project**: `/Users/jks142857/Desktop/haiphen-aboutme`
**Stack**: Cloudflare Workers (TypeScript), D1 database, Vanilla JS frontend
**Current Migration**: `0013_onboarding_confirmations.sql` — next is **0014**

**Confirmed Decisions**:
- ✅ "Notify Me" buttons: Functional (collect emails to waitlist)
- ✅ Services grid: Replace existing with professional design
- ✅ Assets: Include figures, diagrams, GIFs for self-checkout
- ✅ Stripe: CLI v1.34.0 installed, `STRIPE_SECRET_KEY` exported

**Key Files**:
- `docs/components/services/` — current services UI (to be replaced)
- `haiphen-checkout/src/index.ts` — checkout worker
- `haiphen-api/src/index.ts` — main API
- `d1/migrations/` — database migrations
- `CLAUDE.md` — codebase context

---

## SERVICE CATALOGUE DEFINITIONS

### 🎯 FEATURED

| ID | Name | Status | Pricing | Trial |
|----|------|--------|---------|-------|
| `haiphen_cli` | Haiphen CLI | Active | Free / $29 Pro / $99 Enterprise | 100 requests |

### 💰 FINTECH

| ID | Name | Status | Pricing | Trial |
|----|------|--------|---------|-------|
| `haiphen_webapp` | WebApp | MVP | $19/mo | 7 days |
| `daily_newsletter` | Daily Newsletter | Active | Free | N/A |
| `haiphen_mobile` | Mobile App | Coming Soon | $9.99/mo | 14 days |
| `haiphen_desktop` | Desktop App | Boilerplate | $14.99/mo | 30 days |
| `slackbot_discord` | Slack/Discord | Coming Soon | Bundled | N/A |

### 🔧 TECH

| ID | Name | Status | Pricing | Trial |
|----|------|--------|---------|-------|
| `haiphen_secure` | Haiphen Secure | Coming Soon | $39/mo | 50 scans |
| `network_trace` | Network Trace | Coming Soon | $9.99/mo | 10 scans |
| `knowledge_graph` | Knowledge Graph | Coming Soon | $99/mo | 1000 entities |
| `risk_analysis` | Risk Analysis | Coming Soon | $49/mo | 25 assessments |
| `causal_chain` | Causal Chain | Coming Soon | $29/mo | 10 analyses |
| `supply_chain` | Supply Chain Intel | Coming Soon | $79/mo | 5 analyses |

---

## CHECKOUT FLOW

```
User clicks CTA on service card
         │
         ▼
┌─────────────────────┐
│ 1. Auth Check       │ → Not logged in? → Redirect to login
└─────────┬───────────┘
         │
         ▼
┌─────────────────────┐
│ 2. Trial Check      │ → Trial available & not exhausted? → Grant trial
└─────────┬───────────┘
         │
         ▼
┌─────────────────────┐
│ 3. ToS Acceptance   │ → Not accepted? → Show ToS modal
└─────────┬───────────┘
         │
         ▼
┌─────────────────────┐
│ 4. Stripe Checkout  │ → Create session, redirect to Stripe
└─────────┬───────────┘
         │
         ▼
┌─────────────────────┐
│ 5. Webhook Handler  │ → Update D1 entitlements
└─────────────────────┘
```

---

## TASK LIST (Execute Sequentially)

### Step 0: Verify Environment

Run these commands and show me the output:

```bash
# 1. Verify Stripe
stripe products list --limit 3

# 2. Check services component
ls -la docs/components/services/

# 3. Confirm migration sequence
ls d1/migrations/ | tail -5

# 4. Check haiphen-checkout structure
ls haiphen-checkout/src/
```

Summarize:
- How many services total (available + coming soon)?
- What's the checkout flow?
- What tables need to be created?

**STOP and confirm before proceeding.**

---

### Step 1: Database Migrations

#### 1.1 Create `d1/migrations/0014_service_subscriptions.sql`

```sql
-- Service subscription tracking with trial support
-- Migration: 0014_service_subscriptions.sql

CREATE TABLE IF NOT EXISTS service_subscriptions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_login TEXT NOT NULL,
  service_id TEXT NOT NULL,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  status TEXT DEFAULT 'trialing',  -- trialing, active, canceled, past_due, paused
  trial_requests_used INTEGER DEFAULT 0,
  trial_requests_limit INTEGER DEFAULT 0,
  trial_ends_at TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_login, service_id)
);

CREATE INDEX IF NOT EXISTS idx_service_subs_user ON service_subscriptions(user_login);
CREATE INDEX IF NOT EXISTS idx_service_subs_service ON service_subscriptions(service_id);
CREATE INDEX IF NOT EXISTS idx_service_subs_status ON service_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_service_subs_stripe ON service_subscriptions(stripe_subscription_id);
```

#### 1.2 Create `d1/migrations/0015_service_waitlist.sql`

```sql
-- Waitlist lists for "Coming Soon" services
-- Uses existing email_lists + email_list_subscribers tables
-- Migration: 0015_service_waitlist.sql

INSERT OR IGNORE INTO email_lists (list_id, name, description, status)
VALUES
  ('waitlist_haiphen_secure',   'Haiphen Secure Waitlist',      'Get notified when Haiphen Secure launches', 'active'),
  ('waitlist_network_trace',    'Network Trace Waitlist',       'Get notified when Network Trace launches',  'active'),
  ('waitlist_knowledge_graph',  'Knowledge Graph Waitlist',     'Get notified when Knowledge Graph launches','active'),
  ('waitlist_risk_analysis',    'Risk Analysis Waitlist',       'Get notified when Risk Analysis launches',  'active'),
  ('waitlist_causal_chain',     'Causal Chain Waitlist',        'Get notified when Causal Chain launches',   'active'),
  ('waitlist_supply_chain',     'Supply Chain Waitlist',        'Get notified when Supply Chain launches',   'active'),
  ('waitlist_mobile_app',       'Mobile App Waitlist',          'Get notified when Mobile App launches',     'active'),
  ('waitlist_slackbot_discord', 'Slack/Discord Bot Waitlist',   'Get notified when integrations launch',     'active');
```

**Show me both migrations. Don't apply yet.**

---

### Step 2: Stripe Products Setup

Create `scripts/stripe-setup.js`:

Requirements:
- Creates all products from the service catalogue above
- Creates prices with `lookup_key` format: `{service_id}_{tier}` (e.g., `haiphen_cli_pro`)
- Idempotent (checks if product exists before creating)
- Uses `STRIPE_SECRET_KEY` from environment

**Show me the complete script before running.**

---

### Step 3: Update haiphen-checkout

Update `haiphen-checkout/src/index.ts` with:

#### 3.1 New Types

```typescript
interface ServiceCheckoutRequest {
  service_id: string;
  price_lookup_key: string;
  return_url?: string;
}

interface WaitlistRequest {
  email: string;
  service_id: string;
}
```

#### 3.2 Service Checkout Handler

New route: `POST /v1/checkout/service`
- Requires auth
- Checks `service_subscriptions` for existing subscription
- Checks trial eligibility
- Creates Stripe checkout session with service metadata

#### 3.3 Waitlist Handler

New route: `POST /v1/waitlist`
- Accepts `{ email, service_id }`
- Validates service_id is a valid coming-soon service
- Inserts into `email_list_subscribers` with `list_id = 'waitlist_{service_id}'`
- Returns success message

#### 3.4 Webhook Updates

On `checkout.session.completed`:
- Extract `service_id` from metadata
- Create/update row in `service_subscriptions`

On `customer.subscription.updated`:
- Update `status` in `service_subscriptions`

**Show me changes incrementally: types first, then each handler.**

---

### Step 4: Services Grid UI

#### 4.1 Create `docs/assets/services.json`

```json
{
  "services": [
    {
      "id": "haiphen_cli",
      "name": "Haiphen CLI",
      "tagline": "Command Center for Edge Intelligence",
      "description": "Telemetry, data ingestion, manipulation, and command/control hub for all Haiphen services.",
      "category": "featured",
      "status": "available",
      "pricing": {
        "free": { "label": "Free", "requests": 100 },
        "pro": { "price": 29, "label": "Pro" },
        "enterprise": { "price": 99, "label": "Enterprise" }
      },
      "trial": { "type": "requests", "limit": 100 },
      "features": [
        "Real-time telemetry dashboard",
        "Data ingestion & transformation",
        "Multi-service command & control",
        "Background cloud sync"
      ],
      "cta": { "primary": "Get Started", "secondary": "View Pricing" },
      "assets": {
        "icon": "terminal",
        "preview": "cli-preview.gif"
      }
    }
    // ... include ALL 12 services with full metadata
  ]
}
```

**Show me the complete services.json with all 12 services.**

#### 4.2 Replace `docs/components/services/`

Structure:
```
docs/components/services/
├── services.html      # Grid layout with category sections
├── services.js        # Data loading, CTA handlers, waitlist submission
├── services.css       # Card styles, responsive grid, animations
└── README.md          # Component documentation
```

**Card Design**:

Available service:
```
┌─────────────────────────────────┐
│  [Icon]                  $XX/mo │
│  Service Name                   │
│  ───────────────────────────    │
│  Short description...           │
│                                 │
│  ✓ Feature one                  │
│  ✓ Feature two                  │
│  ✓ Feature three                │
│                                 │
│  [Preview Image/GIF]            │
│                                 │
│  🎁 X days/requests free trial  │
│                                 │
│  [Get Started]  [Learn More]    │
└─────────────────────────────────┘
```

Coming Soon service:
```
┌─────────────────────────────────┐
│  [Icon - muted]     COMING SOON │
│  Service Name            $XX/mo │
│  ───────────────────────────    │
│  Short description...           │
│                                 │
│  ✓ Planned feature one          │
│  ✓ Planned feature two          │
│                                 │
│  📧 Get notified when available │
│  [email input    ] [Notify Me]  │
└─────────────────────────────────┘
```

**Show me HTML first, then CSS, then JS.**

---

### Step 5: Asset Placeholders

For MVP, create placeholder assets in `docs/assets/services/`:

- Use Lucide icons for service icons (already available in project)
- Create simple SVG placeholders for previews
- Plan to replace with real screenshots/GIFs later

**Show me which icons map to which services.**

---

### Step 6: Scaffold Coming Soon Services

For each coming-soon service, create minimal directory structure:

```
haiphen-{service}/
├── src/
│   └── index.ts      # Health endpoint only
├── wrangler.toml     # Placeholder config (no D1 yet)
├── package.json
├── tsconfig.json
└── README.md         # Service description from catalogue
```

Services to scaffold:
- haiphen-secure
- haiphen-network
- haiphen-graph
- haiphen-risk
- haiphen-causal
- haiphen-supply

**Don't implement real functionality — just create structure.**

---

## COMMIT CHECKPOINTS

After each step, commit:

```bash
# After Step 1
git add d1/migrations/
git commit -m "[Phase 3.1] Add service subscriptions and waitlist migrations

- 0014_service_subscriptions.sql: subscription tracking with trial support
- 0015_service_waitlist.sql: waitlist entries for coming-soon services"

# After Step 2
git add scripts/stripe-setup.js
git commit -m "[Phase 3.2] Add Stripe products setup script

- Creates products and prices for all services
- Idempotent (safe to re-run)
- Uses lookup_keys for price references"

# After Step 3
git add haiphen-checkout/
git commit -m "[Phase 3.3] Add service-aware checkout and waitlist

- POST /v1/checkout/service: service subscription checkout
- POST /v1/waitlist: coming-soon email collection
- Webhook handler updates for service_subscriptions"

# After Step 4
git add docs/components/services/ docs/assets/
git commit -m "[Phase 3.4] Replace services grid with professional catalogue

- Data-driven grid from services.json
- Card states: available, coming-soon, free, trial
- Waitlist email collection for coming-soon services"

# After Step 6
git add haiphen-*/
git commit -m "[Phase 3.5] Scaffold coming-soon service directories

- haiphen-secure, haiphen-network, haiphen-graph
- haiphen-risk, haiphen-causal, haiphen-supply
- Health endpoints only, ready for future implementation"
```

---

## NOTES ON MULTI-AGENT

Claude Code v2.1.31 may not have multi-agent features. If `/agents` commands don't work:

1. **Work sequentially** — complete each step before moving to next
2. **You are the orchestrator** — review output, approve, then continue
3. **Use checkpoints** — commit after each step for easy rollback

To check if multi-agent is available:
```
/help
```

If you see agent-related commands, great! If not, proceed sequentially.

---

## START NOW

Begin with **Step 0: Verify Environment**.

Show me the output of the verification commands, then summarize your understanding before proceeding to Step 1.
