# Claude Code Multi-Agent Prompt: Services Catalogue Build

## Pre-Flight Checklist

Before starting, verify these are in place:

```bash
cd /Users/jks142857/Desktop/haiphen-aboutme

# 1. Verify Stripe API key is exported
echo $STRIPE_SECRET_KEY  # Should show sk_live_... or sk_test_...

# 2. Verify Stripe CLI is installed
stripe --version

# 3. Create checkpoint branch
git checkout -b feature/phase3-services-catalogue
git add -A
git commit -m "Checkpoint before Phase 3 services catalogue"

# 4. Copy updated ROADMAP
cp ~/Downloads/ROADMAP_SERVICES_CATALOGUE.md ./ROADMAP.md
git add ROADMAP.md
git commit -m "Update ROADMAP with services catalogue requirements"

# 5. Create agents config directory
mkdir -p .claude

# 6. Start Claude Code
claude
```

---

## PROMPT START ##

I'm starting Phase 3: Services Catalogue Expansion. Please read `ROADMAP.md` thoroughly — it contains:
- All service definitions with pricing, tech stack, and trial limits
- Multi-agent configuration instructions
- Stripe integration patterns
- Checkpointing and rollback procedures

**This will be a multi-agent coordinated build.** I want to do this strategically.

---

## Step 1: Setup & Verification (Do First)

Before spawning any agents, please:

1. **Verify environment**: Check that `STRIPE_SECRET_KEY` is available
2. **Review existing code**: 
   - `docs/components/services/` — current services UI
   - `haiphen-checkout/src/index.ts` — current checkout flow
   - `d1/migrations/` — latest migration number
3. **Confirm understanding**: Summarize back to me:
   - How many services are we adding?
   - What's the checkout flow (auth → trial check → ToS → Stripe)?
   - What D1 tables need to be created?

**Pause here and confirm before proceeding.**

---

## Step 2: Foundation Work (Sequential, Not Parallel)

These must be done in order by the main orchestrator (you), not delegated:

### 2.1 Create D1 Migration
Create `d1/migrations/0011_service_subscriptions.sql` with:
- `service_subscriptions` table (see ROADMAP section 3.3)
- Indexes for user_login and status

Show me the migration before creating.

### 2.2 Create Stripe Setup Script
Create `scripts/stripe-setup.js` that:
- Creates all products from ROADMAP section 3.3
- Creates prices with lookup_keys
- Is idempotent (safe to re-run)

Show me the script before running.

### 2.3 Update haiphen-checkout
Update `haiphen-checkout/src/index.ts` with:
- Service-aware checkout handler
- Trial eligibility check
- Service subscription creation on webhook

Show me the changes before applying.

**Pause here. I want to review and test before the UI work.**

---

## Step 3: Services Grid UI (Can Parallelize After Step 2)

Once Step 2 is approved and committed, update `docs/components/services/`:

### 3.1 Service Card Component
Create reusable card component with states:
- Available (full color, active buttons)
- Coming Soon (muted, "Notify Me" button)
- Free (green accent, "Sign Up")
- Trial Available (badge with trial info)

### 3.2 Grid Layout
- Featured section (haiphen-cli, large card)
- Fintech section (5 cards in row)
- Tech section (6 cards in rows)

### 3.3 Service Data File
Create `docs/assets/services.json` with all service metadata:
```json
{
  "services": [
    {
      "id": "haiphen_cli",
      "name": "Haiphen CLI",
      "category": "featured",
      "status": "available",
      "pricing": { "free": true, "pro": 29, "enterprise": 99 },
      "trial": { "type": "requests", "limit": 100 },
      "description": "Command center for edge intelligence",
      "features": ["Telemetry", "Data ingestion", "Command & control"],
      "cta": { "primary": "Get Started", "secondary": "View Pricing" }
    },
    // ... all other services
  ]
}
```

Show me each piece incrementally.

---

## Step 4: SVG Assets (Can Delegate to Agent)

For each service, we need icon assets. Options:

**Option A**: Use existing icon library (Lucide, Heroicons)
**Option B**: Generate simple SVG icons
**Option C**: Placeholder icons with plan to replace later

Which do you recommend? I'm okay with placeholders for "Coming Soon" services.

---

## Step 5: New Service Scaffolding (Parallel Agents)

Once the grid UI is working, spawn agents to scaffold new services:

```
@AGENT_NEW_SERVICES For each "Coming Soon" service in ROADMAP.md:
1. Create directory structure: haiphen-{service}/
2. Initialize with wrangler.toml (no D1 binding yet)
3. Create placeholder index.ts with health endpoint
4. Create README.md with service description from ROADMAP

Services to scaffold:
- haiphen-secure
- haiphen-network  
- haiphen-graph
- haiphen-risk
- haiphen-causal
- haiphen-supply

Don't implement functionality yet — just create the structure so the services grid can link to them.
```

---

## Checkpoints

Create git commits at these milestones:

1. After D1 migration created (not applied)
2. After Stripe script created
3. After haiphen-checkout updated
4. After services grid UI complete
5. After each new service scaffolded

Commit message format:
```
[Phase 3.X] Brief description

- Detail 1
- Detail 2
```

---

## Blockers to Anticipate

| Blocker | Mitigation |
|---------|------------|
| Stripe API key not set | Check env before starting |
| D1 migration fails | Test with --local first |
| Services grid breaks existing layout | Keep old code, build new alongside |
| Agent scope conflict | Each agent has isolated directories |
| Too many parallel agents | Limit to 4 concurrent on M2 |

---

## Questions for Me

Before proceeding, ask me:

1. Should we use test Stripe keys (sk_test_) or live keys?
2. For "Coming Soon" services, should the "Notify Me" button actually work (collect emails) or be placeholder?
3. What's the trial period for each service? (ROADMAP has defaults, but confirm)
4. Should the services grid replace the existing one entirely, or be a new section?

---

Start with Step 1 (Setup & Verification) now.

## PROMPT END ##
