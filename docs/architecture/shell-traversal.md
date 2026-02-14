# Interactive Shell — Traversal Tree

The `haiphen -i` interactive shell presents three guided workflows. Users navigate
from a central menu, and workflows can chain into each other on completion.

## Traversal Diagram

    ┌─────────────────────────────────────────────────────────────────────┐
    │                             MENU                                    │
    │                    Select [1] [2] [3] or [q]                        │
    └──────────┬──────────────────┬──────────────────┬────────────────────┘
               │                  │                  │
              [1]                [2]                [3]
               │                  │                  │
               ▼                  ▼                  ▼
    ╔══════════════════╗  ◇ logged_in       ◇ logged_in?
    ║   ONBOARDING     ║  ◇ + entitled?     │
    ║   (no guard)     ║  │                 │ no ──▶ "Run Onboarding?"
    ╚═══════╤══════════╝  │ no ──▶ "Run     │           │ yes ──▶ [1]
            │             │  Onboarding?"   │ yes
            ▼             │   │ yes ──▶ [1] │
    ┌───────────────┐     │                 ▼
    │ 1. Welcome    │     │ yes    ╔══════════════════════════╗
    │    (FREE)     │     │        ║  PROSPECT INTELLIGENCE   ║
    │    never skip │     │        ║  (guard: logged_in)      ║
    └───────┬───────┘     │        ╚════════════╤═════════════╝
            │             ▼                     │
    ┌───────▼───────┐  ╔══════════════════╗     ▼
    │ 2. Auth       │  ║     TRADING      ║  ┌───────────────────────┐
    │    (FREE)     │  ║  (guard: login   ║  │ 1. Credentials        │
    │    skip:      │  ║   + entitled)    ║  │    (FREE/ADMIN)       │
    │    logged_in  │  ╚═══════╤══════════╝  │    admin: set         │
    └───────┬───────┘          │             │    free: view-only    │
            │                  ▼             └───────────┬───────────┘
    ┌───────▼───────┐  ┌──────────────┐                 │
    │ 3. Status     │  │ 1. Broker    │     ┌───────────▼───────────┐
    │    (FREE)     │  │    (PRO)     │     │ 2. Browse Targets     │
    └───────┬───────┘  │    skip:     │     │    (FREE)             │
            │          │    broker_ok │     │    sector filter      │
    ┌───────▼───────┐  └──────┬───────┘     └───────────┬───────────┘
    │ 4. Platform   │         │                         │
    │    Health     │  ┌──────▼───────┐     ┌───────────▼───────────┐
    │    (FREE)     │  │ 2. Account   │     │ 3. Targeted Crawl     │
    └───────┬───────┘  │    (PRO)     │     │    (ADMIN)            │
            │          └──────┬───────┘     │    skip: role!=admin  │
    ┌───────▼───────┐         │             └───────────┬───────────┘
    │ 5. What's     │  ┌──────▼───────┐                 │
    │    Next       │  │ 3. Safety    │     ┌───────────▼───────────┐
    │    (FREE)     │  │    (PRO)     │     │ 4. View Leads         │
    │               │  │    persists  │     │    (FREE)             │
    │  choices:     │  │    to disk   │     └───────────┬───────────┘
    │  ┌──────────┐ │  └──────┬───────┘                 │
    │  │ Trading ─┼─┼──╌╌╌╌╌▶│         ┌───────────────▼───────────┐
    │  │ Prospect ┼─┼──╌╌╌╌╌╌╌╌╌╌╌╌╌╌▶│ 5. Investigate            │
    │  │ Menu     │ │  ┌──────▼───────┐ │    (PRO)                  │
    │  └──────────┘ │  │ 4. Trade     │ │    skip: plan=free        │
    └───────────────┘  │    (PRO)     │ └───────────────┬───────────┘
                       │    lg-order  │                 │
                       │    guard     │ ┌───────────────▼───────────┐
                       └──────┬───────┘ │ 6. Generate Report        │
                              │         │    (PRO)                  │
                       ┌──────▼───────┐ │    skip: plan=free        │
                       │ 5. History   │ └───────────────┬───────────┘
                       │    (PRO)     │                 │
                       │    skip:     │ ┌───────────────▼───────────┐
                       │   !broker_ok │ │ 7. Draft Outreach         │
                       └──────┬───────┘ │    (ADMIN)                │
                              │         │    skip: role!=admin      │
                       ┌──────▼───────┐ └───────────────────────────┘
                       │ 6. Watch     │
                       │    (PRO)     │
                       └──────┬───────┘     LEGEND
                              │             ═══════
                       ┌──────▼───────┐     (FREE)  = login only
                       │ 7. Signals   │     (PRO)   = paid plan
                       │    (PRO)     │     (ADMIN) = admin role
                       └──────┬───────┘     ◇       = entry guard
                              │             ╌╌╌▶    = workflow chain
                       ┌──────▼───────┐     ──▶     = sequential step
                       │ 8. Daemon    │
                       │    (PRO)     │
                       │    skip:     │
                       │   pid > 0   │
                       └──────────────┘

## Step Summary

### Onboarding (5 steps, no guard)
| # | ID | Name | Skip Condition |
|---|-----|------|----------------|
| 1 | `onboarding.welcome` | Welcome | never |
| 2 | `onboarding.auth` | Authentication | `logged_in` |
| 3 | `onboarding.status` | Account Status | never |
| 4 | `onboarding.services` | Platform Health | never |
| 5 | `onboarding.next` | What's Next | never |

### Trading (8 steps, guard: logged_in + entitled)
| # | ID | Name | Skip Condition |
|---|-----|------|----------------|
| 1 | `trading.broker` | Broker Connection | `broker_ok` |
| 2 | `trading.account` | Account Summary | never |
| 3 | `trading.safety` | Safety Config | never |
| 4 | `trading.trade` | Place a Trade | never |
| 5 | `trading.history` | Order History | `!broker_ok` |
| 6 | `trading.watch` | Live Updates | never |
| 7 | `trading.signals` | Signal Rules | never |
| 8 | `trading.daemon` | Signal Daemon | `daemon_pid > 0` |

### Prospect Intelligence (7 steps, guard: logged_in)
| # | ID | Name | Skip / Gate |
|---|-----|------|-------------|
| 1 | `prospect.credentials` | API Credentials | admin to set, free to view |
| 2 | `prospect.targets` | Browse Targets | free |
| 3 | `prospect.crawl` | Targeted Crawl | skip: `role != admin` |
| 4 | `prospect.leads` | View Leads | free |
| 5 | `prospect.investigate` | Run Investigation | skip: `plan == free` |
| 6 | `prospect.report` | Generate Report | skip: `plan == free` |
| 7 | `prospect.outreach` | Draft Outreach | skip: `role != admin` |

## API & Infrastructure Mapping

Every leaf node has verified working infrastructure. This table maps each step
to the backend call it makes:

### Onboarding
| Step | Backend Call | Verified |
|------|-------------|----------|
| `onboarding.welcome` | None (pure text) | yes |
| `onboarding.auth` | `auth.Login()` → OAuth browser flow | yes |
| `onboarding.status` | State-only (email, plan, role, entitled) | yes |
| `onboarding.services` | `GET /v1/health` on 7 service origins (concurrent) | yes |
| `onboarding.next` | None (menu selection → workflow chain) | yes |

### Trading
| Step | Backend Call | Verified |
|------|-------------|----------|
| `trading.broker` | Alpaca SDK: `New()` + `Connect()` + `GetAccount()` | yes |
| `trading.account` | Alpaca SDK: `GetAccount()` + `GetPositions()` | yes |
| `trading.safety` | Local `config.Save()` (filesystem) | yes |
| `trading.trade` | Alpaca SDK: `CreateOrder()` with lg-order guard | yes |
| `trading.history` | Alpaca SDK: `GetOrders(ctx, "all", 10)` | yes |
| `trading.watch` | Alpaca SDK: `StreamUpdates()` (WebSocket) | yes |
| `trading.signals` | `signal.LoadRulesFromDir()` + `SaveRule()` (YAML fs) | yes |
| `trading.daemon` | `os/exec` fork with TOTP gate | yes |

### Prospect Intelligence
| Step | Backend Call | Verified |
|------|-------------|----------|
| `prospect.credentials` | `PUT /v1/prospect/credentials/:provider` (nvd\|github\|shodan) | yes |
| `prospect.targets` | `GET /v1/prospect/targets?sector=&limit=` | yes |
| `prospect.crawl` | `POST /v1/prospect/targets/:id/crawl` | yes |
| `prospect.leads` | `GET /v1/prospect/leads?target_id=&limit=` | yes |
| `prospect.investigate` | `POST /v1/prospect/leads/:id/investigate` (6-svc pipeline + synthesis) | yes |
| `prospect.report` | `GET /v1/prospect/targets/:id/report?format=latex` + optional pdflatex | yes |
| `prospect.outreach` | `POST /v1/prospect/leads/:id/outreach` + `.../approve` | yes |

### Fixes Applied (2026-02-13)
- `FetchTargets` / `FetchLeads`: response wrapper changed from `targets`/`leads` to `items`
- `LeadSummary`: JSON tags `entity` → `entity_name`, `cvss` → `cvss_score`
- `TriggerAnalysis`: endpoint changed from `/analyze` to `/investigate`
- `AnalysisResult`: rewritten with `Steps[]` + `ClaudeSummary` (synthesis output)
- `SetCredential`: path fixed to include provider in URL, body uses `api_key`
- `DraftOutreach` / `ApproveOutreach`: extracted as proper action functions
- Outreach step: uses `selected_lead_id` (not target ID)
- Credential provider mapping: explicit map (`"GitHub Advisory"` → `"github"`)
- API: `GET /v1/prospect/leads` gained `target_id` query filter

## Cross-Workflow Chaining

After completing Onboarding's "What's Next" step, the engine chains directly
into the selected workflow without returning to the menu:

- **Pro/Enterprise users**: choose "Start Trading" or "Explore Prospects"
- **Free users**: choose "Explore Prospects (free tier)"

The chained workflow's entry guard is checked before entry. If the guard fails
(e.g., trying to chain into Trading without entitlement), the user sees the
block message and returns to the menu.

When any workflow's entry guard blocks (Trading requires login+entitlement,
Prospect requires login), the engine offers to redirect into Onboarding instead.
